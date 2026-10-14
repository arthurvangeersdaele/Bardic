package com.bardic.app.audio

import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File

/** Kotlin side of the native mixer (Oboe + C++). One instance for the whole app. */
object NativeEngine {

    const val MAX_VOICES = 20
    const val MAX_PADS = 128

    // Voice states, mirrored from audio_engine.h
    const val EMPTY = 0
    const val LOADING = 1
    const val READY = 2
    const val PLAYING = 3
    const val PAUSED = 4
    const val ENDING = 5
    const val DONE = 6
    const val PAUSING = 7

    // Loop modes
    const val LOOP_ONCE = 0
    const val LOOP_TWICE = 1
    const val LOOP_INFINITE = 2

    init {
        System.loadLibrary("bardic")
    }

    private var started = false

    /** False when the audio output stream could not be opened: nothing can play. */
    val isRunning: Boolean get() = started

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
        return nativeLoad(slot, pfd.detachFd(), loopMode) // native side now owns and closes the descriptor
    }

    /** Same, from a file in the app storage. Call off the main thread. */
    fun load(file: File, slot: Int, loopMode: Int): Boolean {
        val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        return nativeLoad(slot, pfd.detachFd(), loopMode)
    }

    fun unload(slot: Int) = nativeUnload(slot)
    fun play(slot: Int, fadeInMs: Int = 30) = nativePlay(slot, fadeInMs)
    fun pause(slot: Int) = nativePause(slot)
    fun end(slot: Int, fadeMs: Int = 2000) = nativeEnd(slot, fadeMs)
    fun setVolume(slot: Int, volume: Float) = nativeSetVolume(slot, volume)
    fun setLoop(slot: Int, loopMode: Int) = nativeSetLoop(slot, loopMode)
    fun setMasterVolume(volume: Float) = nativeSetMasterVolume(volume)

    /** Decodes a soundbox effect fully into memory. Returns its duration in seconds, or -1. Call off the main thread. */
    fun loadPad(file: File, index: Int): Float {
        val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        return nativeLoadPad(index, pfd.detachFd())
    }
    fun firePad(index: Int, gain: Float) = nativeFirePad(index, gain)
    fun stopPads() = nativeStopPads()
    /** Frees every soundbox effect. Call off the main thread (waits a few milliseconds for the audio thread). */
    fun clearPads() = nativeClearPads()
    fun setSoundboxVolume(volume: Float) = nativeSetSoundboxVolume(volume)

    fun readStates(out: IntArray) = nativeGetStates(out)
    /** Absolute progress 0..1 including loops, or -1 for an active infinite loop. */
    fun readProgress(out: FloatArray) = nativeGetProgress(out)
    /** out[2i] = seconds played, out[2i+1] = total seconds (-1 infinite, 0 unknown). */
    fun readTimes(out: FloatArray) = nativeGetTimes(out)
    /** [cpu load 0..1, xruns, sample rate, frames per burst, buffer frames, latency ms] */
    fun readStats(out: FloatArray) = nativeGetStats(out)

    private external fun nativeStart(): Boolean
    private external fun nativeStop()
    private external fun nativeLoad(slot: Int, fd: Int, loopMode: Int): Boolean
    private external fun nativeUnload(slot: Int)
    private external fun nativePlay(slot: Int, fadeInMs: Int)
    private external fun nativePause(slot: Int)
    private external fun nativeEnd(slot: Int, fadeMs: Int)
    private external fun nativeSetVolume(slot: Int, volume: Float)
    private external fun nativeSetLoop(slot: Int, loopMode: Int)
    private external fun nativeSetMasterVolume(volume: Float)
    private external fun nativeLoadPad(index: Int, fd: Int): Float
    private external fun nativeFirePad(index: Int, gain: Float)
    private external fun nativeStopPads()
    private external fun nativeClearPads()
    private external fun nativeSetSoundboxVolume(volume: Float)
    private external fun nativeGetStates(out: IntArray)
    private external fun nativeGetProgress(out: FloatArray)
    private external fun nativeGetTimes(out: FloatArray)
    private external fun nativeGetStats(out: FloatArray)
}
