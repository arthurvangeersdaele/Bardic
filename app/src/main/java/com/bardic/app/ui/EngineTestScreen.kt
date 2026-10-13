package com.bardic.app.ui

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bardic.app.audio.NativeEngine
import com.bardic.app.bardic.BardicArchive
import com.bardic.app.bardic.LoopMode
import com.bardic.app.bardic.UnpackedStory
import com.bardic.app.settings.BardSettings
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.abs
import kotlin.math.roundToInt

/** What the UI reads from the engine ~15 times per second. */
private class EngineSnapshot(val states: IntArray, val progress: FloatArray, val stats: FloatArray)

private val ZoneColors = listOf(Obsidian.Music, Obsidian.Ambience, Obsidian.Events)
private val LoopLabels = listOf("1×", "2×", "∞")

/**
 * Step 1 prototype: 20 sound slots driven by the native mixer, plus live engine stats,
 * to check that 20 simultaneous MP3s play without glitches on a real phone.
 */
@Composable
fun EngineTestScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val n = NativeEngine.MAX_VOICES

    val names = remember { mutableStateListOf<String?>().apply { repeat(n) { add(null) } } }
    val loops = remember { mutableStateListOf<Int>().apply { repeat(n) { add(NativeEngine.LOOP_ONCE) } } }
    val volumes = remember { mutableStateListOf<Float>().apply { repeat(n) { add(0.5f) } } }
    var master by remember { mutableFloatStateOf(0.8f) }
    var loading by remember { mutableStateOf(false) }
    var snapshot by remember {
        mutableStateOf(EngineSnapshot(IntArray(n), FloatArray(n), FloatArray(6)))
    }
    var story by remember { mutableStateOf<UnpackedStory?>(null) }
    var status by remember { mutableStateOf<String?>(null) }
    var settingsOpen by remember { mutableStateOf(false) }
    var exportAfterSettings by remember { mutableStateOf(false) }

    // Opens a .bardic file and loads its first 20 sounds into the slots, with their loop mode and volume.
    val openBardic = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        loading = true
        status = "Opening the story…"
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val input = context.contentResolver.openInputStream(uri) ?: error("Cannot read this file.")
                    input.use { BardicArchive.unpack(it, File(context.filesDir, "stories/current")) }
                }
            }
            result.onSuccess { unpacked ->
                story = unpacked
                val sounds = unpacked.story.allSounds()
                for (slot in 0 until n) {
                    val sound = sounds.getOrNull(slot)
                    if (sound == null) {
                        NativeEngine.unload(slot)
                        names[slot] = null
                        continue
                    }
                    val loop = when (sound.loop) {
                        LoopMode.ONCE -> NativeEngine.LOOP_ONCE
                        LoopMode.TWICE -> NativeEngine.LOOP_TWICE
                        LoopMode.INFINITE -> NativeEngine.LOOP_INFINITE
                    }
                    val volume = sound.volume.toFloat().coerceIn(0f, 1f)
                    loops[slot] = loop
                    volumes[slot] = volume
                    val ok = withContext(Dispatchers.IO) {
                        val loaded = runCatching {
                            NativeEngine.load(context, slot, Uri.fromFile(unpacked.fileFor(sound)), loop)
                        }.getOrDefault(false)
                        NativeEngine.setVolume(slot, volume)
                        loaded
                    }
                    names[slot] = if (ok) sound.name else "Unreadable file"
                }
                val s = unpacked.story
                val more = if (sounds.size > n) " (first $n of ${sounds.size} sounds loaded)" else ""
                status = "${s.title}, by ${s.bard.ifBlank { "an unknown bard" }}, revision ${s.revision}$more"
            }.onFailure { status = "Could not open this file: ${it.message}" }
            loading = false
        }
    }

    // Exports the open story as its next revision, signed with the bard name from the settings.
    val exportBardic = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { uri ->
        val current = story
        if (uri == null || current == null) return@rememberLauncherForActivityResult
        scope.launch {
            val forged = current.story.forgedBy(BardSettings.bardName(context))
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val output = context.contentResolver.openOutputStream(uri) ?: error("Cannot write this file.")
                    output.use { BardicArchive.pack(forged, current::fileFor, it) }
                }
            }
            result.onSuccess {
                story = UnpackedStory(forged, current.dir)
                status = "${forged.title} exported: revision ${forged.revision}, signed by ${forged.bard}"
            }.onFailure { status = "Export failed: ${it.message}" }
        }
    }

    fun startExport() {
        val current = story ?: return
        if (BardSettings.bardName(context).isBlank()) {
            exportAfterSettings = true
            settingsOpen = true
            return
        }
        exportBardic.launch(fileNameFor(current.story.title))
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        loading = true
        scope.launch {
            // The picked files are spread over the 20 slots (the same file can be used several times).
            for (slot in 0 until n) {
                val uri = uris[slot % uris.size]
                val loop = loops[slot]
                val volume = volumes[slot]
                val name = withContext(Dispatchers.IO) {
                    val ok = runCatching { NativeEngine.load(context, slot, uri, loop) }.getOrDefault(false)
                    NativeEngine.setVolume(slot, volume)
                    if (ok) displayName(context, uri) else "Unreadable file"
                }
                names[slot] = name
            }
            loading = false
        }
    }

    LaunchedEffect(Unit) {
        val states = IntArray(n)
        val progress = FloatArray(n)
        val stats = FloatArray(6)
        while (true) {
            NativeEngine.readStates(states)
            NativeEngine.readProgress(progress)
            NativeEngine.readStats(stats)
            snapshot = EngineSnapshot(states.copyOf(), progress.copyOf(), stats.copyOf())
            delay(66)
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(Obsidian.Background)
            .safeDrawingPadding()
    ) {
        // Top bar: actions and master volume
        Row(
            Modifier
                .fillMaxWidth()
                .background(Obsidian.Bar)
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Bardic", color = Obsidian.Text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text("engine test", color = Obsidian.Muted, fontSize = 13.sp)
            BarButton(if (loading) "Loading…" else "Pick MP3s", filled = true) {
                if (!loading) picker.launch(arrayOf("audio/*"))
            }
            BarButton("Play all") {
                for (i in 0 until n) if (snapshot.states[i] != NativeEngine.EMPTY) NativeEngine.play(i)
            }
            BarButton("Pause all") { for (i in 0 until n) NativeEngine.pause(i) }
            BarButton("End all") { for (i in 0 until n) NativeEngine.end(i, 2000) }
            BarButton("Open .bardic") { if (!loading) openBardic.launch(arrayOf("*/*")) }
            if (story != null) BarButton("Export .bardic") { startExport() }
            BarButton("Settings") { settingsOpen = true }
            Text("Master", color = Obsidian.Muted, fontSize = 13.sp)
            Slider(
                value = master,
                onValueChange = {
                    master = it
                    NativeEngine.setMasterVolume(it)
                },
                modifier = Modifier.width(140.dp),
                colors = SliderDefaults.colors(
                    thumbColor = Obsidian.Text,
                    activeTrackColor = Obsidian.Text,
                    inactiveTrackColor = Obsidian.Line,
                ),
            )
        }

        StatsRow(snapshot)

        status?.let {
            Text(
                it,
                color = Obsidian.Text,
                fontSize = 13.sp,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp),
            )
        }

        if (names.all { it == null }) {
            Text(
                "Pick one or more MP3 files: they are spread over the 20 slots. Then press Play all and watch the CPU and XRuns.",
                color = Obsidian.Muted,
                fontSize = 13.sp,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(4),
            contentPadding = PaddingValues(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            items(n) { slot ->
                val state = snapshot.states[slot]
                SlotCard(
                    slot = slot,
                    name = names[slot],
                    state = state,
                    progress = snapshot.progress[slot],
                    loop = loops[slot],
                    volume = volumes[slot],
                    onToggle = {
                        if (state == NativeEngine.PLAYING) NativeEngine.pause(slot) else NativeEngine.play(slot)
                    },
                    onEnd = { NativeEngine.end(slot, 2000) },
                    onLoop = {
                        val next = (loops[slot] + 1) % 3
                        loops[slot] = next
                        NativeEngine.setLoop(slot, next)
                    },
                    onVolume = {
                        volumes[slot] = it
                        NativeEngine.setVolume(slot, it)
                    },
                )
            }
        }
    }

    if (settingsOpen) {
        SettingsDialog(
            initialBardName = BardSettings.bardName(context),
            onSave = { name ->
                BardSettings.setBardName(context, name)
                settingsOpen = false
                if (exportAfterSettings) {
                    exportAfterSettings = false
                    startExport()
                }
            },
            onDismiss = {
                settingsOpen = false
                exportAfterSettings = false
            },
        )
    }
}

@Composable
private fun StatsRow(snapshot: EngineSnapshot) {
    val stats = snapshot.stats
    val cpu = (stats[0] * 100).roundToInt()
    val active = snapshot.states.count { it == NativeEngine.PLAYING || it == NativeEngine.ENDING }
    val loaded = snapshot.states.count { it != NativeEngine.EMPTY }
    val cpuColor = when {
        stats[0] > 0.6f -> Obsidian.Events
        stats[0] > 0.35f -> Obsidian.Music
        else -> Obsidian.Ambience
    }
    val latency = if (stats[5] >= 0) "${stats[5].roundToInt()} ms" else "n/a"
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Stat("Mix CPU", "$cpu %", cpuColor)
        Stat("XRuns", stats[1].roundToInt().toString(), if (stats[1] > 0) Obsidian.Events else Obsidian.Text)
        Stat("Playing", "$active / ${NativeEngine.MAX_VOICES}", Obsidian.Text)
        Stat("Loaded", "$loaded / ${NativeEngine.MAX_VOICES}", Obsidian.Text)
        Stat("Rate", "${stats[2].roundToInt()} Hz", Obsidian.Text)
        Stat("Burst / buffer", "${stats[3].roundToInt()} / ${stats[4].roundToInt()}", Obsidian.Text)
        Stat("Latency", latency, Obsidian.Text)
    }
}

@Composable
private fun Stat(label: String, value: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, color = Obsidian.Muted, fontSize = 12.sp)
        Text(value, color = color, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun BarButton(label: String, filled: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier
            .height(40.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(if (filled) Obsidian.Text else Obsidian.Card)
            .border(1.dp, if (filled) Obsidian.Text else Obsidian.Line, RoundedCornerShape(10.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (filled) Obsidian.Background else Obsidian.Text,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun SlotCard(
    slot: Int,
    name: String?,
    state: Int,
    progress: Float,
    loop: Int,
    volume: Float,
    onToggle: () -> Unit,
    onEnd: () -> Unit,
    onLoop: () -> Unit,
    onVolume: (Float) -> Unit,
) {
    val zone = ZoneColors[slot % ZoneColors.size]
    val active = state == NativeEngine.PLAYING || state == NativeEngine.ENDING
    val shape = RoundedCornerShape(12.dp)
    Column(
        Modifier
            .clip(shape)
            .background(Obsidian.Card)
            .border(1.dp, if (active) zone else Obsidian.Line, shape)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("${slot + 1}", color = zone, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(18.dp))
            Text(
                name ?: "Empty",
                color = if (name == null) Obsidian.Muted else Obsidian.Text,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Box(
                Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .border(1.dp, Obsidian.Line, RoundedCornerShape(6.dp))
                    .clickable(role = Role.Button, onClick = onLoop)
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            ) {
                Text(
                    LoopLabels[loop],
                    color = if (loop == NativeEngine.LOOP_INFINITE) Obsidian.ElectricBlue else Obsidian.Text,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        ProgressBar(progress, active)

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            SquareButton(
                label = if (active) "❚❚" else "▶",
                background = if (active) zone else Obsidian.Line,
                foreground = if (active) Obsidian.Background else Obsidian.Text,
                enabled = name != null,
                onClick = onToggle,
            )
            SquareButton(
                label = "■",
                background = Color.Transparent,
                foreground = Obsidian.Text,
                enabled = name != null,
                onClick = onEnd,
            )
            Slider(
                value = volume,
                onValueChange = onVolume,
                modifier = Modifier
                    .weight(1f)
                    .height(32.dp),
                colors = SliderDefaults.colors(
                    thumbColor = zone,
                    activeTrackColor = zone,
                    inactiveTrackColor = Obsidian.Line,
                ),
            )
        }
    }
}

/** Green → yellow → red as the sound approaches its end; full electric blue for infinite loops. */
@Composable
private fun ProgressBar(progress: Float, active: Boolean) {
    val fraction: Float
    val color: Color
    if (progress < 0f) {
        fraction = if (active) 1f else 0f
        color = Obsidian.ElectricBlue
    } else {
        fraction = progress.coerceIn(0f, 1f)
        color = hsl(130f * (1f - fraction), 0.72f, 0.5f)
    }
    Box(
        Modifier
            .fillMaxWidth()
            .height(6.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(Obsidian.Line)
    ) {
        Box(
            Modifier
                .fillMaxWidth(fraction)
                .fillMaxHeight()
                .background(color)
        )
    }
}

@Composable
private fun SquareButton(
    label: String,
    background: Color,
    foreground: Color,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(9.dp))
            .background(background)
            .border(1.dp, Obsidian.Line, RoundedCornerShape(9.dp))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (enabled) foreground else Obsidian.Muted, fontSize = 14.sp)
    }
}

private fun hsl(hue: Float, saturation: Float, lightness: Float): Color {
    val c = (1f - abs(2f * lightness - 1f)) * saturation
    val h = ((hue % 360f) + 360f) % 360f / 60f
    val x = c * (1f - abs(h % 2f - 1f))
    val (r, g, b) = when {
        h < 1f -> Triple(c, x, 0f)
        h < 2f -> Triple(x, c, 0f)
        h < 3f -> Triple(0f, c, x)
        h < 4f -> Triple(0f, x, c)
        h < 5f -> Triple(x, 0f, c)
        else -> Triple(c, 0f, x)
    }
    val m = lightness - c / 2f
    return Color(r + m, g + m, b + m)
}

private fun displayName(context: Context, uri: Uri): String {
    val raw = runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
    }.getOrNull() ?: uri.lastPathSegment ?: "Sound"
    return raw.substringBeforeLast('.')
}

/** App settings. For now: the bard name that signs every exported .bardic file. */
@Composable
private fun SettingsDialog(initialBardName: String, onSave: (String) -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(initialBardName) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Obsidian.Bar,
        title = { Text("Settings", color = Obsidian.Text, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Bard name", color = Obsidian.Muted, fontSize = 13.sp)
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(BardSettings.MAX_BARD_NAME) },
                    singleLine = true,
                    placeholder = { Text("Your bard name", color = Obsidian.Muted) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Obsidian.Text,
                        unfocusedTextColor = Obsidian.Text,
                        focusedBorderColor = Obsidian.Music,
                        unfocusedBorderColor = Obsidian.Line,
                        cursorColor = Obsidian.Music,
                    ),
                )
                Text(
                    "Signs every .bardic file you export. Each export also raises the story's revision.",
                    color = Obsidian.Muted,
                    fontSize = 12.sp,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(name.trim()) }, enabled = name.isNotBlank()) {
                Text("Save", color = if (name.isNotBlank()) Obsidian.Music else Obsidian.Muted)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel", color = Obsidian.Muted) }
        },
    )
}

private fun fileNameFor(title: String): String {
    val slug = title.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-').take(48)
    return "${slug.ifBlank { "story" }}.bardic"
}
