package com.bardic.app.settings

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

enum class ThemeName(val id: String, val label: String) {
    OBSIDIAN("obsidian", "Obsidian"), PARCHMENT("parchment", "Parchment"),
    BLOOD("blood", "Blood"), DIVINATION("divination", "Divination");

    companion object {
        fun from(id: String?) = values().firstOrNull { it.id == id } ?: OBSIDIAN
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

    var theme by mutableStateOf(ThemeName.from(prefs.getString("theme", null)))
        private set
    var appearance by mutableStateOf(Appearance.from(prefs.getString("mode", null)))
        private set
    var fadeMs by mutableIntStateOf(prefs.getInt("fade", 2000))
        private set
    var crossfade by mutableStateOf(prefs.getBoolean("crossfade", true))
        private set
    var keepAwake by mutableStateOf(prefs.getBoolean("awake", true))
        private set
    var master by mutableFloatStateOf(prefs.getFloat("master", 0.8f))
        private set
    var soundboxVolume by mutableFloatStateOf(prefs.getFloat("sbVol", 0.8f))
        private set
    var soundboxOpen by mutableStateOf(prefs.getBoolean("sbOpen", false))
        private set
    var pins by mutableStateOf(prefs.getString("pins", "").orEmpty().split(',').filter { it.isNotBlank() })
        private set
    /** Shared with BardSettings: signs every exported .bardic file. */
    var bardName by mutableStateOf(prefs.getString(BardSettings.KEY_BARD_NAME, "").orEmpty().trim())
        private set

    fun changeTheme(v: ThemeName) { theme = v; prefs.edit().putString("theme", v.id).apply() }
    fun changeAppearance(v: Appearance) { appearance = v; prefs.edit().putString("mode", v.id).apply() }
    fun changeFade(ms: Int) { fadeMs = ms; prefs.edit().putInt("fade", ms).apply() }
    fun changeCrossfade(v: Boolean) { crossfade = v; prefs.edit().putBoolean("crossfade", v).apply() }
    fun changeKeepAwake(v: Boolean) { keepAwake = v; prefs.edit().putBoolean("awake", v).apply() }
    fun changeMaster(v: Float) { master = v; prefs.edit().putFloat("master", v).apply() }
    fun changeSoundboxVolume(v: Float) { soundboxVolume = v; prefs.edit().putFloat("sbVol", v).apply() }
    fun changeSoundboxOpen(v: Boolean) { soundboxOpen = v; prefs.edit().putBoolean("sbOpen", v).apply() }
    fun changeBardName(v: String) {
        bardName = v.trim().take(BardSettings.MAX_BARD_NAME)
        prefs.edit().putString(BardSettings.KEY_BARD_NAME, bardName).apply()
    }

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
