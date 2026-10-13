package com.bardic.app.settings

import android.content.Context

/** App settings kept on the phone. The bard name signs every .bardic file the app exports. */
object BardSettings {
    private const val PREFS = "bardic.settings"
    private const val KEY_BARD_NAME = "bard_name"
    const val MAX_BARD_NAME = 60

    fun bardName(context: Context): String =
        prefs(context).getString(KEY_BARD_NAME, "")?.trim().orEmpty()

    fun setBardName(context: Context, name: String) {
        prefs(context).edit().putString(KEY_BARD_NAME, name.trim().take(MAX_BARD_NAME)).apply()
    }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
