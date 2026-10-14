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
)

fun paletteOf(theme: ThemeName, dark: Boolean): BardicColors {
    fun c(hex: Long) = Color(0xFF000000 or hex)
    val (bg, bar, card, line, text, muted, accent) = if (dark) when (theme) {
        ThemeName.OBSIDIAN -> Seven(0x0F0F13, 0x15151B, 0x1C1C24, 0x2E2E39, 0xECE8DE, 0xA29FAE, 0xE0A84B)
        ThemeName.PARCHMENT -> Seven(0x1E1912, 0x251F16, 0x30281D, 0x4A3D2B, 0xF1E6CF, 0xBBA987, 0xE0B062)
        ThemeName.BLOOD -> Seven(0x140B0C, 0x1A0E10, 0x261517, 0x43242A, 0xF2E4E2, 0xB79A9D, 0xF0606A)
        ThemeName.DIVINATION -> Seven(0x0B1020, 0x0F1529, 0x18213D, 0x2B3762, 0xE6E9F8, 0x9EA6C8, 0xC9A7F5)
    } else when (theme) {
        ThemeName.OBSIDIAN -> Seven(0xF2F1F4, 0xFBFBFC, 0xFFFFFF, 0xDAD8E0, 0x1A1A22, 0x6B6878, 0xB37714)
        ThemeName.PARCHMENT -> Seven(0xF3EAD7, 0xEDE1C8, 0xFBF5E8, 0xD9C7A3, 0x2E2416, 0x7A6A4E, 0xA06A16)
        ThemeName.BLOOD -> Seven(0xF7EDED, 0xF0E1E1, 0xFFF9F9, 0xE2C6CA, 0x2A1416, 0x84636A, 0xB3303B)
        ThemeName.DIVINATION -> Seven(0xECEFFA, 0xE3E8F7, 0xFAFBFF, 0xCBD2EE, 0x141A33, 0x5D6590, 0x7450C2)
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
    val scheme = if (dark) darkColorScheme(
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
