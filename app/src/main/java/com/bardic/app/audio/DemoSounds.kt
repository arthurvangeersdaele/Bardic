package com.bardic.app.audio

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin
import kotlin.random.Random

/**
 * Generated test sounds, so the engine can be tested without any MP3 on the phone.
 * Written once as 16-bit stereo WAV files in the app cache, then reused.
 */
object DemoSounds {

    private const val RATE = 44100
    private const val SECONDS = 12

    /** Display name to generator. Each generator returns a stereo sample pair in -1..1 for time t (s). */
    private val generators: List<Pair<String, (Double) -> Pair<Double, Double>>> = listOf(
        "Demo drone" to { t ->
            val v = 0.18 * (sin(2 * PI * 110.0 * t) + 0.6 * sin(2 * PI * 164.8 * t) + 0.4 * sin(2 * PI * 220.5 * t))
            v to v * 0.95
        },
        "Demo bells" to { t ->
            val local = t % 1.5
            val env = exp(-local * 3.0)
            val v = 0.35 * env * (sin(2 * PI * 660.0 * t) + 0.5 * sin(2 * PI * 1320.0 * t))
            v * 0.9 to v
        },
        "Demo rain" to rainGenerator(),
        "Demo pulse" to { t ->
            val beat = (t * 2.0) % 1.0
            val env = if (beat < 0.12) 1.0 - beat / 0.12 else 0.0
            val v = 0.4 * env * sin(2 * PI * 196.0 * t)
            v to v
        },
    )

    private fun rainGenerator(): (Double) -> Pair<Double, Double> {
        val random = Random(42)
        var lowL = 0.0
        var lowR = 0.0
        return { _ ->
            // Low-passed white noise, slightly different on each side.
            lowL += 0.08 * (random.nextDouble(-1.0, 1.0) - lowL)
            lowR += 0.08 * (random.nextDouble(-1.0, 1.0) - lowR)
            lowL * 1.6 to lowR * 1.6
        }
    }

    /** Returns the demo files (name to file), creating them on first use. Call off the main thread. */
    fun ensure(context: Context): List<Pair<String, File>> {
        val dir = File(context.cacheDir, "demo-sounds").apply { mkdirs() }
        return generators.mapIndexed { index, (name, generator) ->
            val file = File(dir, "demo_$index.wav")
            if (!file.exists() || file.length() < 1000) writeWav(file, generator)
            name to file
        }
    }

    private fun writeWav(file: File, generator: (Double) -> Pair<Double, Double>) {
        val frames = RATE * SECONDS
        val dataBytes = frames * 4
        val buffer = ByteBuffer.allocate(44 + dataBytes).order(ByteOrder.LITTLE_ENDIAN)
        buffer.put("RIFF".toByteArray()).putInt(36 + dataBytes).put("WAVE".toByteArray())
        buffer.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(2)
            .putInt(RATE).putInt(RATE * 4).putShort(4).putShort(16)
        buffer.put("data".toByteArray()).putInt(dataBytes)
        val fade = RATE / 50 // 20 ms in and out, so loops don't click
        for (i in 0 until frames) {
            val (l, r) = generator(i.toDouble() / RATE)
            val edge = minOf(i, frames - 1 - i).coerceAtMost(fade).toDouble() / fade
            buffer.putShort(toPcm(l * edge)).putShort(toPcm(r * edge))
        }
        val tmp = File(file.parentFile, file.name + ".tmp")
        FileOutputStream(tmp).use { it.write(buffer.array()) }
        tmp.renameTo(file)
    }

    private fun toPcm(v: Double): Short = (v.coerceIn(-1.0, 1.0) * 32767).toInt().toShort()
}
