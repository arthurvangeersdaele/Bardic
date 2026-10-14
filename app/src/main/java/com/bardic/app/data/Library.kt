package com.bardic.app.data

import android.content.Context
import com.bardic.app.bardic.LoopMode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream

/**
 * The stories kept on the phone, like the iPhone app's database:
 * one JSON file per story, the shared soundbox, and the audio files ("blobs") they point to.
 * Every function does file work: call them off the main thread.
 */
object Library {
    private lateinit var root: File
    private val storiesDir get() = File(root, "stories")
    val blobsDir: File get() = File(root, "blobs")
    private val sharedFile get() = File(root, "soundbox.json")

    private val _stories = MutableStateFlow<List<Story>>(emptyList())
    /** Every story, most recently changed first. */
    val stories: StateFlow<List<Story>> = _stories

    private val _shared = MutableStateFlow<List<Sound>>(emptyList())
    /** The shared soundbox: quick effects on every table. */
    val shared: StateFlow<List<Sound>> = _shared

    private val lock = Any()

    fun init(context: Context) {
        root = File(context.filesDir, "library")
        storiesDir.mkdirs()
        blobsDir.mkdirs()
    }

    // ------------------------------------------------------------------ reading

    fun reload() = synchronized(lock) {
        val list = storiesDir.listFiles { f -> f.name.endsWith(".json") }.orEmpty().mapNotNull { f ->
            runCatching { storyFrom(JSONObject(f.readText())) }.getOrNull()
        }
        _stories.value = list.sortedByDescending { it.updated }
        _shared.value = if (sharedFile.isFile) {
            runCatching { soundsFrom(JSONObject(sharedFile.readText()).optJSONArray("sounds")) }.getOrDefault(emptyList())
        } else emptyList()
    }

    fun story(uid: String): Story? = _stories.value.firstOrNull { it.uid == uid }

    fun blobFile(key: String): File = File(blobsDir, key)

    /** Bytes used by distinct audio files. */
    fun bytesOf(sounds: List<Sound>): Long {
        val seen = HashSet<String>()
        var total = 0L
        for (s in sounds) if (seen.add(s.blob)) total += if (s.size > 0) s.size else blobFile(s.blob).length()
        return total
    }

    fun totalBytes(): Long = blobsDir.listFiles().orEmpty().sumOf { it.length() }

    // ------------------------------------------------------------------ writing

    /** Saves a story. With [touch], it moves to the front of the library. */
    fun putStory(story: Story, touch: Boolean = true): Story = synchronized(lock) {
        val saved = if (touch) story.copy(updated = System.currentTimeMillis()) else story
        writeAtomic(File(storiesDir, "${saved.uid}.json"), storyJson(saved).toString())
        val others = _stories.value.filter { it.uid != saved.uid }
        _stories.value = (others + saved).sortedByDescending { it.updated }
        saved
    }

    fun deleteStory(uid: String) = synchronized(lock) {
        File(storiesDir, "$uid.json").delete()
        _stories.value = _stories.value.filter { it.uid != uid }
        collect()
    }

    fun setShared(sounds: List<Sound>) = synchronized(lock) {
        writeAtomic(sharedFile, JSONObject().put("sounds", soundsJson(sounds)).toString())
        _shared.value = sounds
        collect()
    }

    /** Copies an audio stream into the storage. Returns its key and size. */
    fun putBlob(input: InputStream, extension: String): Pair<String, Long> {
        val key = "${uid()}.${extension.lowercase().ifBlank { "mp3" }.take(5)}"
        val target = blobFile(key)
        val tmp = File(blobsDir, "$key.part")
        tmp.outputStream().use { out -> input.use { it.copyTo(out, 64 * 1024) } }
        if (!tmp.renameTo(target)) {
            tmp.copyTo(target, overwrite = true)
            tmp.delete()
        }
        return key to target.length()
    }

    /** Moves (or copies) a file into the storage. */
    fun putBlobFile(file: File): Pair<String, Long> {
        val ext = file.name.substringAfterLast('.', "mp3")
        val key = "${uid()}.${ext.lowercase().take(5)}"
        val target = blobFile(key)
        if (!file.renameTo(target)) {
            file.copyTo(target, overwrite = true)
            file.delete()
        }
        return key to target.length()
    }

    /** Deletes audio files no story and no shared effect points to any more. */
    fun collect() = synchronized(lock) {
        val used = HashSet<String>()
        _stories.value.forEach { s -> s.allSounds().forEach { used.add(it.blob) } }
        _shared.value.forEach { used.add(it.blob) }
        val oldParts = System.currentTimeMillis() - 60 * 60 * 1000
        blobsDir.listFiles().orEmpty().forEach { f ->
            val partial = f.name.endsWith(".part")
            if ((!partial && f.name !in used) || (partial && f.lastModified() < oldParts)) f.delete()
        }
    }

    fun wipe() = synchronized(lock) {
        storiesDir.deleteRecursively()
        blobsDir.deleteRecursively()
        sharedFile.delete()
        storiesDir.mkdirs()
        blobsDir.mkdirs()
        _stories.value = emptyList()
        _shared.value = emptyList()
    }

    private fun writeAtomic(file: File, text: String) {
        val tmp = File(file.parentFile, "${file.name}.tmp")
        tmp.writeText(text)
        if (!tmp.renameTo(file)) {
            file.writeText(text)
            tmp.delete()
        }
    }

    // ------------------------------------------------------------------ JSON

    private fun storyJson(s: Story): JSONObject = JSONObject()
        .put("uid", s.uid)
        .put("id", s.id ?: JSONObject.NULL)
        .put("revision", s.revision)
        .put("created", s.created ?: JSONObject.NULL)
        .put("bard", s.bard)
        .put("title", s.title)
        .put("description", s.description)
        .put("source", s.source)
        .put("updated", s.updated)
        .put("extra", JSONObject(s.extra))
        .put("soundbox", soundsJson(s.soundbox))
        .put("chapters", JSONArray().apply {
            s.chapters.forEach { c ->
                put(
                    JSONObject()
                        .put("uid", c.uid)
                        .put("title", c.title)
                        .put("extra", JSONObject(c.extra))
                        .put("music", soundsJson(c.music))
                        .put("ambience", soundsJson(c.ambience))
                        .put("events", soundsJson(c.events))
                )
            }
        })

    private fun storyFrom(o: JSONObject): Story = Story(
        uid = o.getString("uid"),
        id = o.optString("id").takeIf { it.isNotBlank() && it != "null" },
        revision = o.optInt("revision", 0),
        created = o.optString("created").takeIf { it.isNotBlank() && it != "null" },
        bard = o.optString("bard"),
        title = o.optString("title").ifBlank { "Untitled story" },
        description = o.optString("description"),
        source = o.optString("source", "new"),
        updated = o.optLong("updated", 0L),
        extra = (o.optJSONObject("extra") ?: JSONObject()).toString(),
        soundbox = soundsFrom(o.optJSONArray("soundbox")),
        chapters = o.optJSONArray("chapters").objects().map { c ->
            Chapter(
                uid = c.optString("uid").ifBlank { uid() },
                title = c.optString("title"),
                extra = (c.optJSONObject("extra") ?: JSONObject()).toString(),
                music = soundsFrom(c.optJSONArray("music")),
                ambience = soundsFrom(c.optJSONArray("ambience")),
                events = soundsFrom(c.optJSONArray("events")),
            )
        }.ifEmpty { listOf(Chapter(uid(), "Chapter 1")) },
    )

    private fun soundsJson(list: List<Sound>) = JSONArray().apply {
        list.forEach { s ->
            put(
                JSONObject()
                    .put("uid", s.uid)
                    .put("name", s.name)
                    .put("blob", s.blob)
                    .put("fileName", s.fileName)
                    .put("size", s.size)
                    .put("loop", s.loop.json)
                    .put("volume", s.volume.toDouble())
                    .put("duration", s.duration ?: JSONObject.NULL)
                    .put("extra", JSONObject(s.extra))
            )
        }
    }

    private fun soundsFrom(a: JSONArray?): List<Sound> = a.objects().mapNotNull { o ->
        val blob = o.optString("blob")
        if (blob.isBlank()) return@mapNotNull null
        val d = o.optDouble("duration", Double.NaN)
        Sound(
            uid = o.optString("uid").ifBlank { uid() },
            name = o.optString("name").ifBlank { "Sound" },
            blob = blob,
            fileName = o.optString("fileName", "sound.mp3"),
            size = o.optLong("size", 0L),
            loop = LoopMode.from(o.optString("loop")),
            volume = o.optDouble("volume", 0.75).toFloat().coerceIn(0f, 1f),
            duration = if (d.isNaN() || d <= 0) null else d,
            extra = (o.optJSONObject("extra") ?: JSONObject()).toString(),
        )
    }

    private fun JSONArray?.objects(): List<JSONObject> =
        if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }
}
