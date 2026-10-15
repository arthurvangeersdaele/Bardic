package com.bardic.app.bardic

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/** Model of story.json inside a .bardic file. Spec: BARDIC_FORMAT.md at the repo root. */

enum class LoopMode(val json: String) {
    ONCE("once"), TWICE("twice"), INFINITE("infinite"),
    /** Events and ambiances: plays once, then again and again after a random pause (0.5 s to the maximum set in the settings). */
    RANDOM("random");

    /** Loop mode handed to the audio engine: a random event is played once at a time. */
    val engine: Int get() = if (this == RANDOM) 0 else ordinal

    /** The next mode of the loop button: 1×, 2×, ∞, then the random mode where it is allowed (events). */
    fun next(allowRandom: Boolean): LoopMode = when (this) {
        ONCE -> TWICE
        TWICE -> INFINITE
        INFINITE -> if (allowRandom) RANDOM else ONCE
        RANDOM -> ONCE
    }

    companion object {
        fun from(value: String?): LoopMode = values().firstOrNull { it.json == value } ?: ONCE
    }
}

data class BardicSound(
    val name: String,
    val file: String,
    val loop: LoopMode,
    val volume: Double = 0.75,
    val duration: Double? = null,
    /** Fields this version does not know, written back untouched. */
    val extra: JSONObject = JSONObject(),
)

data class BardicChapter(
    val title: String,
    val music: List<BardicSound>,
    val ambience: List<BardicSound>,
    val events: List<BardicSound>,
    val extra: JSONObject = JSONObject(),
)

data class BardicStory(
    /** Stable across revisions, so a newer revision can replace the one already on the phone. */
    val id: String,
    /** Hidden counter: 1 for the first forge, +1 at every export. Never edited by hand. */
    val revision: Int,
    /** Bard name of whoever forged this revision (from the settings). */
    val bard: String,
    val title: String,
    val description: String?,
    val created: String?,
    val forged: String?,
    val chapters: List<BardicChapter>,
    val soundbox: List<BardicSound>,
    val extra: JSONObject = JSONObject(),
) {
    fun allSounds(): List<BardicSound> =
        chapters.flatMap { it.music + it.ambience + it.events } + soundbox

    /** The next revision of this story, signed by [bard]. Used for every export. */
    fun forgedBy(bard: String): BardicStory {
        val now = nowIso()
        return copy(revision = revision + 1, bard = bard.trim(), created = created ?: now, forged = now)
    }

    fun toJson(): JSONObject {
        val o = JSONObject(extra.toString())
        o.put("format", "bardic")
        o.put("version", FORMAT_VERSION)
        o.put("id", id)
        o.put("revision", revision)
        o.put("bard", bard)
        o.put("title", title)
        if (!description.isNullOrBlank()) o.put("description", description)
        if (created != null) o.put("created", created)
        if (forged != null) o.put("forged", forged)
        o.put("generator", "Bardic for Android")
        o.put("chapters", JSONArray().apply {
            chapters.forEach { c ->
                val co = JSONObject(c.extra.toString())
                co.put("title", c.title)
                co.put("music", soundsJson(c.music))
                co.put("ambience", soundsJson(c.ambience))
                co.put("events", soundsJson(c.events))
                put(co)
            }
        })
        o.put("soundbox", soundsJson(soundbox))
        return o
    }

    companion object {
        const val FORMAT_VERSION = 2
        private val STORY_KEYS = setOf(
            "format", "version", "id", "revision", "bard", "author", "title", "description",
            "created", "forged", "generator", "chapters", "soundbox",
        )
        private val CHAPTER_KEYS = setOf("title", "music", "ambience", "events")
        private val SOUND_KEYS = setOf("name", "file", "loop", "volume", "duration")

        fun newId(): String = UUID.randomUUID().toString()

        fun nowIso(): String = Instant.now().truncatedTo(ChronoUnit.SECONDS).toString()

        /** A brand new story: its first export becomes revision 1. */
        fun blank(title: String) = BardicStory(
            id = newId(), revision = 0, bard = "", title = title, description = null,
            created = null, forged = null, chapters = emptyList(), soundbox = emptyList(),
        )

        /** Reads story.json, format 2 or 1 (v1 files get an id and count as revision 1). */
        fun fromJson(o: JSONObject): BardicStory {
            if (o.optString("format") != "bardic") throw BardicFormatException("story.json is not a Bardic story.")
            val version = o.optInt("version", -1)
            if (version != 1 && version != 2) {
                throw BardicFormatException("This file uses format version $version, which this app does not know yet.")
            }
            val v2 = version == 2
            return BardicStory(
                id = if (v2) o.optString("id").ifBlank { newId() } else newId(),
                revision = if (v2) o.optInt("revision", 1).coerceAtLeast(1) else 1,
                bard = (if (v2) o.optString("bard") else o.optString("author")).trim(),
                title = o.optString("title").trim(),
                description = o.optString("description").trim().ifBlank { null },
                created = o.optString("created").ifBlank { null },
                forged = o.optString("forged").ifBlank { null },
                chapters = o.optJSONArray("chapters").objects().map { c ->
                    BardicChapter(
                        title = c.optString("title").trim(),
                        music = c.optJSONArray("music").objects().map(::soundFrom),
                        ambience = c.optJSONArray("ambience").objects().map(::soundFrom),
                        events = c.optJSONArray("events").objects().map(::soundFrom),
                        extra = extras(c, CHAPTER_KEYS),
                    )
                },
                soundbox = o.optJSONArray("soundbox").objects().map(::soundFrom),
                extra = extras(o, STORY_KEYS),
            )
        }

        private fun soundFrom(o: JSONObject): BardicSound {
            val file = o.optString("file")
            if (file.isBlank()) throw BardicFormatException("A sound has no file.")
            val volume = o.optDouble("volume", 0.75)
            val duration = o.optDouble("duration", Double.NaN)
            return BardicSound(
                name = o.optString("name").ifBlank { file.substringAfterLast('/') },
                file = file,
                loop = LoopMode.from(o.optString("loop")),
                volume = if (volume.isNaN()) 0.75 else volume.coerceIn(0.0, 1.0),
                duration = if (duration.isNaN()) null else duration,
                extra = extras(o, SOUND_KEYS),
            )
        }

        private fun soundsJson(list: List<BardicSound>) = JSONArray().apply {
            list.forEach { s ->
                val o = JSONObject(s.extra.toString())
                o.put("name", s.name)
                o.put("file", s.file)
                o.put("loop", s.loop.json)
                o.put("volume", s.volume)
                if (s.duration != null) o.put("duration", s.duration)
                put(o)
            }
        }

        private fun JSONArray?.objects(): List<JSONObject> =
            if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

        private fun extras(o: JSONObject, known: Set<String>): JSONObject {
            val e = JSONObject()
            val keys = o.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                if (k !in known) e.put(k, o.get(k))
            }
            return e
        }
    }
}

class BardicFormatException(message: String) : Exception(message)
