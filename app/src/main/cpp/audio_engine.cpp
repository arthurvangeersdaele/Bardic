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
// Keep decoding while at least this much room is free.
constexpr size_t kChunkFloats = 16384;
constexpr float kGainSmoothing = 0.002f;  // per-sample volume smoothing, avoids clicks
constexpr int kPauseFadeMs = 40;
constexpr int kMaxPadSeconds = 90;        // longer effects are cut, to keep memory in check
}  // namespace

AudioEngine::AudioEngine() {
    for (auto &p : mPads) p.store(nullptr);
    for (auto &f : mFireIndex) f.store(-1);
    for (auto &g : mFireGain) g.store(1.f);
}

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
    clearPads();
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
    if (length <= 0 || AMediaExtractor_setDataSourceFd(v.extractor, fd, 0, length) != AMEDIA_OK) {
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

void AudioEngine::play(int slot, int fadeInMs) {
    if (slot < 0 || slot >= kMaxVoices) return;
    Voice &v = mVoices[slot];
    v.rampInFrames.store(std::max(1, fadeInMs * mOutRate.load() / 1000));
    // Coming back from a fade (ending or pausing): rise again from the current level.
    for (int s : {kEnding, kPausing}) {
        int expected = s;
        if (v.state.compare_exchange_strong(expected, kPlaying)) return;
    }
    // From silence: start at level 0.
    for (int s : {kLoading, kReady, kPaused}) {
        int expected = s;
        if (v.state.compare_exchange_strong(expected, kPlaying)) {
            v.resetLevel.store(true);
            return;
        }
    }
}

void AudioEngine::pause(int slot) {
    if (slot < 0 || slot >= kMaxVoices) return;
    Voice &v = mVoices[slot];
    for (int s : {kPlaying, kEnding}) {
        int expected = s;
        if (v.state.compare_exchange_strong(expected, kPausing)) return;
    }
}

void AudioEngine::end(int slot, int fadeMs) {
    if (slot < 0 || slot >= kMaxVoices) return;
    Voice &v = mVoices[slot];
    v.fadeOutFrames.store(std::max(1, fadeMs * mOutRate.load() / 1000));
    for (int s : {kPlaying, kPausing}) {
        int expected = s;
        if (v.state.compare_exchange_strong(expected, kEnding)) return;
    }
    // Paused or not started: nothing audible to fade, finish right away.
    for (int s : {kPaused, kReady, kLoading}) {
        int expected = s;
        if (v.state.compare_exchange_strong(expected, kDone)) return;
    }
}

void AudioEngine::setVolume(int slot, float volume) {
    if (slot < 0 || slot >= kMaxVoices) return;
    mVoices[slot].volume.store(std::clamp(volume, 0.f, 1.f));
}

void AudioEngine::setLoop(int slot, int loopMode) {
    if (slot < 0 || slot >= kMaxVoices) return;
    Voice &v = mVoices[slot];
    std::lock_guard<std::mutex> lock(v.decodeMutex);
    int old = v.loopMode.exchange(loopMode);
    if (old == loopMode) return;
    // Count the remaining plays from the start of the current pass, like the iPhone app.
    const int64_t perPass = v.framesPerPass.load();
    const int64_t consumed = v.framesConsumed.load();
    if (perPass > 0) v.passBase.store(consumed - (consumed % perPass));
    v.decodedPasses = 0;
    if (loopMode != kOnce && v.decodeFinished.load() && v.state.load() != kEmpty && v.extractor && v.codec) {
        // The decoder had already stopped: let it go round once more.
        AMediaExtractor_seekTo(v.extractor, 0, AMEDIAEXTRACTOR_SEEK_CLOSEST_SYNC);
        AMediaCodec_flush(v.codec);
        v.inputEos = false;
        v.decodedPasses = 1;
        v.decodeFinished.store(false);
    }
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
            int64_t played = v.framesConsumed.load() - v.passBase.load();
            float p = total > 0 ? static_cast<float>(played) / static_cast<float>(total) : 0.f;
            out[i] = std::clamp(p, 0.f, 1.f);
        }
    }
}

void AudioEngine::getTimes(float *out) {
    for (int i = 0; i < kMaxVoices; ++i) {
        Voice &v = mVoices[i];
        const int st = v.state.load();
        const int mode = v.loopMode.load();
        const float rate = static_cast<float>(std::max(1, v.srcRate.load()));
        const int64_t perPass = v.framesPerPass.load();
        if (st == kEmpty) {
            out[2 * i] = 0.f;
            out[2 * i + 1] = 0.f;
        } else if (mode == kInfinite) {
            out[2 * i] = static_cast<float>(v.framesConsumed.load()) / rate;
            out[2 * i + 1] = -1.f;
        } else {
            const int64_t total = perPass * (mode == kTwice ? 2 : 1);
            const int64_t played = std::max<int64_t>(0, v.framesConsumed.load() - v.passBase.load());
            out[2 * i] = static_cast<float>(std::min(played, total)) / rate;
            out[2 * i + 1] = static_cast<float>(total) / rate;
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

// ---------------------------------------------------------------- soundbox (UI / IO threads)

float AudioEngine::loadPad(int index, int fd) {
    if (index < 0 || index >= kMaxPads) {
        if (fd >= 0) close(fd);
        return -1.f;
    }
    auto pad = std::make_unique<Pad>();
    AMediaExtractor *ex = AMediaExtractor_new();
    AMediaCodec *codec = nullptr;
    int channels = 2;
    bool floatPcm = false;
    float duration = -1.f;

    off64_t length = lseek64(fd, 0, SEEK_END);
    lseek64(fd, 0, SEEK_SET);
    bool ok = length > 0 && AMediaExtractor_setDataSourceFd(ex, fd, 0, length) == AMEDIA_OK;
    if (ok) {
        ok = false;
        size_t tracks = AMediaExtractor_getTrackCount(ex);
        for (size_t i = 0; i < tracks && !codec; ++i) {
            AMediaFormat *format = AMediaExtractor_getTrackFormat(ex, i);
            const char *mime = nullptr;
            if (AMediaFormat_getString(format, AMEDIAFORMAT_KEY_MIME, &mime) && mime &&
                strncmp(mime, "audio/", 6) == 0) {
                AMediaExtractor_selectTrack(ex, i);
                int32_t rate = 44100, ch = 2;
                AMediaFormat_getInt32(format, AMEDIAFORMAT_KEY_SAMPLE_RATE, &rate);
                AMediaFormat_getInt32(format, AMEDIAFORMAT_KEY_CHANNEL_COUNT, &ch);
                codec = AMediaCodec_createDecoderByType(mime);
                if (codec && AMediaCodec_configure(codec, format, nullptr, nullptr, 0) == AMEDIA_OK &&
                    AMediaCodec_start(codec) == AMEDIA_OK) {
                    pad->rate = rate;
                    channels = std::max(1, static_cast<int>(ch));
                    ok = true;
                } else if (codec) {
                    AMediaCodec_delete(codec);
                    codec = nullptr;
                }
            }
            AMediaFormat_delete(format);
        }
    }

    if (ok) {
        const size_t maxFloats = static_cast<size_t>(pad->rate) * 2 * kMaxPadSeconds;
        bool inputEos = false, outputEos = false;
        int idle = 0;
        while (!outputEos && idle < 400 && pad->data.size() < maxFloats) {
            bool progressed = false;
            if (!inputEos) {
                ssize_t in = AMediaCodec_dequeueInputBuffer(codec, 5000);
                if (in >= 0) {
                    size_t capacity = 0;
                    uint8_t *buffer = AMediaCodec_getInputBuffer(codec, in, &capacity);
                    ssize_t size = buffer ? AMediaExtractor_readSampleData(ex, buffer, capacity) : -1;
                    if (size < 0) {
                        AMediaCodec_queueInputBuffer(codec, in, 0, 0, 0, AMEDIACODEC_BUFFER_FLAG_END_OF_STREAM);
                        inputEos = true;
                    } else {
                        int64_t time = AMediaExtractor_getSampleTime(ex);
                        AMediaCodec_queueInputBuffer(codec, in, 0, static_cast<size_t>(size),
                                                     time < 0 ? 0 : static_cast<uint64_t>(time), 0);
                        AMediaExtractor_advance(ex);
                    }
                    progressed = true;
                }
            }
            AMediaCodecBufferInfo info;
            ssize_t out = AMediaCodec_dequeueOutputBuffer(codec, &info, 5000);
            if (out >= 0) {
                size_t capacity = 0;
                uint8_t *buffer = AMediaCodec_getOutputBuffer(codec, static_cast<size_t>(out), &capacity);
                if (buffer && info.size > 0) {
                    const uint8_t *data = buffer + info.offset;
                    const size_t sampleBytes = floatPcm ? sizeof(float) : sizeof(int16_t);
                    const size_t frames = static_cast<size_t>(info.size) / (sampleBytes * channels);
                    for (size_t f = 0; f < frames; ++f) {
                        const size_t base = f * channels;
                        float l, r;
                        if (floatPcm) {
                            const float *s = reinterpret_cast<const float *>(data);
                            l = s[base];
                            r = channels > 1 ? s[base + 1] : l;
                        } else {
                            const int16_t *s = reinterpret_cast<const int16_t *>(data);
                            l = s[base] * (1.0f / 32768.0f);
                            r = channels > 1 ? s[base + 1] * (1.0f / 32768.0f) : l;
                        }
                        pad->data.push_back(l);
                        pad->data.push_back(r);
                    }
                }
                AMediaCodec_releaseOutputBuffer(codec, static_cast<size_t>(out), false);
                if (info.flags & AMEDIACODEC_BUFFER_FLAG_END_OF_STREAM) outputEos = true;
                progressed = true;
            } else if (out == AMEDIACODEC_INFO_OUTPUT_FORMAT_CHANGED) {
                AMediaFormat *format = AMediaCodec_getOutputFormat(codec);
                if (format) {
                    int32_t rate = 0, ch = 0, encoding = 2;
                    if (AMediaFormat_getInt32(format, AMEDIAFORMAT_KEY_SAMPLE_RATE, &rate) && rate > 0) pad->rate = rate;
                    if (AMediaFormat_getInt32(format, AMEDIAFORMAT_KEY_CHANNEL_COUNT, &ch) && ch > 0) channels = ch;
                    AMediaFormat_getInt32(format, "pcm-encoding", &encoding);
                    floatPcm = (encoding == 4);
                    AMediaFormat_delete(format);
                }
                progressed = true;
            }
            idle = progressed ? 0 : idle + 1;
        }
        ok = !pad->data.empty();
        if (ok) duration = static_cast<float>(pad->data.size() / 2) / static_cast<float>(pad->rate);
    }

    if (codec) {
        AMediaCodec_stop(codec);
        AMediaCodec_delete(codec);
    }
    AMediaExtractor_delete(ex);
    close(fd);
    if (!ok) return -1.f;

    // Replace whatever was in this pad, with the audio thread looking away.
    Pad *old = mPads[index].load();
    if (old) {
        mPadsEnabled.store(false);
        waitForCallbacks(2);
        mPads[index].store(pad.release());
        mPadsEnabled.store(true);
        delete old;
    } else {
        mPads[index].store(pad.release());
    }
    return duration;
}

void AudioEngine::firePad(int index, float gain) {
    if (index < 0 || index >= kMaxPads || !mPads[index].load()) return;
    uint32_t w = mQueueWrite.load(std::memory_order_relaxed);
    if (w - mQueueRead.load(std::memory_order_acquire) >= kQueue) return;  // queue full: drop
    mFireIndex[w % kQueue].store(index, std::memory_order_relaxed);
    mFireGain[w % kQueue].store(std::clamp(gain, 0.f, 2.f), std::memory_order_relaxed);
    mQueueWrite.store(w + 1, std::memory_order_release);
}

void AudioEngine::stopPads() { mStopShots.store(true); }

void AudioEngine::clearPads() {
    mPadsEnabled.store(false);
    waitForCallbacks(2);
    for (auto &p : mPads) {
        Pad *old = p.exchange(nullptr);
        delete old;
    }
    mPadsEnabled.store(true);
}

void AudioEngine::setSoundboxVolume(float volume) { mSoundbox.store(std::clamp(volume, 0.f, 1.f)); }

void AudioEngine::waitForCallbacks(int count) {
    // Waits until the audio callback has run `count` more times, so it no longer reads old pads.
    bool streaming;
    {
        std::lock_guard<std::mutex> lock(mStreamLock);
        streaming = mStream && mStream->getState() == oboe::StreamState::Started;
    }
    if (!streaming) return;
    const uint64_t target = mCallbacks.load() + static_cast<uint64_t>(count);
    for (int i = 0; i < 100 && mCallbacks.load() < target; ++i) {
        std::this_thread::sleep_for(std::chrono::milliseconds(2));
    }
}

// ---------------------------------------------------------------- decoder thread

void AudioEngine::resetPlayback(Voice &v) {
    v.ring.reset();
    v.inputEos = false;
    v.decodedPasses = 0;
    v.decodeFinished.store(false);
    v.framesConsumed.store(0);
    v.passBase.store(0);
    v.prevL = v.prevR = v.curL = v.curR = 0.f;
    v.frac = 2.0;
    v.gain = 0.f;
    v.level = 0.f;
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

void AudioEngine::mixShots(float *out, int32_t numFrames, int channels, double outRate) {
    if (mStopShots.exchange(false)) {
        for (Shot &s : mShots) s.pad = nullptr;
    }
    if (!mPadsEnabled.load(std::memory_order_acquire)) {
        for (Shot &s : mShots) s.pad = nullptr;
        return;
    }
    // New shots from the UI thread.
    uint32_t r = mQueueRead.load(std::memory_order_relaxed);
    const uint32_t w = mQueueWrite.load(std::memory_order_acquire);
    while (r != w) {
        const int64_t index = mFireIndex[r % kQueue].load(std::memory_order_relaxed);
        const float gain = mFireGain[r % kQueue].load(std::memory_order_relaxed);
        ++r;
        if (index < 0 || index >= kMaxPads) continue;
        const Pad *pad = mPads[index].load(std::memory_order_acquire);
        if (!pad) continue;
        Shot *slot = nullptr;
        for (Shot &s : mShots) if (!s.pad) { slot = &s; break; }
        if (!slot) {  // all busy: replace the one closest to its end
            double best = -1.0;
            for (Shot &s : mShots) {
                const double left = static_cast<double>(s.pad->data.size() / 2) - s.pos;
                if (best < 0 || left < best) { best = left; slot = &s; }
            }
        }
        slot->pad = pad;
        slot->pos = 0.0;
        slot->gain = gain;
    }
    mQueueRead.store(r, std::memory_order_release);

    const float target = mSoundbox.load(std::memory_order_relaxed);
    for (Shot &s : mShots) {
        if (!s.pad) continue;
        const std::vector<float> &d = s.pad->data;
        const size_t frames = d.size() / 2;
        const double step = s.pad->rate / outRate;
        float sbGain = mSoundboxGain;
        for (int i = 0; i < numFrames; ++i) {
            const size_t idx = static_cast<size_t>(s.pos);
            if (idx + 1 >= frames) { s.pad = nullptr; break; }
            const float f = static_cast<float>(s.pos - static_cast<double>(idx));
            const float l = d[2 * idx] + (d[2 * idx + 2] - d[2 * idx]) * f;
            const float rr = d[2 * idx + 1] + (d[2 * idx + 3] - d[2 * idx + 1]) * f;
            sbGain += (target - sbGain) * kGainSmoothing;
            const float g = s.gain * sbGain;
            if (channels >= 2) {
                out[i * channels] += l * g;
                out[i * channels + 1] += rr * g;
            } else {
                out[i] += 0.5f * (l + rr) * g;
            }
            s.pos += step;
        }
    }
    // Volume smoothing state follows the target over the whole buffer.
    mSoundboxGain += (target - mSoundboxGain) * std::min(1.f, kGainSmoothing * static_cast<float>(numFrames));
}

oboe::DataCallbackResult AudioEngine::onAudioReady(oboe::AudioStream *stream, void *audioData,
                                                   int32_t numFrames) {
    const auto started = std::chrono::steady_clock::now();
    float *out = static_cast<float *>(audioData);
    const int channels = stream->getChannelCount();
    const double outRate = stream->getSampleRate();
    std::fill(out, out + static_cast<size_t>(numFrames) * channels, 0.f);
    const int pauseFrames = std::max(1, static_cast<int>(kPauseFadeMs * outRate / 1000));

    for (Voice &v : mVoices) {
        const int st = v.state.load(std::memory_order_acquire);
        if (st != kPlaying && st != kEnding && st != kPausing) continue;
        if (v.resetLevel.exchange(false)) v.level = 0.f;

        const double step = v.srcRate.load(std::memory_order_relaxed) / outRate;
        const float target = v.volume.load(std::memory_order_relaxed);
        const float rise = 1.f / static_cast<float>(std::max(1, v.rampInFrames.load(std::memory_order_relaxed)));
        const float fall = st == kPausing
                ? 1.f / static_cast<float>(pauseFrames)
                : 1.f / static_cast<float>(std::max(1, v.fadeOutFrames.load(std::memory_order_relaxed)));
        int64_t consumed = 0;
        bool finished = false;
        bool silent = false;

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

            if (st == kPlaying) {
                v.level = std::min(1.f, v.level + rise);
            } else {
                v.level -= fall;
                if (v.level <= 0.f) {
                    v.level = 0.f;
                    if (st == kEnding) finished = true; else silent = true;
                    break;
                }
            }

            // Linear interpolation resamples the file's rate to the device rate.
            const float f = static_cast<float>(v.frac);
            const float left = v.prevL + (v.curL - v.prevL) * f;
            const float right = v.prevR + (v.curR - v.prevR) * f;
            v.gain += (target - v.gain) * kGainSmoothing;
            const float g = v.gain * v.level * v.level;  // squared envelope: smoother fades to the ear
            if (channels >= 2) {
                out[i * channels] += left * g;
                out[i * channels + 1] += right * g;
            } else {
                out[i] += 0.5f * (left + right) * g;
            }
            v.frac += step;
        }

        v.framesConsumed.fetch_add(consumed, std::memory_order_relaxed);
        if (finished) {
            int expected = st;
            v.state.compare_exchange_strong(expected, kDone);
        } else if (silent) {
            int expected = kPausing;
            v.state.compare_exchange_strong(expected, kPaused);
        }
    }

    mixShots(out, numFrames, channels, outRate);

    const float master = mMaster.load(std::memory_order_relaxed);
    const size_t samples = static_cast<size_t>(numFrames) * channels;
    for (size_t k = 0; k < samples; ++k) {
        out[k] = std::clamp(out[k] * master, -1.f, 1.f);
    }

    const double elapsed = std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count();
    const double budget = numFrames / outRate;
    const float load = static_cast<float>(elapsed / budget);
    mLoad.store(mLoad.load(std::memory_order_relaxed) * 0.95f + load * 0.05f, std::memory_order_relaxed);
    mCallbacks.fetch_add(1, std::memory_order_release);
    return oboe::DataCallbackResult::Continue;
}

}  // namespace bardic
