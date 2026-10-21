package com.bardic.app.settings

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Themes. The [special] ones are limited editions, offered until 31 December 2026: choosing one before
 * then collects it on this phone for good. Same rule as the web and iPhone editions (docs/themes.js).
 */
enum class ThemeName(val id: String, val label: String, val special: Boolean = false) {
    OBSIDIAN("obsidian", "Obsidian"), PARCHMENT("parchment", "Parchment"),
    BLOOD("blood", "Blood"), DIVINATION("divination", "Divination"),
    PUMPKIN("pumpkin", "Pumpkin", true), SANTA("santa", "Santa", true), PRIDE("pride", "Pride", true),
    DRAGONFIRE("dragonfire", "Dragonfire", true), ABYSS("abyss", "Abyss", true), EXCALIBUR("excalibur", "Excalibur", true);

    companion object {
        fun from(id: String?) = values().firstOrNull { it.id == id } ?: OBSIDIAN
        /** The limited editions are offered until the night of 31 December 2026. */
        fun specialsOpen(): Boolean = java.time.LocalDate.now().isBefore(java.time.LocalDate.of(2027, 1, 1))
    }
}

/** Volume control on the table cards of a row: none (narrowest cards), two buttons, or a slider. */
enum class VolumeMode(val id: String, val label: String) {
    HIDDEN("hidden", "Hidden"), SIMPLE("simple", "Simple"), FULL("full", "Full");

    companion object {
        fun from(id: String?) = values().firstOrNull { it.id == id } ?: HIDDEN
    }
}

enum class Appearance(val id: String, val label: String) {
    DARK("dark", "Dark"), LIGHT("light", "Light"), SYSTEM("system", "System");

    companion object {
        fun from(id: String?) = values().firstOrNull { it.id == id } ?: DARK
    }
}

/** Settings kept on the phone, observable by the screens. Same choices as the iPhone app. */
class AppSettings(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("bardic.settings", Context.MODE_PRIVATE)

    /** Limited editions collected on this phone. */
    var collected by mutableStateOf(prefs.getStringSet("themesCollected", emptySet()).orEmpty().toSet())
        private set
    var theme by mutableStateOf(ThemeName.from(prefs.getString("theme", null)))
        private set

    /** The themes Settings offers: every everyday theme, and the limited editions still open or collected here. */
    val themes: List<ThemeName> get() = ThemeName.values().filter { !it.special || ThemeName.specialsOpen() || it.id in collected }

    /** The theme to paint: a limited edition no longer offered falls back to Obsidian. */
    val shownTheme: ThemeName get() = if (theme in themes) theme else ThemeName.OBSIDIAN

    private fun collect(t: ThemeName) {
        if (!t.special || t.id in collected || !ThemeName.specialsOpen()) return
        collected = collected + t.id
        prefs.edit().putStringSet("themesCollected", collected).apply()
    }

    init { collect(theme) }
    var appearance by mutableStateOf(Appearance.from(prefs.getString("mode", null)))
        private set
    var fadeMs by mutableIntStateOf(prefs.getInt("fade", 2000))
        private set
    var crossfade by mutableStateOf(prefs.getBoolean("crossfade", true))
        private set
    var keepAwake by mutableStateOf(prefs.getBoolean("awake", true))
        private set
    /** Opening another chapter fades out the sounds of the previous one over 4 s. */
    var silenceChapters by mutableStateOf(prefs.getBoolean("silence", false))
        private set
    var master by mutableFloatStateOf(prefs.getFloat("master", 0.8f))
        private set
    var soundboxVolume by mutableFloatStateOf(prefs.getFloat("sbVol", 0.8f))
        private set
    var soundboxOpen by mutableStateOf(prefs.getBoolean("sbOpen", false))
        private set
    /** Random events: longest pause before a sound plays again, in seconds (1 to 10). The shortest is 0.5 s. */
    var randomMax by mutableIntStateOf(prefs.getInt("randomMax", 5).coerceIn(1, 10))
        private set
    /** Volume on the cards, per row (music, ambience, events): hidden by default. */
    var volMusic by mutableStateOf(VolumeMode.from(prefs.getString("volMusic", null)))
        private set
    var volAmbience by mutableStateOf(VolumeMode.from(prefs.getString("volAmbience", null)))
        private set
    var volEvents by mutableStateOf(VolumeMode.from(prefs.getString("volEvents", null)))
        private set
    /** Lock landscape (on by default); off, the app turns with the phone. */
    var landscape by mutableStateOf(prefs.getBoolean("landscape", true))
        private set
    /** The tip about the website's Story builder, shown on entering the editor until turned off. */
    var forgeTip by mutableStateOf(prefs.getBoolean("forgeTip", true))
        private set
    var pins by mutableStateOf(prefs.getString("pins", "").orEmpty().split(',').filter { it.isNotBlank() })
        private set
    /** GitHub connection (optional): the sign-in token, the GitHub username and the registered bard name. */
    var ghToken by mutableStateOf(prefs.getString(BardSettings.KEY_TOKEN, "").orEmpty())
        private set
    var ghLogin by mutableStateOf(prefs.getString(BardSettings.KEY_LOGIN, "").orEmpty())
        private set
    var ghName by mutableStateOf(prefs.getString(BardSettings.KEY_NAME, "").orEmpty().trim())
        private set
    /** Signs every exported .bardic file: the registered bard name, else Forgotten Barde. */
    val bardName: String get() = ghName.ifBlank { BardSettings.FORGOTTEN }

    fun changeTheme(v: ThemeName) { collect(v); theme = v; prefs.edit().putString("theme", v.id).apply() }
    fun changeAppearance(v: Appearance) { appearance = v; prefs.edit().putString("mode", v.id).apply() }
    fun changeFade(ms: Int) { fadeMs = ms; prefs.edit().putInt("fade", ms).apply() }
    fun changeCrossfade(v: Boolean) { crossfade = v; prefs.edit().putBoolean("crossfade", v).apply() }
    fun changeSilenceChapters(v: Boolean) { silenceChapters = v; prefs.edit().putBoolean("silence", v).apply() }
    fun changeKeepAwake(v: Boolean) { keepAwake = v; prefs.edit().putBoolean("awake", v).apply() }
    fun changeMaster(v: Float) { master = v; prefs.edit().putFloat("master", v).apply() }
    fun changeSoundboxVolume(v: Float) { soundboxVolume = v; prefs.edit().putFloat("sbVol", v).apply() }
    fun changeRandomMax(v: Int) { randomMax = v.coerceIn(1, 10); prefs.edit().putInt("randomMax", randomMax).apply() }
    fun changeVolMusic(v: VolumeMode) { volMusic = v; prefs.edit().putString("volMusic", v.id).apply() }
    fun changeVolAmbience(v: VolumeMode) { volAmbience = v; prefs.edit().putString("volAmbience", v.id).apply() }
    fun changeVolEvents(v: VolumeMode) { volEvents = v; prefs.edit().putString("volEvents", v.id).apply() }
    fun changeLandscape(v: Boolean) { landscape = v; prefs.edit().putBoolean("landscape", v).apply() }
    /** Bardic is now Troubadour: the moving message is no longer shown once the stories have moved. */
    var movedDone by mutableStateOf(prefs.getBoolean("movedDone", false))
        private set
    fun markMovedDone() { movedDone = true; prefs.edit().putBoolean("movedDone", true).apply() }
    fun hideForgeTip() { forgeTip = false; prefs.edit().putBoolean("forgeTip", false).apply() }
    fun changeSoundboxOpen(v: Boolean) { soundboxOpen = v; prefs.edit().putBoolean("sbOpen", v).apply() }
    fun setAccount(token: String, login: String, name: String) {
        ghToken = token
        ghLogin = login
        ghName = name.trim()
        prefs.edit().putString(BardSettings.KEY_TOKEN, token).putString(BardSettings.KEY_LOGIN, login)
            .putString(BardSettings.KEY_NAME, ghName).apply()
    }

    fun clearAccount() = setAccount("", "", "")

    fun togglePin(uid: String) {
        pins = if (uid in pins) pins - uid else pins + uid
        prefs.edit().putString("pins", pins.joinToString(",")).apply()
    }

    fun forgetPins(uids: Collection<String>) {
        if (uids.none { it in pins }) return
        pins = pins.filter { it !in uids }
        prefs.edit().putString("pins", pins.joinToString(",")).apply()
    }
}
