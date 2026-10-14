package com.bardic.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bardic.app.bardic.LoopMode
import com.bardic.app.data.Library
import com.bardic.app.data.Sound
import com.bardic.app.data.Story
import com.bardic.app.data.cleanName
import com.bardic.app.data.formatSize
import com.bardic.app.data.formatTime
import com.bardic.app.data.plural

@Composable
fun Tabs(m: AppModel, current: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        listOf("Stories" to { m.goLibrary() }, "Soundbox" to { m.goShared() }).forEachIndexed { i, (label, go) ->
            val on = i == current
            Box(
                Modifier
                    .height(36.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(if (on) C.card else Color.Transparent)
                    .border(1.dp, if (on) C.line else Color.Transparent, RoundedCornerShape(9.dp))
                    .clickable(role = Role.Tab) { go() }
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                T(label, color = if (on) C.text else C.muted, weight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
fun LibraryScreen(m: AppModel) {
    val stories by Library.stories.collectAsState()
    Column(Modifier.fillMaxSize().background(C.bg)) {
        Bar {
            Title("Bardic", 26)
            Spacer(Modifier.width(8.dp))
            Tabs(m, 0)
            Spacer(Modifier.weight(1f))
            Btn("Import", icon = BIcons.import) { m.importBardic() }
            Btn("New story", icon = BIcons.plus, kind = BtnKind.PRIMARY) { m.newStory() }
            IconBtn(BIcons.gear, "Settings") { m.settingsOpen = true }
        }
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (stories.isEmpty()) item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Eq(height = 30.dp)
                    Title("Your table awaits", 34)
                    T(
                        "Forge a story with your own sounds, import a .bardic file, or start from a tale of the Compagnie des bardes.",
                        color = C.muted, size = 17.sp,
                    )
                }
            } else {
                item { SectionLabel(if (stories.size == 1) "Your story" else "Your ${stories.size} stories") }
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(stories, key = { it.uid }) { s -> StoryCard(m, s, stories.indexOf(s)) }
                    }
                }
            }
            item { SectionLabel("Add a story") }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Door(BIcons.plus, "New story", "With your own sounds, from your files", Modifier.weight(1f)) { m.newStory() }
                    Door(BIcons.compass, "Discovery", "Three ready stories, sounds included", Modifier.weight(1f)) { m.openDiscovery() }
                    Door(BIcons.book, "The Recueil", "Tales forged by other bards", Modifier.weight(1f)) { m.openRecueil() }
                    Door(BIcons.files, "Import .bardic", "From your files or a download", Modifier.weight(1f)) { m.importBardic() }
                }
            }
        }
    }
}

@Composable
fun SectionLabel(text: String) {
    T(text.uppercase(), color = C.muted, size = 13.sp, weight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
}

@Composable
private fun StoryCard(m: AppModel, s: Story, index: Int) {
    val z = listOf(C.amb, C.evt, C.blue, C.music)[index.coerceAtLeast(0) % 4]
    val shape = RoundedCornerShape(16.dp)
    Column(
        Modifier
            .width(290.dp)
            .clip(shape)
            .background(C.card)
            .border(1.dp, C.line, shape)
    ) {
        Box(Modifier.fillMaxWidth().height(4.dp).background(z))
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Title(s.title.ifBlank { "Untitled story" }, 26)
            val by = listOfNotNull(
                s.bard.takeIf { it.isNotBlank() }?.let { "by $it" },
                s.revision.takeIf { it > 0 }?.let { "revision $it" },
            ).joinToString(", ").ifBlank { "Not exported yet" }
            T(by, color = C.muted, size = 14.sp, maxLines = 1)
            Column(Modifier.heightIn(min = 60.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                val shown = if (s.chapters.size > 3) 2 else 3
                s.chapters.take(shown).forEachIndexed { i, c ->
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        T("${i + 1}.", color = C.accent, size = 14.sp, weight = FontWeight.SemiBold)
                        T(c.title.ifBlank { "Untitled chapter" }, size = 14.sp, maxLines = 1)
                    }
                }
                if (s.chapters.size > shown) T("and ${s.chapters.size - shown} more", color = C.muted, size = 14.sp)
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(C.line))
            T(
                "${plural(s.chapters.size, "chapter")}, ${plural(s.allSounds().size, "sound")}, ${formatSize(Library.bytesOf(s.allSounds()))}",
                color = C.muted, size = 13.sp, maxLines = 1,
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Btn("Play", icon = BIcons.play, kind = BtnKind.PRIMARY, modifier = Modifier.weight(1f)) { m.openTable(s.uid, 0) }
                IconBtn(BIcons.edit, "Edit ${s.title}", size = 38.dp, iconSize = 16.dp) { m.openEditor(s.uid, 0) }
                IconBtn(BIcons.share, "Export ${s.title}", size = 38.dp, iconSize = 16.dp) { m.exportStories(listOf(s)) }
                IconBtn(BIcons.trash, "Delete ${s.title}", size = 38.dp, iconSize = 16.dp, tint = C.evt) { m.deleteStory(s) }
            }
        }
    }
}

@Composable
private fun Door(icon: ImageVector, title: String, text: String, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier
            .heightIn(min = 118.dp)
            .clip(shape)
            .background(C.card)
            .border(1.dp, C.line, shape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(C.accent.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, tint = C.accent, modifier = Modifier.size(22.dp)) }
        T(title, weight = FontWeight.SemiBold, size = 16.sp, maxLines = 1)
        T(text, color = C.muted, size = 13.sp, maxLines = 2)
    }
}

// ---------------------------------------------------------------------- shared soundbox

@Composable
fun SharedScreen(m: AppModel) {
    val shared by Library.shared.collectAsState()
    Column(Modifier.fillMaxSize().background(C.bg)) {
        Bar {
            Title("Bardic", 26)
            Spacer(Modifier.width(8.dp))
            Tabs(m, 1)
            Spacer(Modifier.weight(1f))
            Btn("Add effects", icon = BIcons.plus, kind = BtnKind.PRIMARY) { m.openPicker(Target.Shared) }
            IconBtn(BIcons.gear, "Settings") { m.settingsOpen = true }
        }
        T(
            "Your shared soundbox: quick effects ready on every table, next to each story's own effects.",
            color = C.muted, size = 15.sp, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp),
        )
        LazyVerticalGrid(
            columns = GridCells.Adaptive(232.dp),
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            itemsIndexed(shared, key = { _, s -> s.uid }) { i, s ->
                EditCard(m, Target.Shared, s, i, shared.size, C.accent, Modifier.height(104.dp))
            }
            item {
                AddTile(
                    if (shared.isEmpty()) "Add your first effects: critical hits, level ups, explosions" else "Add more",
                    C.accent, Modifier.height(104.dp),
                ) { m.openPicker(Target.Shared) }
            }
        }
    }
}

/** A sound card in the editor: name, remove, listen, size, move, loop. */
@Composable
fun EditCard(m: AppModel, t: Target, s: Sound, index: Int, count: Int, z: Color, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(12.dp)
    val playing = m.previewing == s.uid
    var name by remember(s.uid) { mutableStateOf(s.name) }
    Column(
        modifier
            .width(236.dp)
            .clip(shape)
            .background(C.card)
            .border(1.dp, if (playing) z else C.line, shape)
            .padding(start = 10.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Field(
                value = name,
                onChange = { name = it; m.updateSound(t, s.uid) { x -> x.copy(name = it) } },
                modifier = Modifier.weight(1f),
                max = 80,
                border = false,
                style = TextStyle(fontFamily = Barlow, fontWeight = FontWeight.SemiBold, fontSize = 15.sp),
                onFocusLost = {
                    if (name.isBlank()) {
                        name = cleanName(s.fileName)
                        m.updateSound(t, s.uid) { x -> x.copy(name = name) }
                    }
                },
            )
            IconBtn(BIcons.close, "Remove ${s.name}", size = 30.dp, iconSize = 14.dp, background = Color.Transparent, border = Color.Transparent, tint = C.muted) {
                m.removeSound(t, s.uid)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            IconBtn(
                if (playing) BIcons.pause else BIcons.play, "Listen to ${s.name}", size = 36.dp, iconSize = 14.dp,
                background = if (playing) z else C.line, border = if (playing) z else C.line, tint = if (playing) C.onZ else C.text,
            ) { m.togglePreview(s, t) }
            T(
                listOfNotNull(s.duration?.let { formatTime(it) }, formatSize(s.size)).joinToString("  "),
                color = C.muted, size = 12.sp, maxLines = 1, modifier = Modifier.weight(1f),
            )
            IconBtn(BIcons.left, "Move earlier", size = 30.dp, iconSize = 13.dp, enabled = index > 0) { m.moveSound(t, index, -1) }
            IconBtn(BIcons.right, "Move later", size = 30.dp, iconSize = 13.dp, enabled = index < count - 1) { m.moveSound(t, index, 1) }
            LoopChip(s.loop) { m.updateSound(t, s.uid) { x -> x.copy(loop = LoopMode.values()[(x.loop.ordinal + 1) % 3]) } }
        }
    }
}

@Composable
fun LoopChip(loop: LoopMode, onClick: () -> Unit) {
    val inf = loop == LoopMode.INFINITE
    Box(
        Modifier
            .height(26.dp)
            .width(38.dp)
            .clip(RoundedCornerShape(6.dp))
            .border(1.dp, if (inf) C.blue.copy(alpha = 0.6f) else C.line, RoundedCornerShape(6.dp))
            .clickable(role = Role.Button, onClickLabel = "Loop: once, twice, forever", onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        T(listOf("1×", "2×", "∞")[loop.ordinal], color = if (inf) C.blue else C.text, size = 13.sp, weight = FontWeight.SemiBold)
    }
}

@Composable
fun AddTile(text: String, z: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier
            .width(236.dp)
            .fillMaxHeight()
            .clip(shape)
            .border(1.dp, z.copy(alpha = 0.7f), shape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(BIcons.plus, null, tint = z, modifier = Modifier.size(18.dp))
        T(text, color = z, weight = FontWeight.SemiBold, size = 14.sp, maxLines = 3)
    }
}
