package com.bardic.app.audio

import android.content.Context
import android.net.Uri

/** Kotlin side of the native mixer (Oboe + C++). One instance for the whole app. */
object NativeEngine {

    const val MAX_VOICES = 20

    // Voice states, mirrored from audio_engine.h
    const val EMPTY = 0
    const val LOADING = 1
    const val READY = 2
    const val PLAYING = 3
    const val PAUSED = 4
    const val ENDING = 5
    const val DONE = 6

    // Loop modes
    const val LOOP_ONCE = 0
    const val LOOP_TWICE = 1
    const val LOOP_INFINITE = 2

    init {
        System.loadLibrary("bardic")
    }

    private var started = false

    fun start(): Boolean {
        if (!started) started = nativeStart()
        return started
    }

    fun stop() {
        if (started) nativeStop()
        started = false
    }

    /** Opens the file and hands its descriptor to the native decoder. Call off the main thread. */
    fun load(context: Context, slot: Int, uri: Uri, loopMode: Int): Boolean {
        val pfd = context.contentResolver.openFileDescriptor(uri, "r") ?: return false
        val fd = pfd.detachFd() // native side now owns and closes the descriptor
        return nativeLoad(slot, fd, loopMode)
    }

    fun unload(slot: Int) = nativeUnload(slot)
    fun play(slot: Int) = nativePlay(slot)
    fun pause(slot: Int) = nativePause(slot)
    fun end(slot: Int, fadeMs: Int = 2000) = nativeEnd(slot, fadeMs)
    fun setVolume(slot: Int, volume: Float) = nativeSetVolume(slot, volume)
    fun setLoop(slot: Int, loopMode: Int) = nativeSetLoop(slot, loopMode)
    fun setMasterVolume(volume: Float) = nativeSetMasterVolume(volume)

    fun readStates(out: IntArray) = nativeGetStates(out)
    /** Absolute progress 0..1 including loops, or -1 for an active infinite loop. */
    fun readProgress(out: FloatArray) = nativeGetProgress(out)
    /** [cpu load 0..1, xruns, sample rate, frames per burst, buffer frames, latency ms] */
    fun readStats(out: FloatArray) = nativeGetStats(out)

    private external fun nativeStart(): Boolean
    private external fun nativeStop()
    private external fun nativeLoad(slot: Int, fd: Int, loopMode: Int): Boolean
    private external fun nativeUnload(slot: Int)
    private external fun nativePlay(slot: Int)
    private external fun nativePause(slot: Int)
    private external fun nativeEnd(slot: Int, fadeMs: Int)
    private external fun nativeSetVolume(slot: Int, volume: Float)
    private external fun nativeSetLoop(slot: Int, loopMode: Int)
    private external fun nativeSetMasterVolume(volume: Float)
    private external fun nativeGetStates(out: IntArray)
    private external fun nativeGetProgress(out: FloatArray)
    private external fun nativeGetStats(out: FloatArray)
}
