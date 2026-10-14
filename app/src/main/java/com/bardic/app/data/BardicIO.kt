package com.bardic.app.data

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import com.bardic.app.bardic.BardicArchive
import com.bardic.app.bardic.BardicChapter
import com.bardic.app.bardic.BardicFormatException
import com.bardic.app.bardic.BardicSound
import com.bardic.app.bardic.BardicStory
import com.bardic.app.bardic.LoopMode
import com.bardic.app.bardic.UnpackedStory
import org.json.JSONObject
import java.io.File
import java.io.FilterInputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/** Import, export and downloads (Discovery stories, the Recueil). Every function blocks: call off the main thread. */
object BardicIO {

    /** The Bardic site, where the Discovery stories and the Recueil live. */
    const val SITE = "https://arthurvangeersdaele.github.io/Bardic/"
    const val SHARE_LIMIT = 100L * 1024 * 1024

    private val AUDIO_EXT = setOf("mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac")

    // ------------------------------------------------------------------ files picked on the phone

    class Picked(val name: String, val size: Long)

    fun describe(context: Context, uri: Uri): Picked {
        var name = uri.lastPathSegment?.substringAfterLast('/') ?: "sound.mp3"
        var size = -1L
        runCatching {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
                ?.use { c ->
                    if (c.moveToFirst()) {
                        c.getString(0)?.let { name = it }
                        if (!c.isNull(1)) size = c.getLong(1)
                    }
                }
        }
        return Picked(name, size)
    }

    fun isAudio(context: Context, uri: Uri, name: String): Boolean {
        val type = context.contentResolver.getType(uri).orEmpty()
        return type.startsWith("audio/") || name.substringAfterLast('.', "").lowercase() in AUDIO_EXT
    }

    /** Copies a picked audio file into the storage and returns its sound card. */
    fun addAudio(context: Context, uri: Uri, loop: LoopMode): Sound {
        val picked = describe(context, uri)
        val ext = picked.name.substringAfterLast('.', "mp3")
        val input = context.contentResolver.openInputStream(uri) ?: error("Cannot read ${picked.name}.")
        val (key, size) = Library.putBlob(input, ext)
        return Sound(
            uid = uid(), name = cleanName(picked.name).take(80), blob = key, fileName = picked.name,
            size = size, loop = loop, duration = durationOf(Library.blobFile(key)),
        )
    }

    fun durationOf(file: File): Double? {
        val r = MediaMetadataRetriever()
        return try {
            r.setDataSource(file.absolutePath)
            r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
                ?.takeIf { it > 0 }?.let { it / 1000.0 }
        } catch (e: Exception) {
            null
        } finally {
            runCatching { r.release() }
        }
    }

    // ------------------------------------------------------------------ import

    /** Unpacks a .bardic stream into a fresh folder of the cache. */
    fun unpack(context: Context, input: InputStream, total: Long, progress: (Float?) -> Unit): UnpackedStory {
        val dir = File(context.cacheDir, "import/${uid()}")
        val counting = CountingStream(input) { read -> progress(if (total > 0) (read.toFloat() / total).coerceAtMost(1f) else null) }
        return try {
            BardicArchive.unpack(counting, dir)
        } catch (e: java.util.zip.ZipException) {
            dir.deleteRecursively()
            throw BardicFormatException("This file is not a .bardic archive (${e.message}).")
        } catch (e: org.json.JSONException) {
            dir.deleteRecursively()
            throw BardicFormatException("The story.json of this file is damaged.")
        } catch (e: Exception) {
            dir.deleteRecursively()
            throw e
        }
    }

    /**
     * Stores an unpacked story. [replaceUid] replaces that story (same uid, so pins and links keep working);
     * [keepId] false makes a copy that gets a new .bardic id at its next export.
     */
    fun store(unpacked: UnpackedStory, replaceUid: String?, keepId: Boolean, progress: (Int, Int) -> Unit): Story {
        val b = unpacked.story
        if (b.chapters.isEmpty()) throw BardicFormatException("This tale has no chapter.")
        val total = b.allSounds().size
        var n = 0
        val blobOf = HashMap<String, Pair<String, Long>>()
        fun conv(s: BardicSound): Sound {
            progress(++n, total)
            val (key, size) = blobOf.getOrPut(s.file) {
                val f = unpacked.fileFor(s)
                if (!f.isFile) throw BardicFormatException("Missing sound in the archive: ${s.file}")
                Library.putBlobFile(f)
            }
            return Sound(
                uid = uid(), name = s.name.take(80), blob = key, fileName = s.file.substringAfterLast('/'),
                size = size, loop = s.loop, volume = s.volume.toFloat().coerceIn(0f, 1f),
                duration = s.duration, extra = s.extra.toString(),
            )
        }
        try {
            val chapters = b.chapters.mapIndexed { i, c ->
                Chapter(
                    uid = uid(), title = c.title.ifBlank { "Chapter ${i + 1}" }, extra = c.extra.toString(),
                    music = c.music.map(::conv), ambience = c.ambience.map(::conv), events = c.events.map(::conv),
                )
            }
            val soundbox = b.soundbox.map(::conv)
            val story = Story(
                uid = replaceUid ?: uid(),
                id = if (keepId) b.id else null,
                revision = if (keepId) b.revision else 0,
                created = if (keepId) b.created else null,
                bard = b.bard,
                title = b.title.ifBlank { "Untitled tale" },
                description = b.description.orEmpty(),
                chapters = chapters,
                soundbox = soundbox,
                source = "import",
                extra = b.extra.toString(),
            )
            val saved = Library.putStory(story)
            if (replaceUid != null) Library.collect()
            return saved
        } catch (e: Exception) {
            Library.collect()
            throw e
        } finally {
            unpacked.dir.deleteRecursively()
        }
    }

    // ------------------------------------------------------------------ export

    /** Problems that keep a story from being exported, as sentences. */
    fun problems(story: Story): List<String> {
        val out = ArrayList<String>()
        if (story.title.isBlank()) out += "Give the story a title."
        if (story.chapters.isEmpty()) out += "Add at least one chapter."
        story.allSounds().firstOrNull { !Library.blobFile(it.blob).isFile }?.let {
            out += "The sound “${it.name}” is missing from this phone."
        }
        return out
    }

    /** Forges the next revision of [story] as a .bardic file in the cache. Returns the file and the updated story. */
    fun forge(context: Context, story: Story, bard: String): Pair<File, Story> {
        val pathOf = HashMap<String, String>() // blob -> path in the archive
        val blobOf = HashMap<String, String>() // path -> blob
        fun conv(s: Sound, folder: String, index: Int): BardicSound {
            val path = pathOf.getOrPut(s.blob) {
                val ext = s.fileName.substringAfterLast('.', "").ifBlank { s.blob.substringAfterLast('.', "mp3") }.lowercase()
                var p = "sounds/$folder/${index.toString().padStart(2, '0')}-${slug(s.name, "sound")}.$ext"
                var k = 2
                while (blobOf.containsKey(p)) p = p.substringBeforeLast('.') + "-${k++}.$ext"
                blobOf[p] = s.blob
                p
            }
            return BardicSound(
                name = s.name.ifBlank { "Sound" }, file = path, loop = s.loop, volume = s.volume.toDouble(),
                duration = s.duration, extra = JSONObject(s.extra),
            )
        }
        val chapters = story.chapters.mapIndexed { ci, c ->
            BardicChapter(
                title = c.title.ifBlank { "Chapter ${ci + 1}" },
                music = c.music.mapIndexed { i, s -> conv(s, "${ci + 1}/music", i + 1) },
                ambience = c.ambience.mapIndexed { i, s -> conv(s, "${ci + 1}/ambience", i + 1) },
                events = c.events.mapIndexed { i, s -> conv(s, "${ci + 1}/events", i + 1) },
                extra = JSONObject(c.extra),
            )
        }
        val soundbox = story.soundbox.mapIndexed { i, s -> conv(s, "soundbox", i + 1) }
        val base = BardicStory(
            id = story.id ?: BardicStory.newId(),
            revision = story.revision,
            bard = story.bard,
            title = story.title.trim().take(120),
            description = story.description.trim().ifBlank { null },
            created = story.created,
            forged = null,
            chapters = chapters,
            soundbox = soundbox,
            extra = JSONObject(story.extra),
        )
        val forged = base.forgedBy(bard)
        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        val out = File(dir, "${yymmdd()}_${slug(story.title, "story")}.bardic")
        out.outputStream().use { stream ->
            BardicArchive.pack(forged, { s -> Library.blobFile(blobOf.getValue(s.file)) }, stream)
        }
        val updated = story.copy(id = forged.id, revision = forged.revision, created = forged.created, bard = forged.bard)
        return out to updated
    }

    // ------------------------------------------------------------------ network

    fun fetchText(url: String): String {
        val c = open(url)
        try {
            if (c.responseCode !in 200..299) error("The server answered ${c.responseCode}.")
            return c.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
        } finally {
            c.disconnect()
        }
    }

    /** Downloads [url] into [target], reporting the bytes received so far. */
    fun download(url: String, target: File, onBytes: (Long) -> Unit) {
        val c = open(url)
        try {
            if (c.responseCode !in 200..299) error("Download failed (${c.responseCode}).")
            target.parentFile?.mkdirs()
            var got = 0L
            c.inputStream.use { input ->
                target.outputStream().use { out ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val r = input.read(buffer)
                        if (r < 0) break
                        out.write(buffer, 0, r)
                        got += r
                        onBytes(got)
                    }
                }
            }
        } finally {
            c.disconnect()
        }
    }

    private fun open(url: String): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15000
            readTimeout = 30000
            useCaches = false
            setRequestProperty("Cache-Control", "no-cache")
        }

    // Discovery stories: the web edition's three stories.
    class DiscoveryFile(val name: String, val file: String, val size: Long)
    class DiscoveryChapter(val title: String, val zones: Map<Zone, List<DiscoveryFile>>)
    class DiscoveryStory(val id: String, val title: String, val blurb: String, val chapters: List<DiscoveryChapter>) {
        val files get() = chapters.flatMap { c -> c.zones.values.flatten() }
    }
    class Discovery(val stories: List<DiscoveryStory>, val soundbox: List<DiscoveryFile>)

    fun fetchDiscovery(): Discovery {
        val stories = JSONObject(fetchText("${SITE}play/stories.json"))
        val library = JSONObject(fetchText("${SITE}play/library.json"))
        val chapters = library.optJSONObject("chapters") ?: JSONObject()
        fun files(a: org.json.JSONArray?): List<DiscoveryFile> =
            if (a == null) emptyList() else (0 until a.length()).mapNotNull { a.optJSONObject(it) }.map {
                DiscoveryFile(it.optString("name", "Sound"), it.getString("file"), it.optLong("size", 0))
            }
        val list = stories.optJSONArray("stories")
        val out = ArrayList<DiscoveryStory>()
        for (i in 0 until (list?.length() ?: 0)) {
            val s = list!!.getJSONObject(i)
            val id = s.getString("id")
            val chs = s.optJSONArray("chapters")
            val cl = ArrayList<DiscoveryChapter>()
            for (j in 0 until (chs?.length() ?: 0)) {
                val c = chs!!.getJSONObject(j)
                val z = chapters.optJSONObject("$id/${c.getString("id")}") ?: JSONObject()
                cl += DiscoveryChapter(c.optString("title"), Zone.values().associateWith { files(z.optJSONArray(it.id)) })
            }
            out += DiscoveryStory(id, s.optString("title"), s.optString("blurb"), cl)
        }
        return Discovery(out, files(library.optJSONArray("soundbox")))
    }

    fun addDiscovery(context: Context, meta: DiscoveryStory, discovery: Discovery, progress: (String, Float) -> Unit): Story {
        val shared = Library.shared.value
        val sharedWeb = shared.mapNotNull { runCatching { JSONObject(it.extra).optString("web") }.getOrNull() }.toSet()
        val sbJobs = discovery.soundbox.filter { it.file !in sharedWeb }
        val total = meta.files.size + sbJobs.size
        val totalBytes = (meta.files + sbJobs).sumOf { it.size }.coerceAtLeast(1)
        var doneBytes = 0L
        var n = 0
        val tmp = File(context.cacheDir, "download").apply { mkdirs() }
        fun fetch(f: DiscoveryFile): Pair<String, Long> {
            val target = File(tmp, "${uid()}.${f.file.substringAfterLast('.', "mp3")}")
            val before = doneBytes
            download("${SITE}play/${f.file}", target) { got ->
                doneBytes = before + got
                progress("Sound ${n + 1} of $total, ${formatSize(doneBytes)} of ${formatSize(totalBytes)}", doneBytes.toFloat() / totalBytes)
            }
            n++
            return Library.putBlobFile(target)
        }
        try {
            val chapters = meta.chapters.map { c ->
                var ch = Chapter(uid(), c.title)
                for ((zone, files) in c.zones) {
                    ch = ch.with(zone, files.map { f ->
                        val (key, size) = fetch(f)
                        Sound(uid(), f.name, key, f.file.substringAfterLast('/'), size, zone.defaultLoop)
                    })
                }
                ch
            }
            val added = sbJobs.map { f ->
                val (key, size) = fetch(f)
                Sound(uid(), f.name, key, f.file.substringAfterLast('/'), size, LoopMode.ONCE, extra = JSONObject().put("web", f.file).toString())
            }
            val story = Story(
                uid = uid(), bard = "Bardic", title = meta.title, description = meta.blurb,
                chapters = chapters, source = "discovery:${meta.id}",
            )
            if (added.isNotEmpty()) Library.setShared(Library.shared.value + added)
            return Library.putStory(story)
        } catch (e: Exception) {
            Library.collect()
            throw e
        } finally {
            tmp.deleteRecursively()
        }
    }

    // The Recueil: tales forged by the Compagnie des bardes.
    class Tale(
        val file: String, val title: String, val id: String, val bard: String, val revision: Int,
        val description: String, val chapters: Int, val sounds: Int, val size: Long,
    )

    fun fetchRecueil(): List<Tale> {
        val o = JSONObject(fetchText("${SITE}recueil/index.json"))
        val a = o.optJSONArray("tales") ?: return emptyList()
        return (0 until a.length()).mapNotNull { a.optJSONObject(it) }.map {
            Tale(
                file = it.getString("file"), title = it.optString("title", "Tale"), id = it.optString("id"),
                bard = it.optString("bard"), revision = it.optInt("revision", 1), description = it.optString("description"),
                chapters = it.optJSONArray("chapters")?.length() ?: 0, sounds = it.optInt("sounds", 0), size = it.optLong("size", 0),
            )
        }.sortedBy { it.title.lowercase() }
    }

    fun downloadTale(context: Context, tale: Tale, onBytes: (Long) -> Unit): File {
        val target = File(context.cacheDir, "download/${uid()}.bardic")
        download("${SITE}recueil/${Uri.encode(tale.file)}", target, onBytes)
        return target
    }

    private class CountingStream(input: InputStream, val onRead: (Long) -> Unit) : FilterInputStream(input) {
        private var count = 0L
        private var lastReport = 0L
        private fun add(n: Int) {
            if (n <= 0) return
            count += n
            if (count - lastReport > 256 * 1024) {
                lastReport = count
                onRead(count)
            }
        }
        override fun read(): Int = super.read().also { if (it >= 0) add(1) }
        override fun read(b: ByteArray, off: Int, len: Int): Int = super.read(b, off, len).also { add(it) }
        override fun skip(n: Long): Long = super.skip(n).also { add(it.toInt()) }
    }
}
