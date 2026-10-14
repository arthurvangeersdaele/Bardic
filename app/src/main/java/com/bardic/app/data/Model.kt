package com.bardic.app.data

import com.bardic.app.bardic.LoopMode
import java.util.UUID

/** The three rows of the mixing table. */
enum class Zone(
    val id: String,
    val label: String,
    val defaultLoop: LoopMode,
    val empty: String,
    val hint: String,
) {
    MUSIC("music", "Music", LoopMode.INFINITE, "No music in this chapter yet.", "Add music: one track plays at a time"),
    AMBIENCE("ambience", "Ambience", LoopMode.INFINITE, "No ambience in this chapter yet.", "Add ambiences: rain, fire, crowds"),
    EVENTS("events", "Events", LoopMode.ONCE, "No events in this chapter yet.", "Add events: bells, roars, explosions"),
}

/** A sound card. [blob] is the name of its audio file in the app storage (several cards may share one). */
data class Sound(
    val uid: String,
    val name: String,
    val blob: String,
    val fileName: String,
    val size: Long,
    val loop: LoopMode,
    val volume: Float = 0.75f,
    val duration: Double? = null,
    /** Unknown .bardic fields, kept as JSON text and written back on export. */
    val extra: String = "{}",
)

data class Chapter(
    val uid: String,
    val title: String,
    val music: List<Sound> = emptyList(),
    val ambience: List<Sound> = emptyList(),
    val events: List<Sound> = emptyList(),
    val extra: String = "{}",
) {
    fun sounds(zone: Zone): List<Sound> = when (zone) {
        Zone.MUSIC -> music
        Zone.AMBIENCE -> ambience
        Zone.EVENTS -> events
    }

    fun with(zone: Zone, list: List<Sound>): Chapter = when (zone) {
        Zone.MUSIC -> copy(music = list)
        Zone.AMBIENCE -> copy(ambience = list)
        Zone.EVENTS -> copy(events = list)
    }

    val soundCount: Int get() = music.size + ambience.size + events.size
}

data class Story(
    val uid: String,
    /** .bardic id: null until the first export. */
    val id: String? = null,
    val revision: Int = 0,
    val created: String? = null,
    val bard: String = "",
    val title: String,
    val description: String = "",
    val chapters: List<Chapter>,
    val soundbox: List<Sound> = emptyList(),
    /** Where the story came from: "new", "import", "discovery:<id>". */
    val source: String = "new",
    val updated: Long = System.currentTimeMillis(),
    val extra: String = "{}",
) {
    fun allSounds(): List<Sound> = chapters.flatMap { it.music + it.ambience + it.events } + soundbox
}

fun uid(): String = UUID.randomUUID().toString().replace("-", "").take(16)

/** "03_tavern-hearth.mp3" becomes "Tavern hearth". */
fun cleanName(fileName: String?): String {
    val base = (fileName ?: "Sound").substringBeforeLast('.')
        .replace(Regex("^\\d+[\\s._-]+"), "")
        .replace(Regex("[_-]+"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()
    return base.replaceFirstChar { it.uppercase() }.ifBlank { "Sound" }
}

fun plural(n: Int, word: String, many: String = "${word}s"): String = "$n ${if (n == 1) word else many}"

fun formatSize(bytes: Long): String = when {
    bytes >= 1_000_000_000 -> String.format("%.1f GB", bytes / 1e9)
    bytes >= 10_000_000 -> "${(bytes / 1e6).toInt()} MB"
    bytes >= 1_000_000 -> String.format("%.1f MB", bytes / 1e6)
    bytes >= 1_000 -> "${(bytes / 1e3).toInt()} KB"
    else -> "$bytes B"
}

fun formatTime(seconds: Double): String {
    val s = kotlin.math.ceil(seconds).toInt().coerceAtLeast(0)
    return "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
}

fun slug(text: String, fallback: String): String {
    val s = java.text.Normalizer.normalize(text, java.text.Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "")
        .lowercase()
        .replace(Regex("[^a-z0-9]+"), "-")
        .trim('-')
        .take(48)
    return s.ifBlank { fallback }
}

fun yymmdd(): String = java.text.SimpleDateFormat("yyMMdd", java.util.Locale.ROOT).format(java.util.Date())
