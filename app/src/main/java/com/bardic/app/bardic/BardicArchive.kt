package com.bardic.app.bardic

import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/** A story unpacked on the phone: each sound's `file` path points to a copy inside [dir]. */
class UnpackedStory(val story: BardicStory, val dir: File) {
    fun fileFor(sound: BardicSound): File = File(dir, sound.file)
}

/** Reads and writes .bardic archives (a ZIP with story.json and the audio, stored entries). */
object BardicArchive {
    private const val STORY_JSON = "story.json"

    /** Unpacks a .bardic stream into [dir], which is emptied first. Call off the main thread. */
    fun unpack(input: InputStream, dir: File): UnpackedStory {
        dir.deleteRecursively()
        dir.mkdirs()
        val root = dir.canonicalPath + File.separator
        var storyJson: String? = null
        ZipInputStream(input.buffered()).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                if (entry.isDirectory) continue
                if (entry.name == STORY_JSON) {
                    storyJson = zip.readBytes().toString(Charsets.UTF_8)
                    continue
                }
                val target = File(dir, entry.name).canonicalFile
                if (!target.path.startsWith(root)) throw BardicFormatException("Unsafe path in the archive: ${entry.name}")
                target.parentFile?.mkdirs()
                target.outputStream().use { zip.copyTo(it) }
            }
        }
        val json = storyJson ?: throw BardicFormatException("This .bardic file has no story.json.")
        val story = BardicStory.fromJson(JSONObject(json))
        story.allSounds().forEach {
            if (!File(dir, it.file).isFile) throw BardicFormatException("Missing sound in the archive: ${it.file}")
        }
        return UnpackedStory(story, dir)
    }

    /** Writes [story] and its sounds as a .bardic archive. Call off the main thread. */
    fun pack(story: BardicStory, fileFor: (BardicSound) -> File, output: OutputStream) {
        ZipOutputStream(output.buffered()).use { zip ->
            zip.setMethod(ZipOutputStream.STORED)
            val json = story.toJson().toString(2).toByteArray(Charsets.UTF_8)
            putStored(zip, STORY_JSON, json.size.toLong(), CRC32().apply { update(json) }.value) { it.write(json) }
            val written = HashSet<String>()
            for (sound in story.allSounds()) {
                if (!written.add(sound.file)) continue
                val file = fileFor(sound)
                putStored(zip, sound.file, file.length(), crcOf(file)) { out -> file.inputStream().use { it.copyTo(out) } }
            }
        }
    }

    private fun putStored(zip: ZipOutputStream, name: String, size: Long, crc: Long, write: (OutputStream) -> Unit) {
        val entry = ZipEntry(name).apply {
            method = ZipEntry.STORED
            this.size = size
            compressedSize = size
            this.crc = crc
        }
        zip.putNextEntry(entry)
        write(zip)
        zip.closeEntry()
    }

    private fun crcOf(file: File): Long {
        val crc = CRC32()
        val buffer = ByteArray(64 * 1024)
        file.inputStream().use { input ->
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                crc.update(buffer, 0, read)
            }
        }
        return crc.value
    }
}
