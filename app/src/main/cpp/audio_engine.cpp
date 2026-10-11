#include "audio_engine.h"

#include <android/log.h>
#include <unistd.h>

#include <algorithm>
#include <chrono>
#include <cstring>

#define LOG_TAG "BardicEngine"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace bardic {

namespace {
// Two seconds of stereo audio at 48 kHz per voice (~770 KB). The first part of
// every loaded sound is decoded ahead of time, so Play starts instantly.
constexpr size_t kRingFloats = 48000 * 2 * 2;
// Keep decoding while at least this much room is free (covers the largest
// decoder output buffer we expect).
constexpr size_t kChunkFloats = 16384;
constexpr float kGainSmoothing = 0.002f;  // per-sample volume smoothing, avoids clicks
}  // namespace

AudioEngine &AudioEngine::get() {
    static AudioEngine engine;
    return engine;
}

// ---------------------------------------------------------------- lifecycle

bool AudioEngine::start() {
    if (mRunning.load()) return true;
    mScratch.resize(kChunkFloats * 2);
    mRunning.store(true);
    mDecoder = std::thread([this] { decoderLoop(); });
    std::lock_guard<std::mutex> lock(mStreamLock);
    return openStream();
}

void AudioEngine::stop() {
    if (!mRunning.load()) return;
    mRunning.store(false);
    if (mDecoder.joinable()) mDecoder.join();
    {
        std::lock_guard<std::mutex> lock(mStreamLock);
        if (mStream) {
            mStream->stop();
            mStream->close();
            mStream.reset();
        }
    }
    for (int i = 0; i < kMaxVoices; ++i) unload(i);
}

bool AudioEngine::openStream() {
    oboe::AudioStreamBuilder builder;
    builder.setDirection(oboe::Direction::Output)
            ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
            ->setSharingMode(oboe::SharingMode::Exclusive)
            ->setFormat(oboe::AudioFormat::Float)
            ->setChannelCount(oboe::ChannelCount::Stereo)
            ->setUsage(oboe::Usage::Media)
            ->setContentType(oboe::ContentType::Music)
            ->setDataCallback(this)
            ->setErrorCallback(this);

    oboe::Result result = builder.openStream(mStream);
    if (result != oboe::Result::OK) {
        LOGE("openStream failed: %s", oboe::convertToText(result));
        return false;
    }
    // Two bursts: low latency with a safety margin against glitches.
    mStream->setBufferSizeInFrames(mStream->getFramesPerBurst() * 2);
    mOutRate.store(mStream->getSampleRate());
    LOGI("Stream open: %d Hz, burst %d, api %d", mStream->getSampleRate(),
         mStream->getFramesPerBurst(), static_cast<int>(mStream->getAudioApi()));
    return mStream->requestStart() == oboe::Result::OK;
}

void AudioEngine::onErrorAfterClose(oboe::AudioStream *, oboe::Result error) {
    // Typically headphones (un)plugged or Bluetooth connected: reopen on the new device.
    LOGI("Stream closed (%s), reopening", oboe::convertToText(error));
    std::lock_guard<std::mutex> lock(mStreamLock);
    if (mRunning.load()) openStream();
}

// ---------------------------------------------------------------- control (UI thread)

bool AudioEngine::load(int slot, int fd, int loopMode) {
    if (slot < 0 || slot >= kMaxVoices) {
        if (fd >= 0) close(fd);
        return false;
    }
    Voice &v = mVoices[slot];
    std::lock_guard<std::mutex> lock(v.decodeMutex);
    v.state.store(kEmpty);
    releaseResources(v);
    if (!v.ring.allocated()) v.ring.allocate(kRingFloats);

    off64_t length = lseek64(fd, 0, SEEK_END);
    lseek64(fd, 0, SEEK_SET);
    v.fd = fd;
    v.extractor = AMediaExtractor_new();
    if (AMediaExtractor_setDataSourceFd(v.extractor, fd, 0, length) != AMEDIA_OK) {
        LOGE("slot %d: cannot read file", slot);
        releaseResources(v);
        return false;
    }

    size_t tracks = AMediaExtractor_getTrackCount(v.extractor);
    for (size_t i = 0; i < tracks && !v.codec; ++i) {
        AMediaFormat *format = AMediaExtractor_getTrackFormat(v.extractor, i);
        const char *mime = nullptr;
        if (AMediaFormat_getString(format, AMEDIAFORMAT_KEY_MIME, &mime) && mime &&
            strncmp(mime, "audio/", 6) == 0) {
            AMediaExtractor_selectTrack(v.extractor, i);
            int32_t rate = 44100, channels = 2;
            int64_t duration = 0;
            AMediaFormat_getInt32(format, AMEDIAFORMAT_KEY_SAMPLE_RATE, &rate);
            AMediaFormat_getInt32(format, AMEDIAFORMAT_KEY_CHANNEL_COUNT, &channels);
            AMediaFormat_getInt64(format, AMEDIAFORMAT_KEY_DURATION, &duration);
            v.codec = AMediaCodec_createDecoderByType(mime);
            if (v.codec && AMediaCodec_configure(v.codec, format, nullptr, nullptr, 0) == AMEDIA_OK &&
                AMediaCodec_start(v.codec) == AMEDIA_OK) {
                v.srcRate.store(rate);
                v.srcChannels = channels;
                v.floatPcm = false;
                v.durationUs = duration;
                v.framesPerPass.store(duration * rate / 1000000);
            } else if (v.codec) {
                AMediaCodec_delete(v.codec);
                v.codec = nullptr;
            }
        }
        AMediaFormat_delete(format);
    }
    if (!v.codec) {
        LOGE("slot %d: no decodable audio track", slot);
        releaseResources(v);
        return false;
    }

    v.loopMode.store(loopMode);
    resetPlayback(v);
    v.state.store(kLoading);
    return true;
}

void AudioEngine::unload(int slot) {
    if (slot < 0 || slot >= kMaxVoices) return;
    Voice &v = mVoices[slot];
    std::lock_guard<std::mutex> lock(v.decodeMutex);
    v.state.store(kEmpty);
    releaseResources(v);
}

void AudioEngine::play(int slot) {
    if (slot < 0 || slot >= kMaxVoices) return;
    Voice &v = mVoices[slot];
    for (int s : {kLoading, kReady, kPaused}) {
        int expected = s;
        if (v.state.compare_exchange_strong(expected, kPlaying)) return;
    }
}

void AudioEngine::pause(int slot) {
    if (slot < 0 || slot >= kMaxVoices) return;
    int expected = kPlaying;
    mVoices[slot].state.compare_exchange_strong(expected, kPaused);
}

void AudioEngine::end(int slot, int fadeMs) {
    if (slot < 0 || slot >= kMaxVoices) return;
    Voice &v = mVoices[slot];
    int frames = std::max(1, fadeMs * mOutRate.load() / 1000);
    int expected = kPlaying;
    v.fadeTotal.store(frames);
    v.fadeLeft.store(frames);
    if (v.state.compare_exchange_strong(expected, kEnding)) return;
    // Paused or not started: nothing audible to fade, finish right away.
    for (int s : {kPaused, kReady, kLoading}) {
        expected = s;
        if (v.state.compare_exchange_strong(expected, kDone)) return;
    }
}

void AudioEngine::setVolume(int slot, float volume) {
    if (slot < 0 || slot >= kMaxVoices) return;
    mVoices[slot].volume.store(std::clamp(volume, 0.f, 1.f));
}

void AudioEngine::setLoop(int slot, int loopMode) {
    if (slot < 0 || slot >= kMaxVoices) return;
    mVoices[slot].loopMode.store(loopMode);
}

void AudioEngine::setMasterVolume(float volume) { mMaster.store(std::clamp(volume, 0.f, 1.f)); }

void AudioEngine::getStates(int32_t *out) {
    for (int i = 0; i < kMaxVoices; ++i) out[i] = mVoices[i].state.load();
}

void AudioEngine::getProgress(float *out) {
    for (int i = 0; i < kMaxVoices; ++i) {
        Voice &v = mVoices[i];
        int st = v.state.load();
        int mode = v.loopMode.load();
        if (st == kEmpty) {
            out[i] = 0.f;
        } else if (mode == kInfinite) {
            out[i] = -1.f;  // UI shows a full electric-blue bar
        } else {
            int64_t total = v.framesPerPass.load() * (mode == kTwice ? 2 : 1);
            float p = total > 0 ? static_cast<float>(v.framesConsumed.load()) / static_cast<float>(total) : 0.f;
            out[i] = std::clamp(p, 0.f, 1.f);
        }
    }
}

void AudioEngine::getStats(float *out) {
    std::lock_guard<std::mutex> lock(mStreamLock);
    out[0] = mLoad.load();
    out[1] = out[2] = out[3] = out[4] = 0.f;
    out[5] = -1.f;
    if (!mStream) return;
    auto xruns = mStream->getXRunCount();
    out[1] = xruns ? static_cast<float>(xruns.value()) : -1.f;
    out[2] = static_cast<float>(mStream->getSampleRate());
    out[3] = static_cast<float>(mStream->getFramesPerBurst());
    out[4] = static_cast<float>(mStream->getBufferSizeInFrames());
    auto latency = mStream->calculateLatencyMillis();
    out[5] = latency ? static_cast<float>(latency.value()) : -1.f;
}

// ---------------------------------------------------------------- decoder thread

void AudioEngine::resetPlayback(Voice &v) {
    v.ring.reset();
    v.inputEos = false;
    v.decodedPasses = 0;
    v.decodeFinished.store(false);
    v.framesConsumed.store(0);
    v.prevL = v.prevR = v.curL = v.curR = 0.f;
    v.frac = 2.0;  // the first output sample pulls two frames from the ring
    v.gain = 0.f;  // short fade-in from silence, no click
}

void AudioEngine::releaseResources(Voice &v) {
    if (v.codec) {
        AMediaCodec_stop(v.codec);
        AMediaCodec_delete(v.codec);
        v.codec = nullptr;
    }
    if (v.extractor) {
        AMediaExtractor_delete(v.extractor);
        v.extractor = nullptr;
    }
    if (v.fd >= 0) {
        close(v.fd);
        v.fd = -1;
    }
}

void AudioEngine::rewind(Voice &v) {
    AMediaExtractor_seekTo(v.extractor, 0, AMEDIAEXTRACTOR_SEEK_CLOSEST_SYNC);
    AMediaCodec_flush(v.codec);
    resetPlayback(v);
    v.state.store(kLoading);
}

void AudioEngine::decoderLoop() {
    while (mRunning.load()) {
        bool didWork = false;
        for (Voice &v : mVoices) {
            std::unique_lock<std::mutex> lock(v.decodeMutex, std::try_to_lock);
            if (!lock.owns_lock()) continue;
            int st = v.state.load();
            if (st == kEmpty || !v.codec) continue;
            if (st == kDone) {
                // Finished sounds are rewound and pre-filled again, ready for the next Play.
                rewind(v);
                didWork = true;
                continue;
            }
            if (decodeSome(v)) didWork = true;
            if (st == kLoading && (v.ring.writable() < kChunkFloats || v.decodeFinished.load())) {
                int expected = kLoading;
                v.state.compare_exchange_strong(expected, kReady);
            }
        }
        if (!didWork) std::this_thread::sleep_for(std::chrono::milliseconds(3));
    }
}

bool AudioEngine::decodeSome(Voice &v) {
    bool didWork = false;
    for (int iteration = 0; iteration < 8; ++iteration) {
        if (v.decodeFinished.load() || v.ring.writable() < kChunkFloats) break;
        bool progressed = false;

        if (!v.inputEos) {
            ssize_t in = AMediaCodec_dequeueInputBuffer(v.codec, 0);
            if (in >= 0) {
                size_t capacity = 0;
                uint8_t *buffer = AMediaCodec_getInputBuffer(v.codec, in, &capacity);
                ssize_t size = buffer ? AMediaExtractor_readSampleData(v.extractor, buffer, capacity) : -1;
                if (size < 0) {
                    AMediaCodec_queueInputBuffer(v.codec, in, 0, 0, 0, AMEDIACODEC_BUFFER_FLAG_END_OF_STREAM);
                    v.inputEos = true;
                } else {
                    int64_t time = AMediaExtractor_getSampleTime(v.extractor);
                    AMediaCodec_queueInputBuffer(v.codec, in, 0, static_cast<size_t>(size),
                                                 time < 0 ? 0 : static_cast<uint64_t>(time), 0);
                    AMediaExtractor_advance(v.extractor);
                }
                progressed = true;
            }
        }

        AMediaCodecBufferInfo info;
        ssize_t out = AMediaCodec_dequeueOutputBuffer(v.codec, &info, 0);
        if (out >= 0) {
            size_t capacity = 0;
            uint8_t *buffer = AMediaCodec_getOutputBuffer(v.codec, static_cast<size_t>(out), &capacity);
            if (buffer && info.size > 0) pushPcm(v, buffer + info.offset, static_cast<size_t>(info.size));
            AMediaCodec_releaseOutputBuffer(v.codec, static_cast<size_t>(out), false);
            progressed = true;
            if (info.flags & AMEDIACODEC_BUFFER_FLAG_END_OF_STREAM) {
                int mode = v.loopMode.load();
                bool again = mode == kInfinite || (mode == kTwice && v.decodedPasses == 0);
                if (again) {
                    // Seamless loop: restart decoding while the ring still holds the tail.
                    v.decodedPasses++;
                    AMediaExtractor_seekTo(v.extractor, 0, AMEDIAEXTRACTOR_SEEK_CLOSEST_SYNC);
                    AMediaCodec_flush(v.codec);
                    v.inputEos = false;
                } else {
                    v.decodeFinished.store(true);
                }
            }
        } else if (out == AMEDIACODEC_INFO_OUTPUT_FORMAT_CHANGED) {
            readOutputFormat(v);
            progressed = true;
        }

        if (!progressed) break;
        didWork = true;
    }
    return didWork;
}

void AudioEngine::readOutputFormat(Voice &v) {
    AMediaFormat *format = AMediaCodec_getOutputFormat(v.codec);
    if (!format) return;
    int32_t rate = 0, channels = 0, encoding = 2;
    if (AMediaFormat_getInt32(format, AMEDIAFORMAT_KEY_SAMPLE_RATE, &rate) && rate > 0) {
        v.srcRate.store(rate);
        v.framesPerPass.store(v.durationUs * rate / 1000000);
    }
    if (AMediaFormat_getInt32(format, AMEDIAFORMAT_KEY_CHANNEL_COUNT, &channels) && channels > 0) {
        v.srcChannels = channels;
    }
    // "pcm-encoding": 2 = 16-bit integer (default), 4 = float.
    AMediaFormat_getInt32(format, "pcm-encoding", &encoding);
    v.floatPcm = (encoding == 4);
    AMediaFormat_delete(format);
}

void AudioEngine::pushPcm(Voice &v, const uint8_t *data, size_t bytes) {
    const int channels = std::max(1, v.srcChannels);
    const size_t sampleBytes = v.floatPcm ? sizeof(float) : sizeof(int16_t);
    const size_t frames = bytes / (sampleBytes * channels);
    size_t frame = 0;
    while (frame < frames) {
        const size_t batch = std::min(frames - frame, mScratch.size() / 2);
        for (size_t i = 0; i < batch; ++i) {
            const size_t base = (frame + i) * channels;
            float l, r;
            if (v.floatPcm) {
                const float *s = reinterpret_cast<const float *>(data);
                l = s[base];
                r = channels > 1 ? s[base + 1] : l;
            } else {
                const int16_t *s = reinterpret_cast<const int16_t *>(data);
                l = s[base] * (1.0f / 32768.0f);
                r = channels > 1 ? s[base + 1] * (1.0f / 32768.0f) : l;
            }
            mScratch[2 * i] = l;
            mScratch[2 * i + 1] = r;
        }
        v.ring.write(mScratch.data(), batch * 2);
        frame += batch;
    }
}

// ---------------------------------------------------------------- audio thread

oboe::DataCallbackResult AudioEngine::onAudioReady(oboe::AudioStream *stream, void *audioData,
                                                   int32_t numFrames) {
    const auto started = std::chrono::steady_clock::now();
    float *out = static_cast<float *>(audioData);
    const int channels = stream->getChannelCount();
    const double outRate = stream->getSampleRate();
    std::fill(out, out + static_cast<size_t>(numFrames) * channels, 0.f);

    for (Voice &v : mVoices) {
        const int st = v.state.load(std::memory_order_acquire);
        if (st != kPlaying && st != kEnding) continue;

        const double step = v.srcRate.load(std::memory_order_relaxed) / outRate;
        const float target = v.volume.load(std::memory_order_relaxed);
        const int fadeTotal = std::max(1, v.fadeTotal.load(std::memory_order_relaxed));
        int fadeLeft = v.fadeLeft.load(std::memory_order_relaxed);
        int64_t consumed = 0;
        bool finished = false;

        for (int i = 0; i < numFrames; ++i) {
            bool starved = false;
            while (v.frac >= 1.0) {
                float l, r;
                if (!v.ring.readFrame(l, r)) {
                    starved = true;
                    break;
                }
                v.prevL = v.curL;
                v.prevR = v.curR;
                v.curL = l;
                v.curR = r;
                v.frac -= 1.0;
                ++consumed;
            }
            if (starved) {
                if (v.decodeFinished.load(std::memory_order_acquire) && v.ring.readable() == 0) finished = true;
                break;  // decoder is behind: this voice is silent for the rest of the buffer
            }

            // Linear interpolation resamples the file's rate to the device rate.
            const float f = static_cast<float>(v.frac);
            const float left = v.prevL + (v.curL - v.prevL) * f;
            const float right = v.prevR + (v.curR - v.prevR) * f;
            v.gain += (target - v.gain) * kGainSmoothing;
            float g = v.gain;
            if (st == kEnding) {
                if (fadeLeft <= 0) {
                    finished = true;
                    break;
                }
                g *= static_cast<float>(fadeLeft) / static_cast<float>(fadeTotal);
                --fadeLeft;
            }
            if (channels >= 2) {
                out[i * channels] += left * g;
                out[i * channels + 1] += right * g;
            } else {
                out[i] += 0.5f * (left + right) * g;
            }
            v.frac += step;
        }

        v.framesConsumed.fetch_add(consumed, std::memory_order_relaxed);
        if (st == kEnding) v.fadeLeft.store(fadeLeft, std::memory_order_relaxed);
        if (finished) {
            int expected = st;
            v.state.compare_exchange_strong(expected, kDone);
        }
    }

    const float master = mMaster.load(std::memory_order_relaxed);
    const size_t samples = static_cast<size_t>(numFrames) * channels;
    for (size_t k = 0; k < samples; ++k) {
        out[k] = std::clamp(out[k] * master, -1.f, 1.f);
    }

    // CPU load = time spent mixing / duration of the buffer.
    const double elapsed = std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count();
    const double budget = numFrames / outRate;
    const float load = static_cast<float>(elapsed / budget);
    mLoad.store(mLoad.load(std::memory_order_relaxed) * 0.95f + load * 0.05f, std::memory_order_relaxed);
    return oboe::DataCallbackResult::Continue;
}

}  // namespace bardic
