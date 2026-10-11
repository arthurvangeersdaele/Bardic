#pragma once

#include <oboe/Oboe.h>
#include <media/NdkMediaCodec.h>
#include <media/NdkMediaExtractor.h>

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>

namespace bardic {

constexpr int kMaxVoices = 20;

// Lifecycle of a voice. Written by the control thread (UI), the decoder thread
// and the audio thread, always through atomics.
enum VoiceState : int {
    kEmpty = 0,    // nothing loaded
    kLoading = 1,  // decoder is pre-filling the ring buffer
    kReady = 2,    // pre-filled, waiting for play
    kPlaying = 3,
    kPaused = 4,
    kEnding = 5,   // fading out, then kDone
    kDone = 6      // finished; decoder rewinds it back to kLoading / kReady
};

// Loop modes, same order as the UI: once, twice, infinite.
enum LoopMode : int { kOnce = 0, kTwice = 1, kInfinite = 2 };

// Single-producer (decoder thread) / single-consumer (audio thread) ring of
// interleaved stereo float samples. Counters grow forever; index = counter % capacity.
class RingBuffer {
public:
    void allocate(size_t capacity) {
        mBuffer.assign(capacity, 0.0f);
        mCapacity = capacity;
        reset();
    }
    bool allocated() const { return mCapacity > 0; }
    void reset() {
        mWrite.store(0, std::memory_order_relaxed);
        mRead.store(0, std::memory_order_relaxed);
    }
    size_t readable() const {
        return mWrite.load(std::memory_order_acquire) - mRead.load(std::memory_order_acquire);
    }
    size_t writable() const {
        return mCapacity - (mWrite.load(std::memory_order_relaxed) - mRead.load(std::memory_order_acquire));
    }
    // Producer side. Writes at most writable() samples, returns how many were written.
    size_t write(const float *data, size_t count) {
        size_t space = writable();
        if (count > space) count = space - (space % 2);
        size_t w = mWrite.load(std::memory_order_relaxed);
        for (size_t i = 0; i < count; ++i) mBuffer[(w + i) % mCapacity] = data[i];
        mWrite.store(w + count, std::memory_order_release);
        return count;
    }
    // Consumer side. Reads one stereo frame.
    bool readFrame(float &left, float &right) {
        size_t r = mRead.load(std::memory_order_relaxed);
        if (mWrite.load(std::memory_order_acquire) - r < 2) return false;
        left = mBuffer[r % mCapacity];
        right = mBuffer[(r + 1) % mCapacity];
        mRead.store(r + 2, std::memory_order_release);
        return true;
    }

private:
    std::vector<float> mBuffer;
    size_t mCapacity = 0;
    std::atomic<size_t> mWrite{0};
    std::atomic<size_t> mRead{0};
};

struct Voice {
    std::mutex decodeMutex;  // held by the decoder thread and by load/unload, never by audio
    std::atomic<int> state{kEmpty};

    // Decoder-side resources (guarded by decodeMutex).
    int fd = -1;
    AMediaExtractor *extractor = nullptr;
    AMediaCodec *codec = nullptr;
    int srcChannels = 2;
    bool floatPcm = false;
    int64_t durationUs = 0;
    bool inputEos = false;
    int decodedPasses = 0;  // how many times the decoder looped back to the start

    std::atomic<int> srcRate{44100};
    std::atomic<int64_t> framesPerPass{0};
    std::atomic<bool> decodeFinished{false};
    std::atomic<int> loopMode{kOnce};

    RingBuffer ring;

    // Audio-thread state (only touched by the audio thread while playing,
    // or by the decoder thread while the voice is kLoading / kDone / kEmpty).
    float prevL = 0.f, prevR = 0.f, curL = 0.f, curR = 0.f;
    double frac = 2.0;
    float gain = 0.f;

    std::atomic<float> volume{0.8f};
    std::atomic<int> fadeTotal{1};
    std::atomic<int> fadeLeft{0};
    std::atomic<int64_t> framesConsumed{0};
};

class AudioEngine : public oboe::AudioStreamDataCallback,
                    public oboe::AudioStreamErrorCallback {
public:
    static AudioEngine &get();

    bool start();
    void stop();

    bool load(int slot, int fd, int loopMode);
    void unload(int slot);
    void play(int slot);
    void pause(int slot);
    void end(int slot, int fadeMs);
    void setVolume(int slot, float volume);
    void setLoop(int slot, int loopMode);
    void setMasterVolume(float volume);

    void getStates(int32_t *out);
    void getProgress(float *out);
    // out[0] callback CPU load (0..1), out[1] xruns, out[2] sample rate,
    // out[3] frames per burst, out[4] buffer size in frames, out[5] latency ms.
    void getStats(float *out);

    oboe::DataCallbackResult onAudioReady(oboe::AudioStream *stream, void *audioData,
                                          int32_t numFrames) override;
    void onErrorAfterClose(oboe::AudioStream *stream, oboe::Result error) override;

private:
    AudioEngine() = default;
    bool openStream();
    void decoderLoop();
    bool decodeSome(Voice &v);
    void pushPcm(Voice &v, const uint8_t *data, size_t bytes);
    void readOutputFormat(Voice &v);
    void rewind(Voice &v);
    void resetPlayback(Voice &v);
    void releaseResources(Voice &v);

    Voice mVoices[kMaxVoices];
    std::shared_ptr<oboe::AudioStream> mStream;
    std::mutex mStreamLock;
    std::atomic<float> mMaster{0.8f};
    std::atomic<float> mLoad{0.f};
    std::atomic<int> mOutRate{48000};
    std::atomic<bool> mRunning{false};
    std::thread mDecoder;
    std::vector<float> mScratch;  // decoder thread only
};

}  // namespace bardic
