package com.bardic.app.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bardic.app.audio.Card
import com.bardic.app.audio.NativeEngine
import com.bardic.app.audio.Pad
import com.bardic.app.audio.TableSession
import com.bardic.app.bardic.LoopMode
import com.bardic.app.data.Zone
import com.bardic.app.data.formatTime
import kotlinx.coroutines.delay

@Composable
fun TableScreen(m: AppModel) {
    val s = m.table ?: return
    val live = s.live
    val ch = s.story.chapters.getOrNull(s.chapterIndex)
    Box(Modifier.fillMaxSize().background(C.bg)) {
        Column(Modifier.fillMaxSize()) {
            Bar {
                IconBtn(BIcons.back, "Back") { m.leaveTable() }
                Column(Modifier.weight(1f)) {
                    Title(s.story.title, 20)
                    T("Chapter ${s.chapterIndex + 1}: ${ch?.title.orEmpty()}", color = C.muted, size = 13.sp, maxLines = 1)
                }
                MasterChip(m, s)
                val open = m.settings.soundboxOpen
                Row(
                    Modifier
                        .height(40.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (open) C.accent else C.card)
                        .border(1.dp, C.accent, RoundedCornerShape(10.dp))
                        .clickable(role = Role.Button) { m.settings.changeSoundboxOpen(!open) }
                        .padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(BIcons.starFill, null, tint = if (open) C.onZ else C.accent, modifier = Modifier.size(16.dp))
                    T("Soundbox", color = if (open) C.onZ else C.accent, weight = FontWeight.SemiBold)
                }
                IconBtn(BIcons.gear, "Settings") { m.settingsOpen = true }
            }
            Row(Modifier.fillMaxSize()) {
                TableRail(s)
                Column(
                    Modifier.weight(1f).fillMaxHeight().padding(start = 8.dp, top = 6.dp, bottom = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Zone.values().forEach { z ->
                        val cards = s.cardsOf(s.chapterIndex, z)
                        Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            ZoneLabel(z.label, zoneColor(z))
                            if (cards.isEmpty()) {
                                Box(
                                    Modifier
                                        .weight(1f)
                                        .fillMaxHeight()
                                        .padding(end = 10.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                        .border(1.dp, C.line, RoundedCornerShape(12.dp))
                                        .padding(14.dp),
                                    contentAlignment = Alignment.CenterStart,
                                ) { T(z.empty, color = C.muted, size = 14.sp) }
                            } else {
                                LazyRow(
                                    Modifier.fillMaxHeight(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    contentPadding = PaddingValues(end = 10.dp),
                                ) {
                                    items(cards, key = { it.sound.uid }) { c -> PlayCard(m, s, c, zoneColor(z)) }
                                }
                            }
                        }
                    }
                }
            }
        }
        if (m.settings.soundboxOpen) {
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(top = 56.dp)
                    .background(Color.Black.copy(alpha = 0.35f))
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                        m.settings.changeSoundboxOpen(false)
                    }
            )
            Box(Modifier.fillMaxSize().padding(top = 56.dp), contentAlignment = Alignment.CenterEnd) {
                SoundboxDrawer(m, s)
            }
        }
    }
}

@Composable
private fun MasterChip(m: AppModel, s: TableSession) {
    Row(
        Modifier
            .height(40.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(C.card)
            .border(1.dp, C.line, RoundedCornerShape(10.dp))
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        val resume = s.holding
        IconBtn(
            if (resume) BIcons.play else BIcons.pause, if (resume) "Resume all" else "Pause all",
            size = 32.dp, iconSize = 15.dp, background = Color.Transparent, border = Color.Transparent,
        ) { s.pauseAll() }
        IconBtn(BIcons.stop, "Fade out everything", size = 32.dp, iconSize = 13.dp, background = Color.Transparent, border = Color.Transparent) {
            s.stopAll()
        }
        T("Master", color = C.muted, size = 13.sp, modifier = Modifier.padding(start = 4.dp))
        BardSlider(
            m.settings.master, { v -> m.settings.changeMaster(v); s.applyMaster() }, C.text,
            Modifier.width(112.dp), label = "Master volume",
        )
        T("${(m.settings.master * 100).toInt()}", weight = FontWeight.SemiBold, size = 14.sp, modifier = Modifier.width(28.dp))
    }
}

@Composable
private fun TableRail(s: TableSession) {
    LazyColumn(
        Modifier.width(160.dp).fillMaxHeight().background(C.bar),
        contentPadding = PaddingValues(8.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        item { T("CHAPTERS", color = C.muted, size = 12.sp, weight = FontWeight.SemiBold, modifier = Modifier.padding(6.dp)) }
        itemsIndexed(s.story.chapters, key = { _, c -> c.uid }) { i, c ->
            val on = i == s.chapterIndex
            val playing = s.chapterPlaying(i)
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (on) C.card else Color.Transparent)
                    .border(1.dp, if (on) C.line else Color.Transparent, RoundedCornerShape(10.dp))
                    .clickable(role = Role.Tab) { s.setChapter(i) }
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Title("${i + 1}", 18, color = C.accent)
                T(c.title, color = if (on) C.text else C.muted, size = 14.sp, weight = FontWeight.SemiBold, maxLines = 2, modifier = Modifier.weight(1f))
                if (playing) Box(Modifier.padding(top = 6.dp).size(8.dp).clip(CircleShape).background(C.amb))
            }
        }
    }
}

/**
 * A sound card at the table: name, time left and loop on top, play, fade out and volume below.
 * The progress is the card's bottom edge, so the controls keep their room on short screens.
 */
@Composable
private fun PlayCard(m: AppModel, s: TableSession, c: Card, z: Color) {
    val live = s.live
    val st = s.stateOf(c, live)
    val waiting = c.waiting
    val on = st == NativeEngine.PLAYING || st == NativeEngine.ENDING || st == NativeEngine.PAUSING || waiting
    val paused = st == NativeEngine.PAUSED
    val p = if (waiting) 0f else s.progressOf(c, live)
    val shape = RoundedCornerShape(12.dp)
    val loop = c.sound.loop
    BoxWithConstraints(
        Modifier
            .width(220.dp)
            .fillMaxHeight()
            .clip(shape)
            .background(C.card)
            .border(1.dp, if (on) z else C.line, shape)
    ) {
        // Control size follows the card height: 24 to 38 dp, never more than the room left.
        val btn = (maxHeight - 40.dp).coerceIn(24.dp, 38.dp)
        Column(
            Modifier
                .fillMaxSize()
                .padding(start = 10.dp, end = 6.dp, top = 6.dp, bottom = 9.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(Modifier.height(24.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                T(c.sound.name, weight = FontWeight.SemiBold, size = 14.sp, maxLines = 1, modifier = Modifier.weight(1f))
                var info = ""
                var warn = false
                when {
                    c.failed -> info = "unavailable"
                    waiting -> info = "next ${formatTime(((c.nextAt - android.os.SystemClock.uptimeMillis()) / 1000.0).coerceAtLeast(0.0))}"
                    on || paused -> if (loop == LoopMode.INFINITE) info = "∞ loop" else {
                        s.remainingOf(c, live)?.let { r -> info = formatTime(r); warn = r <= 10.0 }
                    }
                    st == NativeEngine.LOADING -> info = "loading…"
                }
                if (info.isNotEmpty()) T(info, color = if (warn) C.evt else C.muted, size = 12.sp, weight = if (warn) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1)
                LoopChip(loop, height = 22.dp) { s.setLoop(c, loop.next(allowRandom = c.zone != Zone.MUSIC)) }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                val playing = st == NativeEngine.PLAYING || waiting
                IconBtn(
                    if (playing) BIcons.pause else BIcons.play, if (playing) "Pause ${c.sound.name}" else "Play ${c.sound.name}",
                    size = btn, iconSize = 14.dp,
                    background = if (on) z else C.line, border = if (on) z else C.line, tint = if (on) C.onZ else C.text,
                    enabled = !c.failed,
                ) { s.toggle(c) }
                IconBtn(
                    BIcons.stop, "Fade out ${c.sound.name}", size = btn, iconSize = 12.dp,
                    background = Color.Transparent, enabled = on || paused,
                ) { s.end(c) }
                BardSlider(c.sound.volume, { v -> s.setVolume(c, v) }, z, Modifier.weight(1f).height(btn), label = "${c.sound.name} volume")
            }
        }
        // Progress as the bottom edge: green to red near the end, electric blue for an infinite loop.
        val shown = on || paused
        val fraction = when {
            !shown -> 0f
            p < 0f -> 1f
            else -> p.coerceIn(0f, 1f)
        }
        val color = if (p < 0f) C.blue else hsl(130f * (1f - fraction), 0.72f, 0.5f)
        Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(4.dp).background(C.line.copy(alpha = 0.6f)))
        Box(Modifier.align(Alignment.BottomStart).fillMaxWidth(fraction).height(4.dp).background(color))
    }
}

@Composable
private fun SoundboxDrawer(m: AppModel, s: TableSession) {
    val pins = m.settings.pins
    val ordered = s.pads.filter { it.sound.uid in pins }.sortedBy { pins.indexOf(it.sound.uid) } +
        s.pads.filter { it.sound.uid !in pins }
    Column(
        Modifier
            .width(320.dp)
            .fillMaxHeight()
            .background(C.bar)
            .border(1.dp, C.line)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { },
    ) {
        Row(Modifier.padding(start = 16.dp, end = 10.dp, top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Title("Soundbox", 22, color = C.accent, modifier = Modifier.weight(1f))
            IconBtn(BIcons.close, "Close soundbox", size = 34.dp, iconSize = 15.dp) { m.settings.changeSoundboxOpen(false) }
        }
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            T("Volume", color = C.muted, size = 13.sp)
            BardSlider(
                m.settings.soundboxVolume, { v -> m.settings.changeSoundboxVolume(v); s.applySoundboxVolume() }, C.accent,
                Modifier.weight(1f), label = "Soundbox volume",
            )
        }
        if (s.pads.isEmpty()) {
            T(
                "No effects yet. Add some to this story in the editor, or to your shared soundbox.",
                color = C.muted, size = 14.sp,
                modifier = Modifier
                    .padding(16.dp)
                    .border(1.dp, C.line, RoundedCornerShape(12.dp))
                    .padding(14.dp),
            )
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                var last: String? = null
                ordered.forEach { p ->
                    val group = when {
                        p.sound.uid in pins -> "Pinned"
                        p.own -> "This story"
                        else -> "Shared"
                    }
                    if (group != last) {
                        last = group
                        item(key = "g-$group", span = { GridItemSpan(maxLineSpan) }) {
                            T(group.uppercase(), color = C.muted, size = 11.sp, weight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                    item(key = "p-${p.index}") { PadButton(m, s, p, p.sound.uid in pins) }
                }
            }
        }
        T("Tap to fire. ☆ pins an effect to the top.", color = C.muted, size = 12.sp, modifier = Modifier.padding(start = 16.dp, bottom = 10.dp))
    }
}

@Composable
private fun PadButton(m: AppModel, s: TableSession, p: Pad, pinned: Boolean) {
    var flash by remember { mutableStateOf(false) }
    LaunchedEffect(p.fired) {
        if (p.fired > 0) {
            flash = true
            delay(260)
            flash = false
        }
    }
    val bg by animateColorAsState(if (flash) C.accent.copy(alpha = 0.35f) else C.card, tween(if (flash) 40 else 400), label = "pad")
    val shape = RoundedCornerShape(12.dp)
    Box(Modifier.fillMaxWidth()) {
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 68.dp)
                .clip(shape)
                .background(bg)
                .border(1.dp, if (flash || pinned) C.accent else C.line, shape)
                .clickable(enabled = p.state == 1, role = Role.Button) { s.fire(p) }
                .padding(start = 10.dp, end = 28.dp, top = 8.dp, bottom = 8.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            T(
                when (p.state) { 0 -> "${p.sound.name}…"; 2 -> "${p.sound.name} (unavailable)"; else -> p.sound.name },
                color = if (p.state == 1) C.text else C.muted, weight = FontWeight.SemiBold, size = 14.sp, maxLines = 3,
            )
        }
        IconBtn(
            if (pinned) BIcons.starFill else BIcons.star, "Pin ${p.sound.name}", size = 30.dp, iconSize = 15.dp,
            background = Color.Transparent, border = Color.Transparent, tint = if (pinned) C.accent else C.muted,
            modifier = Modifier.align(Alignment.TopEnd),
        ) { m.settings.togglePin(p.sound.uid) }
    }
}
