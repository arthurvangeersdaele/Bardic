package com.bardic.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bardic.app.data.BardicIO
import com.bardic.app.data.Library
import com.bardic.app.data.Sound
import com.bardic.app.data.formatSize
import com.bardic.app.data.formatTime
import com.bardic.app.data.plural
import com.bardic.app.settings.Appearance
import com.bardic.app.settings.ThemeName
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Everything drawn above the screens: sheets, settings, questions, work in progress, toasts. */
@Composable
fun Overlays(m: AppModel) {
    m.sheet?.let { SheetHost(m, it) }
    if (m.settingsOpen) SettingsPanel(m)
    m.ask?.let { AskDialog(m, it) }
    m.busy?.let { BusyVeil(it) }
    m.toast?.let { msg ->
        Box(Modifier.fillMaxSize().padding(bottom = 18.dp), contentAlignment = Alignment.BottomCenter) {
            Box(
                Modifier
                    .widthIn(max = 560.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(C.text)
                    .padding(horizontal = 16.dp, vertical = 10.dp)
            ) { T(msg, color = C.bg, size = 15.sp, weight = FontWeight.Medium) }
        }
    }
}

/** A centred panel over a dimmed screen. Tapping outside closes it. */
@Composable
fun Panel(
    title: String,
    onClose: () -> Unit,
    width: Int = 600,
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClose),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier
                .widthIn(max = width.dp)
                .fillMaxWidth(0.92f)
                .heightIn(max = 900.dp)
                .padding(vertical = 12.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(C.bar)
                .border(1.dp, C.line, RoundedCornerShape(18.dp))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { },
        ) {
            Row(Modifier.padding(start = 20.dp, end = 12.dp, top = 12.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Title(title, 24, modifier = Modifier.weight(1f))
                IconBtn(BIcons.close, "Close", size = 36.dp, iconSize = 16.dp, onClick = onClose)
            }
            Column(
                Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(start = 20.dp, end = 20.dp, bottom = 18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                content = content,
            )
        }
    }
}

@Composable
private fun SheetHost(m: AppModel, sheet: Sheet) {
    val close = { m.sheet = null }
    when (sheet) {
        is Sheet.Discovery -> Panel("Discovery stories", close) { DiscoveryBody(m, sheet) }
        is Sheet.Recueil -> Panel("The Recueil", close) { RecueilBody(m, sheet) }
        is Sheet.StoryInfo -> Panel("Story details", close) { StoryInfoBody(m) }
        is Sheet.Picker -> Panel("Add to ${sheet.target.label}", close) { PickerBody(m, sheet.target) }
        is Sheet.Exported -> Panel(if (sheet.files.size > 1) "${sheet.files.size} stories forged" else "Your .bardic is ready", close) {
            ExportedBody(m, sheet)
        }
    }
}

@Composable
private fun Muted(text: String, size: Int = 15) = T(text, color = C.muted, size = size.sp)

@Composable
private fun ListRow(title: String, meta: String, blurb: String?, action: @Composable () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(C.card)
            .border(1.dp, C.line, RoundedCornerShape(12.dp))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            T(title, weight = FontWeight.SemiBold, size = 17.sp)
            T(meta, color = C.muted, size = 13.sp)
            if (!blurb.isNullOrBlank()) T(blurb, color = C.muted, size = 14.sp, maxLines = 3)
        }
        action()
    }
}

@Composable
private fun DiscoveryBody(m: AppModel, s: Sheet.Discovery) {
    val stories by Library.stories.collectAsState()
    Muted("The three stories of the web edition, with their sounds. Each one downloads once, then lives on your phone like any story you forge, ready to edit and play offline.")
    val data = s.data
    when {
        s.error != null -> Muted(s.error!!)
        data == null -> Muted("Fetching the stories…")
        else -> data.stories.filter { it.files.isNotEmpty() }.forEach { meta ->
            val have = stories.firstOrNull { it.source == "discovery:${meta.id}" }
            ListRow(
                meta.title,
                "${plural(meta.chapters.size, "chapter")}, ${plural(meta.files.size, "sound")}, ${formatSize(meta.files.sumOf { it.size })}",
                meta.blurb,
            ) {
                if (have != null) Btn("Added", icon = BIcons.check) { m.sheet = null; m.openEditor(have.uid, 0) }
                else Btn("Add", kind = BtnKind.PRIMARY) { m.addDiscovery(meta, data) }
            }
        }
    }
}

@Composable
private fun RecueilBody(m: AppModel, s: Sheet.Recueil) {
    val stories by Library.stories.collectAsState()
    Muted("Tales forged by the Compagnie des bardes. Adding one downloads it to your phone, sounds included: it then plays without a connection.")
    val tales = s.tales
    when {
        s.error != null -> Muted(s.error!!)
        tales == null -> Muted("Fetching the Recueil…")
        tales.isEmpty() -> Muted("The Recueil is empty for now.")
        else -> tales.forEach { t ->
            val have = stories.firstOrNull { it.id != null && it.id == t.id }
            val label = when {
                have == null -> "Add"
                t.revision > have.revision -> "Update"
                else -> "Added"
            }
            ListRow(
                t.title,
                listOfNotNull(
                    t.bard.takeIf { it.isNotBlank() }?.let { "by $it" }, plural(t.chapters, "chapter"),
                    t.sounds.takeIf { it > 0 }?.let { plural(it, "sound") }, t.size.takeIf { it > 0 }?.let { formatSize(it) },
                ).joinToString(", "),
                t.description,
            ) {
                if (label == "Added") Btn("Added", icon = BIcons.check) { m.addTale(t) }
                else Btn(label, kind = BtnKind.PRIMARY) { m.addTale(t) }
            }
        }
    }
}

@Composable
private fun StoryInfoBody(m: AppModel) {
    val e = m.ed ?: return
    val s = e.story
    var text by remember(s.uid) { mutableStateOf(s.description) }
    T("A few words for other bards", color = C.muted, size = 14.sp)
    BasicTextField(
        value = text,
        onValueChange = { v -> text = v.take(400); m.edit { it.copy(description = text) } },
        textStyle = TextStyle(fontFamily = Barlow, fontSize = 16.sp, color = C.text),
        cursorBrush = SolidColor(C.accent),
        minLines = 3,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(C.card)
            .border(1.dp, C.line, RoundedCornerShape(10.dp))
            .padding(10.dp),
        decorationBox = { inner ->
            Box {
                if (text.isEmpty()) T("A flooded monastery, a choir of ghosts and a very angry abbot.", color = C.muted, size = 16.sp)
                inner()
            }
        },
    )
    val facts = buildList {
        add(if (s.revision > 0) "Exported as revision ${s.revision}${if (s.bard.isNotBlank()) ", signed by ${s.bard}" else ""}." else "Not exported yet: the first export forges revision 1.")
        if (s.source.startsWith("discovery")) add("A discovery story of the web edition.")
        add("${plural(s.chapters.size, "chapter")}, ${plural(s.allSounds().size, "sound")}, ${formatSize(Library.bytesOf(s.allSounds()))} on this phone.")
    }
    Muted(facts.joinToString(" "), 14)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Btn("Export as .bardic", icon = BIcons.share) { m.sheet = null; m.exportStories(listOf(s)) }
        Btn("Delete this story", icon = BIcons.trash, kind = BtnKind.DANGER) {
            m.sheet = null
            m.deleteStory(s) { m.goLibrary() }
        }
    }
}

@Composable
private fun PickerBody(m: AppModel, t: Target) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Btn("Choose from your files", icon = BIcons.files, kind = BtnKind.PRIMARY, height = 48.dp) { m.addFromFiles(t) }
        Muted("MP3, M4A, WAV or OGG, from the phone or a cloud folder. Choose several at once.", 14)
    }
    val all = remember(t) { m.reusable(t) }
    if (all.isEmpty()) return
    var query by remember { mutableStateOf("") }
    var chosen by remember { mutableStateOf(setOf<String>()) }
    T("Or reuse a sound already on this phone", weight = FontWeight.SemiBold, size = 16.sp, modifier = Modifier.padding(top = 6.dp))
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Field(query, { query = it }, Modifier.weight(1f), placeholder = "Search ${plural(all.size, "sound")}")
        Btn(
            if (chosen.isEmpty()) "Add" else "Add ${plural(chosen.size, "sound")}", kind = BtnKind.PRIMARY, enabled = chosen.isNotEmpty(),
        ) { m.addExisting(t, all.filter { it.first.blob in chosen }.map { it.first }) }
    }
    val q = query.trim().lowercase()
    all.filter { (s, from) -> q.isEmpty() || s.name.lowercase().contains(q) || from.lowercase().contains(q) }.take(200).forEach { (s, from) ->
        val on = s.blob in chosen
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(if (on) C.card else Color.Transparent)
                .clickable(role = Role.Checkbox) { chosen = if (on) chosen - s.blob else chosen + s.blob }
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                Modifier
                    .size(22.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (on) C.accent else Color.Transparent)
                    .border(1.5.dp, if (on) C.accent else C.muted, RoundedCornerShape(6.dp)),
                contentAlignment = Alignment.Center,
            ) { if (on) Icon(BIcons.check, null, tint = C.onZ, modifier = Modifier.size(15.dp)) }
            Column(Modifier.weight(1f)) {
                T(s.name, weight = FontWeight.SemiBold, maxLines = 1)
                T(listOfNotNull(from, s.duration?.let { formatTime(it) }).joinToString(", "), color = C.muted, size = 13.sp, maxLines = 1)
            }
        }
    }
}

@Composable
private fun ExportedBody(m: AppModel, s: Sheet.Exported) {
    val total = s.files.sumOf { it.length() }
    Muted("${s.files.joinToString(", ") { it.name }} (${formatSize(total)}). Save it to your files or a cloud drive as a backup, or send it to another bard.")
    if (s.files.any { it.length() > BardicIO.SHARE_LIMIT }) {
        T("Over 100 MB: fine for a backup or a transfer, too big for the Recueil.", color = C.evt, size = 14.sp)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Btn("Share", icon = BIcons.share, kind = BtnKind.PRIMARY) { m.shareExported(s.files) }
        Btn(if (s.files.size > 1) "Save to a folder" else "Save to…", icon = BIcons.save) { m.saveExported(s.files) }
    }
}

// ---------------------------------------------------------------------- settings

@Composable
private fun SettingsPanel(m: AppModel) {
    val st = m.settings
    val context = LocalContext.current
    val dark = when (st.appearance) {
        Appearance.DARK -> true
        Appearance.LIGHT -> false
        Appearance.SYSTEM -> C.dark
    }
    Panel("Settings", { m.settingsOpen = false }) {
        SetSection("Theme")
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            ThemeName.values().forEach { th ->
                val p = paletteOf(th, dark)
                val on = st.theme == th
                Column(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(C.card)
                        .border(if (on) 2.dp else 1.dp, if (on) C.accent else C.line, RoundedCornerShape(12.dp))
                        .clickable(role = Role.RadioButton) { st.changeTheme(th) }
                        .padding(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .height(52.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(p.bg)
                            .padding(8.dp),
                        verticalArrangement = Arrangement.spacedBy(5.dp),
                    ) {
                        listOf(p.music to 0.7f, p.amb to 1f, p.evt to 0.45f).forEach { (c, f) ->
                            Box(Modifier.fillMaxWidth(f).height(6.dp).clip(RoundedCornerShape(3.dp)).background(c))
                        }
                    }
                    T(th.label, weight = FontWeight.SemiBold, size = 14.sp, modifier = Modifier.padding(start = 2.dp))
                }
            }
        }
        SetSection("Appearance")
        Segmented(Appearance.values().map { it to it.label }, st.appearance) { st.changeAppearance(it) }

        SetSection("Bard")
        var bard by remember { mutableStateOf(st.bardName) }
        SetRow("Bard name", "Signs every .bardic file you export") {
            Field(bard, { bard = it; st.changeBardName(it) }, Modifier.width(200.dp), placeholder = "Your bard name", max = 60)
        }

        SetSection("Playback")
        SetRow("Fade-out on stop", null) {
            Segmented(listOf(500 to "0.5 s", 1000 to "1 s", 2000 to "2 s", 4000 to "4 s"), st.fadeMs) { st.changeFade(it) }
        }
        SetRow("Crossfade music tracks", "Starting a track fades out the one playing") {
            Toggle(st.crossfade) { st.changeCrossfade(it) }
        }
        SetRow("Keep screen awake", "While a story is open, so the screen stays on at the table") {
            Toggle(st.keepAwake) { st.changeKeepAwake(it) }
        }
        Muted("The sounds keep playing with the screen off or Bardic in the background: a notification lets you pause or fade out everything.", 13)

        SetSection("Storage")
        var bytes by remember { mutableLongStateOf(-1L) }
        val stories by Library.stories.collectAsState()
        LaunchedEffect(stories) { bytes = withContext(Dispatchers.IO) { Library.totalBytes() } }
        T(
            if (bytes < 0) "Checking…" else "${formatSize(bytes)} of sounds in ${plural(stories.size, "story", "stories")} and the shared soundbox.",
            size = 15.sp,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Btn("Export every story") { m.exportAll() }
            Btn("Erase everything", kind = BtnKind.DANGER) { m.wipeAll() }
        }
        Muted("Your stories live on this phone only. Export them now and then as .bardic files: it is your backup, and the way to share a story with another bard.", 13)

        SetSection("About")
        val version = remember {
            runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull().orEmpty()
        }
        Muted("Bardic for Android, version $version.", 14)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Btn("Bardic page") { m.openLink(BardicIO.SITE) }
            Btn("The Recueil") { m.openLink("${BardicIO.SITE}compagnie/recueil.html") }
            Btn("Engine test") { m.goEngineTest() }
        }
    }
}

@Composable
private fun SetSection(title: String) {
    Box(Modifier.fillMaxWidth().padding(top = 8.dp).height(1.dp).background(C.line))
    T(title.uppercase(), color = C.muted, size = 13.sp, weight = FontWeight.SemiBold)
}

@Composable
private fun SetRow(title: String, sub: String?, control: @Composable () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f)) {
            T(title, size = 16.sp, weight = FontWeight.Medium)
            if (sub != null) T(sub, color = C.muted, size = 13.sp)
        }
        control()
    }
}

// ---------------------------------------------------------------------- questions, work in progress

@Composable
private fun AskDialog(m: AppModel, a: Ask) {
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { m.answer(a, null) },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier
                .widthIn(max = 460.dp)
                .fillMaxWidth(0.9f)
                .clip(RoundedCornerShape(18.dp))
                .background(C.bar)
                .border(1.dp, C.line, RoundedCornerShape(18.dp))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { }
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Title(a.title, 24, maxLines = 3)
            if (!a.text.isNullOrBlank()) T(a.text, color = C.muted, size = 15.sp)
            if (a.input != null) {
                Field(
                    a.field, { a.field = it }, Modifier.fillMaxWidth(), placeholder = a.input.placeholder, max = a.input.max,
                    onDone = { m.answer(a, a.buttons.last().value) },
                )
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                a.buttons.forEach { b -> Btn(b.label, kind = b.kind) { m.answer(a, b.value) } }
            }
        }
    }
}

@Composable
private fun BusyVeil(b: Busy) {
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.55f))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier
                .width(380.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(C.bar)
                .border(1.dp, C.line, RoundedCornerShape(18.dp))
                .padding(22.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Eq(height = 26.dp)
            Title(b.title, 24, maxLines = 2)
            if (b.step.isNotBlank()) T(b.step, color = C.muted, size = 14.sp, maxLines = 2)
            b.fraction?.let { f ->
                Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(C.line)) {
                    Box(Modifier.fillMaxWidth(f.coerceIn(0f, 1f)).height(6.dp).background(C.accent))
                }
            }
        }
    }
}

// ---------------------------------------------------------------------- opening

/** Opening: gold climbs the letters of Bardic and a glint sweeps them, then the word settles in the theme's ink. */
@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
@Composable
fun Splash(onDone: () -> Unit) {
    val t = remember { Animatable(0f) }
    val out = remember { Animatable(1f) }
    LaunchedEffect(Unit) {
        t.animateTo(1f, tween(2200, easing = LinearEasing))
        out.animateTo(0f, tween(420))
        onDone()
    }
    val gold = listOf(Color(0xFF8A5A12), Color(0xFFE0B062), Color(0xFFFFF1C8), Color(0xFFE0A84B), Color(0xFF8A5A12))
    val ink = C.text
    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .alpha(out.value)
            .background(C.bg)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { onDone() },
        contentAlignment = Alignment.Center,
    ) {
        val size = (maxWidth.value * 0.6f / 3.3f).coerceAtMost(maxHeight.value * 0.4f)
        val p = t.value
        val settle = ((p - 0.6f) / 0.4f).coerceIn(0f, 1f)
        val sweep = p * 2.2f - 0.6f
        val w = maxWidth.value * 0.6f
        val brush = Brush.linearGradient(
            colors = gold.map { lerp(it, ink, settle) },
            start = androidx.compose.ui.geometry.Offset(w * (sweep - 0.5f), 0f),
            end = androidx.compose.ui.geometry.Offset(w * (sweep + 0.5f), size),
        )
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            androidx.compose.material3.Text(
                "Bardic",
                style = titleStyle(size.toInt()).copy(brush = brush, letterSpacing = 2.sp),
                textAlign = TextAlign.Center,
                modifier = Modifier.alpha((p * 4f).coerceAtMost(1f)),
            )
            Spacer(Modifier.height(6.dp))
            Eq(Modifier.alpha(settle), height = 22.dp)
        }
    }
}
