package com.bardic.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** Obsidian (dark) palette from the mockups. The other themes come in a later step. */
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

@Composable
fun BardicTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Obsidian.Text,
            onPrimary = Obsidian.Background,
            secondary = Obsidian.Music,
            background = Obsidian.Background,
            onBackground = Obsidian.Text,
            surface = Obsidian.Card,
            onSurface = Obsidian.Text,
            surfaceVariant = Obsidian.Bar,
            onSurfaceVariant = Obsidian.Muted,
            outline = Obsidian.Line,
        ),
        content = content,
    )
}
