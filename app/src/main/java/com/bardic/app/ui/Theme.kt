package com.bardic.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.bardic.app.R
import com.bardic.app.settings.Appearance
import com.bardic.app.settings.ThemeName

/** The colours of a theme, the same tokens as the web and iPhone editions (docs/play/style.css). */
@Immutable
data class BardicColors(
    val bg: Color, val bar: Color, val card: Color, val line: Color,
    val text: Color, val muted: Color, val accent: Color,
    val music: Color, val amb: Color, val evt: Color, val blue: Color, val onZ: Color,
    val dark: Boolean,
    /** Pride: the flag runs along the top bar. */
    val rainbow: Boolean = false,
)

/** The pride flag, for the top bar of the Pride theme. */
val PrideFlag = listOf(0xFFE40303, 0xFFFF8C00, 0xFFFFED00, 0xFF008026, 0xFF004DFF, 0xFF750787).map { Color(it) }

fun paletteOf(theme: ThemeName, dark: Boolean): BardicColors {
    fun c(hex: Long) = Color(0xFF000000 or hex)
    // Limited editions: one look whatever the appearance (same colours as docs/play/style.css).
    fun special(bg: Long, bar: Long, card: Long, line: Long, text: Long, muted: Long, accent: Long,
                music: Long, amb: Long, evt: Long, blue: Long, onZ: Long, isDark: Boolean = true, rainbow: Boolean = false) =
        BardicColors(c(bg), c(bar), c(card), c(line), c(text), c(muted), c(accent), c(music), c(amb), c(evt), c(blue), c(onZ), isDark, rainbow)
    when (theme) {
        ThemeName.PUMPKIN -> return special(0x120C08, 0x1A110B, 0x24170F, 0x46301E, 0xF6E7D4, 0xBC9F84, 0xFF8A1E, 0xFF8A1E, 0x8BD450, 0xB66BF0, 0xFFB347, 0x120C08)
        ThemeName.SANTA -> return special(0x0B1811, 0x0F1F16, 0x16291E, 0x2A4634, 0xF5F2EA, 0xA9BCAE, 0xE6B84E, 0xE6B84E, 0xA9DCF0, 0xE5484D, 0xA9DCF0, 0x0B1811)
        ThemeName.PRIDE -> return special(0xD9EFFB, 0xE9F6FD, 0xFFFFFF, 0xB5DAF0, 0x13233A, 0x4D6985, 0x7A35D8, 0xE8590C, 0x0B8F3E, 0xD61F69, 0x1F5FE0, 0xFFFFFF, isDark = false, rainbow = true)
        ThemeName.DRAGONFIRE -> return special(0x130705, 0x1B0A07, 0x28110B, 0x4E2315, 0xF9E7D9, 0xC49C87, 0xFF5A1F, 0xFFB238, 0xB9A397, 0xFF3B2F, 0xFFD166, 0x130705)
        ThemeName.ABYSS -> return special(0x020A13, 0x05101C, 0x0A192A, 0x163049, 0xDCF4F8, 0x7EA3B6, 0x2EE6D6, 0x2EE6D6, 0x4C86FF, 0xC76BFF, 0x4C86FF, 0x020A13)
        ThemeName.EXCALIBUR -> return special(0x0D1310, 0x121A15, 0x1A241D, 0x2F3E33, 0xEEF2EC, 0xA3AFA4, 0xC8D7E2, 0xDCC37A, 0x7FBF8E, 0x72A9DE, 0x72A9DE, 0x0D1310)
        else -> {}
    }
    val (bg, bar, card, line, text, muted, accent) = if (dark) when (theme) {
        ThemeName.OBSIDIAN -> Seven(0x0F0F13, 0x15151B, 0x1C1C24, 0x2E2E39, 0xECE8DE, 0xA29FAE, 0xE0A84B)
        ThemeName.PARCHMENT -> Seven(0x1E1912, 0x251F16, 0x30281D, 0x4A3D2B, 0xF1E6CF, 0xBBA987, 0xE0B062)
        ThemeName.BLOOD -> Seven(0x140B0C, 0x1A0E10, 0x261517, 0x43242A, 0xF2E4E2, 0xB79A9D, 0xF0606A)
        ThemeName.DIVINATION -> Seven(0x0B1020, 0x0F1529, 0x18213D, 0x2B3762, 0xE6E9F8, 0x9EA6C8, 0xC9A7F5)
        else -> Seven(0x0F0F13, 0x15151B, 0x1C1C24, 0x2E2E39, 0xECE8DE, 0xA29FAE, 0xE0A84B)
    } else when (theme) {
        ThemeName.OBSIDIAN -> Seven(0xF2F1F4, 0xFBFBFC, 0xFFFFFF, 0xDAD8E0, 0x1A1A22, 0x6B6878, 0xB37714)
        ThemeName.PARCHMENT -> Seven(0xF3EAD7, 0xEDE1C8, 0xFBF5E8, 0xD9C7A3, 0x2E2416, 0x7A6A4E, 0xA06A16)
        ThemeName.BLOOD -> Seven(0xF7EDED, 0xF0E1E1, 0xFFF9F9, 0xE2C6CA, 0x2A1416, 0x84636A, 0xB3303B)
        ThemeName.DIVINATION -> Seven(0xECEFFA, 0xE3E8F7, 0xFAFBFF, 0xCBD2EE, 0x141A33, 0x5D6590, 0x7450C2)
        else -> Seven(0xF2F1F4, 0xFBFBFC, 0xFFFFFF, 0xDAD8E0, 0x1A1A22, 0x6B6878, 0xB37714)
    }
    return if (dark) BardicColors(
        c(bg), c(bar), c(card), c(line), c(text), c(muted), c(accent),
        c(0xE0A84B), c(0x4FB3A5), c(0xE06A63), c(0x2F8BFF), c(bg), true,
    ) else BardicColors(
        c(bg), c(bar), c(card), c(line), c(text), c(muted), c(accent),
        c(0xB37714), c(0x1F857A), c(0xC2443D), c(0x1F6FE0), Color.White, false,
    )
}

private data class Seven(val a: Long, val b: Long, val c: Long, val d: Long, val e: Long, val f: Long, val g: Long)

val Cormorant = FontFamily(Font(R.font.cormorant_sc_bold, FontWeight.Bold))
val Barlow = FontFamily(
    Font(R.font.barlow_sc_regular, FontWeight.Normal),
    Font(R.font.barlow_sc_medium, FontWeight.Medium),
    Font(R.font.barlow_sc_semibold, FontWeight.SemiBold),
)

val LocalColors = staticCompositionLocalOf { paletteOf(ThemeName.OBSIDIAN, true) }

/** Shortcut for the current palette inside composables. */
val C: BardicColors
    @Composable get() = LocalColors.current

fun titleStyle(size: Int) = TextStyle(fontFamily = Cormorant, fontWeight = FontWeight.Bold, fontSize = size.sp)

@Composable
fun BardicTheme(theme: ThemeName, appearance: Appearance, content: @Composable () -> Unit) {
    val dark = when (appearance) {
        Appearance.DARK -> true
        Appearance.LIGHT -> false
        Appearance.SYSTEM -> isSystemInDarkTheme()
    }
    val p = paletteOf(theme, dark)
    val scheme = if (p.dark) darkColorScheme(
        primary = p.accent, onPrimary = p.onZ, background = p.bg, onBackground = p.text,
        surface = p.card, onSurface = p.text, surfaceVariant = p.bar, onSurfaceVariant = p.muted, outline = p.line,
    ) else lightColorScheme(
        primary = p.accent, onPrimary = p.onZ, background = p.bg, onBackground = p.text,
        surface = p.card, onSurface = p.text, surfaceVariant = p.bar, onSurfaceVariant = p.muted, outline = p.line,
    )
    val type = MaterialTheme.typography.let { t ->
        t.copy(
            bodyLarge = t.bodyLarge.copy(fontFamily = Barlow),
            bodyMedium = t.bodyMedium.copy(fontFamily = Barlow),
            bodySmall = t.bodySmall.copy(fontFamily = Barlow),
            labelLarge = t.labelLarge.copy(fontFamily = Barlow),
            labelMedium = t.labelMedium.copy(fontFamily = Barlow),
            labelSmall = t.labelSmall.copy(fontFamily = Barlow),
            titleMedium = t.titleMedium.copy(fontFamily = Barlow),
        )
    }
    CompositionLocalProvider(LocalColors provides p) {
        MaterialTheme(colorScheme = scheme, typography = type, content = content)
    }
}

/** Kept for the engine test screen. */
object Obsidian {
    val Background = Color(0xFF0F0F13)
    val Bar = Color(0xFF15151B)
    val Card = Color(0xFF1C1C24)
    val Line = Color(0xFF2E2E39)
    val Text = Color(0xFFECE8DE)
    val Muted = Color(0xFFA29FAE)
    val Music = Color(0xFFE0A84B)
    val Ambience = Color(0xFF4FB3A5)
    val Events = Color(0xFFE06A63)
    val ElectricBlue = Color(0xFF2F8BFF)
}
