package com.bardic.app.ui

import android.content.Context
import android.media.MediaPlayer
import android.net.Uri
import android.provider.DocumentsContract
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.bardic.app.audio.TableSession
import com.bardic.app.bardic.LoopMode
import com.bardic.app.bardic.UnpackedStory
import com.bardic.app.data.BardAccount
import com.bardic.app.data.BardicIO
import com.bardic.app.data.Chapter
import com.bardic.app.data.Library
import com.bardic.app.data.Sound
import com.bardic.app.data.Story
import com.bardic.app.data.Updater
import com.bardic.app.data.Zone
import com.bardic.app.data.formatSize
import com.bardic.app.data.plural
import com.bardic.app.data.uid
import com.bardic.app.settings.AppSettings
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/** What the activity does for the app: file pickers, sharing, screen wake. */
interface Host {
    suspend fun pickBardic(): Uri?
    suspend fun pickAudio(): List<Uri>
    suspend fun saveAs(name: String): Uri?
    suspend fun pickFolder(): Uri?
    fun share(files: List<File>)
    fun openLink(url: String)
    /** Hands a downloaded APK to the Android installer (after the "install unknown apps" permission). */
    fun installApk(file: File)
}

sealed interface Screen {
    object Library : Screen
    object Shared : Screen
    object Editor : Screen
    data class Table(val from: Screen) : Screen
    object EngineTest : Screen
}

/** Where a sound picker adds its sounds. */
sealed interface Target {
    val label: String
    val loop: LoopMode
    data class ChapterZone(val chapterUid: String, val zone: Zone) : Target {
        override val label get() = zone.label
        override val loop get() = zone.defaultLoop
    }
    object StorySoundbox : Target {
        override val label = "the story soundbox"
        override val loop = LoopMode.ONCE
    }
    object Shared : Target {
        override val label = "the shared soundbox"
        override val loop = LoopMode.ONCE
    }
}

class Busy(val title: String, val step: String = "", val fraction: Float? = null)

class AskButton(val label: String, val value: String?, val kind: BtnKind = BtnKind.NORMAL)
class AskInput(val value: String = "", val placeholder: String = "", val max: Int = 120)
class AskResult(val value: String, val text: String)
class Ask(
    val title: String,
    val text: String?,
    val buttons: List<AskButton>,
    val input: AskInput?,
    val done: CompletableDeferred<AskResult?>,
) {
    var field by mutableStateOf(input?.value.orEmpty())
}

sealed interface Sheet {
    class Discovery : Sheet {
        var data by mutableStateOf<BardicIO.Discovery?>(null)
        var error by mutableStateOf<String?>(null)
    }
    class Recueil : Sheet {
        var tales by mutableStateOf<List<BardicIO.Tale>?>(null)
        var error by mutableStateOf<String?>(null)
    }
    object StoryInfo : Sheet
    class Picker(val target: Target) : Sheet
    class Exported(val files: List<File>) : Sheet
}

class EditorState(story: Story, chapter: Int) {
    var story by mutableStateOf(story)
    /** Index of the chapter on screen, or -1 for the story soundbox. */
    var chapter by mutableIntStateOf(chapter)
    var saved by mutableStateOf("")
}

class AppModel(private val app: Context, private val host: Host, val scope: CoroutineScope) {
    val settings = AppSettings(app)

    var screen by mutableStateOf<Screen>(Screen.Library)
        private set
    var splash by mutableStateOf(true)
    var busy by mutableStateOf<Busy?>(null)
        private set
    var toast by mutableStateOf<String?>(null)
        private set
    var ask by mutableStateOf<Ask?>(null)
        private set
    var sheet by mutableStateOf<Sheet?>(null)
    var settingsOpen by mutableStateOf(false)
    var table by mutableStateOf<TableSession?>(null)
        private set
    var ed by mutableStateOf<EditorState?>(null)
        private set
    /** uid of the sound playing in the editor's listen button. */
    var previewing by mutableStateOf<String?>(null)
        private set

    private var toastJob: Job? = null
    private var saveJob: Job? = null
    private var sharedJob: Job? = null
    private var player: MediaPlayer? = null
    /** The last table being closed: a new table waits for it, so they never share the engine. */
    private var closing: Job? = null

    fun start() {
        scope.launch {
            withContext(Dispatchers.IO) { Library.reload() }
            // A little after the opening, look for a newer build (never in the middle of a session).
            delay(4000)
            checkForUpdate(manual = false)
        }
    }

    // ------------------------------------------------------------------ updates

    /** Builds already offered this session and declined, so the question comes back only at the next launch. */
    private var declined: String? = null

    fun checkForUpdate(manual: Boolean) = scope.launch {
        if (!Updater.canCheck) {
            if (manual) toast("This build cannot check for updates (built outside GitHub).")
            return@launch
        }
        if (manual) toast("Looking for a newer Bardic…")
        val r = withContext(Dispatchers.IO) { runCatching { Updater.latest() }.getOrNull() }
        if (r == null) {
            if (manual) toast("No connection to GitHub. Try again once online.")
            return@launch
        }
        if (!Updater.isNewer(r)) {
            if (manual) toast("Bardic is up to date.")
            return@launch
        }
        if (!manual && (declined == r.sha || table != null || busy != null || ask != null)) return@launch
        val day = r.published.take(10)
        val v = ask(
            "A new Bardic is ready",
            "A newer build was published${if (day.isNotBlank()) " on $day" else ""}. Download and install it now? " +
                "Your stories and sounds stay on the phone.",
            listOf(AskButton("Later", null), AskButton("Update", "go", BtnKind.PRIMARY)),
        )
        if (v == null) {
            declined = r.sha
            return@launch
        }
        try {
            busy("Downloading the update", r.name, 0f)
            val file = withContext(Dispatchers.IO) {
                Updater.download(app, r) { got ->
                    busy("Downloading the update", formatSize(got) + if (r.size > 0) " of ${formatSize(r.size)}" else "",
                        if (r.size > 0) (got.toFloat() / r.size).coerceAtMost(1f) else null)
                }
            }
            idle()
            host.installApk(file)
        } catch (e: Exception) {
            idle()
            tell("The update could not be downloaded", "Check your connection and try again. (${e.message ?: e})")
        }
    }

    // ------------------------------------------------------------------ feedback

    fun toast(message: String, ms: Long = 2600) {
        toast = message
        toastJob?.cancel()
        toastJob = scope.launch {
            delay(ms)
            toast = null
        }
    }

    private fun busy(title: String, step: String = "", fraction: Float? = null) {
        busy = Busy(title, step, fraction)
    }

    private fun idle() {
        busy = null
    }

    suspend fun ask(title: String, text: String?, buttons: List<AskButton>, input: AskInput? = null): AskResult? {
        ask?.done?.complete(null)
        val a = Ask(title, text, buttons, input, CompletableDeferred())
        ask = a
        val r = a.done.await()
        if (ask === a) ask = null
        return r
    }

    fun answer(a: Ask, value: String?) {
        a.done.complete(if (value == null) null else AskResult(value, a.field.trim()))
        if (ask === a) ask = null
    }

    private suspend fun tell(title: String, text: String) {
        ask(title, text, listOf(AskButton("OK", "ok", BtnKind.PRIMARY)))
    }

    // ------------------------------------------------------------------ navigation

    fun goLibrary() {
        leaveEditor()
        screen = Screen.Library
    }

    fun goShared() {
        leaveEditor()
        screen = Screen.Shared
    }

    fun goEngineTest() {
        settingsOpen = false
        screen = Screen.EngineTest
    }

    /** Back button. Returns false when the app should close. */
    fun back(): Boolean {
        when {
            ask != null -> answer(ask!!, null)
            sheet != null -> sheet = null
            settingsOpen -> settingsOpen = false
            busy != null -> Unit
            screen is Screen.Table -> leaveTable()
            screen == Screen.Editor || screen == Screen.Shared || screen == Screen.EngineTest -> goLibrary()
            else -> return false
        }
        return true
    }

    // ------------------------------------------------------------------ library

    fun newStory() = scope.launch {
        val a = ask(
            "New story", "Give your story a name. You can change it later.",
            listOf(AskButton("Cancel", null), AskButton("Create", "ok", BtnKind.PRIMARY)),
            AskInput(placeholder = "The Drowned Abbey", max = 120),
        ) ?: return@launch
        val story = Story(uid = uid(), title = a.text.ifBlank { "Untitled story" }, chapters = listOf(Chapter(uid(), "Chapter 1")))
        val saved = withContext(Dispatchers.IO) { Library.putStory(story) }
        openEditor(saved.uid, 0)
    }

    fun deleteStory(s: Story, after: () -> Unit = {}) = scope.launch {
        val n = s.allSounds().size
        val v = ask(
            "Delete “${s.title}”?",
            "Its ${plural(s.chapters.size, "chapter")} and ${plural(n, "sound")} leave this phone. Export it first if you want to keep a copy.",
            listOf(AskButton("Cancel", null), AskButton("Delete", "del", BtnKind.DANGER)),
        )
        if (v?.value != "del") return@launch
        withContext(Dispatchers.IO) { Library.deleteStory(s.uid) }
        settings.forgetPins(s.allSounds().map { it.uid })
        toast("“${s.title}” deleted.")
        after()
    }

    // ------------------------------------------------------------------ import

    fun importBardic() = scope.launch {
        val uri = host.pickBardic() ?: return@launch
        val picked = withContext(Dispatchers.IO) { BardicIO.describe(app, uri) }
        if (!picked.name.lowercase().let { it.endsWith(".bardic") || it.endsWith(".zip") }) {
            toast("Choose a .bardic file.")
            return@launch
        }
        importFrom(picked.name, picked.size) { app.contentResolver.openInputStream(uri) ?: error("Cannot read this file.") }
    }

    private suspend fun importFrom(label: String, size: Long, open: () -> java.io.InputStream): Story? {
        try {
            busy("Opening the tale", label, 0f)
            val unpacked = withContext(Dispatchers.IO) {
                open().use { input -> BardicIO.unpack(app, input, size) { f -> busy("Opening the tale", label, f) } }
            }
            idle()
            val added = importDraft(unpacked) ?: return null
            toast("“${added.title}” is on your table.")
            return added
        } catch (e: Exception) {
            idle()
            tell("This file could not be opened", e.message ?: e.toString())
            return null
        }
    }

    /** Stores an unpacked .bardic. Asks before replacing a story it already has. */
    private suspend fun importDraft(d: UnpackedStory): Story? {
        val twin = Library.stories.value.firstOrNull { it.id != null && it.id == d.story.id }
        var replace: String? = null
        var keepId = true
        if (twin != null) {
            val newer = d.story.revision > twin.revision
            val v = ask(
                "You already have “${twin.title}”",
                if (newer) "Yours is revision ${twin.revision}, this file is revision ${d.story.revision}. Replace yours with it?"
                else "Yours is revision ${twin.revision}, this file is revision ${d.story.revision}, not newer. Replace yours anyway, or keep both?",
                listOf(AskButton("Cancel", null), AskButton("Keep both", "both"), AskButton("Replace", "replace", BtnKind.PRIMARY)),
            )
            if (v == null) {
                withContext(Dispatchers.IO) { d.dir.deleteRecursively() }
                return null
            }
            if (v.value == "replace") replace = twin.uid else keepId = false
        }
        return try {
            withContext(Dispatchers.IO) {
                BardicIO.store(d, replace, keepId) { n, total -> busy("Storing the sounds", "$n of $total", n.toFloat() / total.coerceAtLeast(1)) }
            }.also { idle() }
        } catch (e: Exception) {
            idle()
            tell("This tale could not be stored", spaceMessage(e))
            null
        }
    }

    private fun spaceMessage(e: Exception): String {
        val m = e.message.orEmpty()
        return if (m.contains("ENOSPC") || m.contains("No space", ignoreCase = true)) {
            "Your phone has no room left for these sounds. Free some space, or delete a story you no longer play."
        } else m.ifBlank { e.toString() }
    }

    // ------------------------------------------------------------------ Discovery and Recueil

    fun openDiscovery() {
        val s = Sheet.Discovery()
        sheet = s
        scope.launch {
            try {
                s.data = withContext(Dispatchers.IO) { BardicIO.fetchDiscovery() }
            } catch (e: Exception) {
                s.error = "These stories need a connection to download. Try again once your phone is online."
            }
        }
    }

    fun addDiscovery(meta: BardicIO.DiscoveryStory, all: BardicIO.Discovery) = scope.launch {
        sheet = null
        try {
            busy("Adding ${meta.title}", "Starting", 0f)
            withContext(Dispatchers.IO) {
                BardicIO.addDiscovery(app, meta, all) { step, f -> busy("Adding ${meta.title}", step, f) }
            }
            idle()
            toast("${meta.title} is on your table.")
        } catch (e: Exception) {
            idle()
            tell("The story could not be added", "Check your connection and try again. (${e.message ?: e})")
        }
    }

    fun openRecueil() {
        val s = Sheet.Recueil()
        sheet = s
        scope.launch {
            try {
                s.tales = withContext(Dispatchers.IO) { BardicIO.fetchRecueil() }
            } catch (e: Exception) {
                s.error = "The Recueil needs a connection. Try again once your phone is online."
            }
        }
    }

    fun addTale(t: BardicIO.Tale) = scope.launch {
        val have = Library.stories.value.firstOrNull { it.id != null && it.id == t.id }
        if (have != null && t.revision <= have.revision) {
            val v = ask(
                "“${t.title}” is already on your table", "Download it again and replace yours?",
                listOf(AskButton("Cancel", null), AskButton("Download again", "go", BtnKind.PRIMARY)),
            )
            if (v == null) return@launch
        }
        sheet = null
        try {
            busy("Fetching the tale", t.title, 0f)
            val file = withContext(Dispatchers.IO) {
                BardicIO.downloadTale(app, t) { got ->
                    busy("Fetching the tale", "${t.title}, ${formatSize(got)}", if (t.size > 0) (got.toFloat() / t.size).coerceAtMost(1f) else null)
                }
            }
            importFrom(t.title, file.length()) { file.inputStream() }
            withContext(Dispatchers.IO) { file.delete() }
        } catch (e: Exception) {
            idle()
            tell("The tale could not be downloaded", "Check your connection and try again.")
        }
    }

    // ------------------------------------------------------------------ export

    /** Signs exports: the bard name registered with GitHub in the settings, else Forgotten Barde. */
    private fun ensureBard(): String = settings.bardName

    // ------------------------------------------------------------------ GitHub connection (optional)

    /** A GitHub sign-in in progress: the code the bard types on github.com. */
    class GhFlow(val code: String, val uri: String) {
        var error by mutableStateOf<String?>(null)
    }

    /** null while unknown (offline), false while GitHub connection is not open yet. */
    var ghOpen by mutableStateOf<Boolean?>(null)
        private set
    var ghFlow by mutableStateOf<GhFlow?>(null)
        private set
    var ghBusy by mutableStateOf(false)
        private set
    var ghError by mutableStateOf<String?>(null)
        private set
    private var ghJob: Job? = null

    /** When the settings open: is the connection open, and is the saved one still valid (or named elsewhere)? */
    fun checkGitHub() = scope.launch {
        val open = withContext(Dispatchers.IO) { runCatching { BardAccount.worker().isNotBlank() }.getOrNull() }
        if (open != null) ghOpen = open
        val token = settings.ghToken
        if (open != true || token.isBlank()) return@launch
        val r = withContext(Dispatchers.IO) { runCatching { BardAccount.whoAmI(token) }.getOrNull() } ?: return@launch
        if (settings.ghToken != token) return@launch
        when (r.status) {
            401 -> settings.clearAccount()
            200 -> settings.setAccount(token, r.body.optString("login", settings.ghLogin), r.body.optString("name").takeIf { !r.body.isNull("name") }.orEmpty())
        }
    }

    fun connectGitHub() {
        if (ghBusy || ghFlow != null) return
        ghError = null
        ghBusy = true
        ghJob = scope.launch {
            val dc = try {
                withContext(Dispatchers.IO) { BardAccount.deviceCode() }
            } catch (e: Exception) {
                ghBusy = false
                ghError = "${e.message ?: "GitHub did not answer."} Check your connection and try again."
                return@launch
            }
            ghBusy = false
            val flow = GhFlow(dc.userCode, dc.uri)
            ghFlow = flow
            var interval = dc.interval
            val until = System.currentTimeMillis() + dc.expiresIn * 1000L
            while (ghFlow === flow) {
                delay(interval * 1000L)
                if (ghFlow !== flow) return@launch
                if (System.currentTimeMillis() > until) {
                    flow.error = "The code has expired. Cancel and connect again."
                    return@launch
                }
                val d = withContext(Dispatchers.IO) { runCatching { BardAccount.deviceToken(dc.deviceCode) }.getOrNull() } ?: continue
                when (d.optString("status")) {
                    "ok" -> {
                        settings.setAccount(d.getString("token"), d.optString("login"), if (d.isNull("name")) "" else d.optString("name"))
                        ghFlow = null
                        toast("Connected to GitHub as @${d.optString("login")}.")
                        return@launch
                    }
                    "slow_down" -> interval += 5
                    "expired_token" -> { flow.error = "The code has expired. Cancel and connect again."; return@launch }
                    "access_denied" -> { ghFlow = null; ghError = "The connection was cancelled on GitHub."; return@launch }
                }
            }
        }
    }

    /** Opens github.com/login/device (the code is copied by the settings panel). */
    fun openGitHubCode() {
        ghFlow?.let { host.openLink(it.uri) }
    }

    fun cancelGitHub() {
        ghJob?.cancel()
        ghFlow = null
        ghBusy = false
    }

    fun registerBard(raw: String) = scope.launch {
        ghError = null
        val name = raw.replace(Regex("\\s+"), " ").trim()
        if (name.length !in 2..40) {
            ghError = "A bard name has 2 to 40 characters."
            return@launch
        }
        val v = ask(
            "Register “$name” for good?",
            "Your bard name is registered once and for all: it can never be changed afterwards, and no other bard can ever take it.",
            listOf(AskButton("Change it", null), AskButton("Register for good", "go", BtnKind.PRIMARY)),
        ) ?: return@launch
        if (v.value != "go") return@launch
        val token = settings.ghToken
        ghBusy = true
        val r = withContext(Dispatchers.IO) { runCatching { BardAccount.register(token, name) }.getOrNull() }
        ghBusy = false
        when {
            r == null -> ghError = "Bardic could not reach GitHub. Check your connection and try again."
            r.status == 200 && r.body.optString("name").isNotBlank() -> {
                settings.setAccount(token, r.body.optString("login", settings.ghLogin), r.body.getString("name"))
                toast("${r.body.getString("name")} is your bard name.")
            }
            r.status == 401 -> {
                settings.clearAccount()
                ghError = "Your GitHub connection has ended. Connect again."
            }
            r.status == 409 && r.body.optString("name").isNotBlank() -> settings.setAccount(token, settings.ghLogin, r.body.getString("name"))
            else -> ghError = r.body.optString("error").ifBlank { "The name could not be registered. Try again later." }
        }
    }

    fun disconnectGitHub() {
        cancelGitHub()
        ghError = null
        settings.clearAccount()
    }

    fun exportStories(list: List<Story>) = scope.launch {
        if (list.isEmpty()) {
            toast("No story to export yet.")
            return@launch
        }
        flushEditor()
        val bard = ensureBard()
        val files = ArrayList<File>()
        try {
            list.forEachIndexed { i, s0 ->
                val s = if (ed?.story?.uid == s0.uid) ed!!.story else Library.story(s0.uid) ?: s0
                val label = if (list.size > 1) "${s.title} (${i + 1} of ${list.size})" else s.title
                val problems = withContext(Dispatchers.IO) { BardicIO.problems(s) }
                if (problems.isNotEmpty()) {
                    idle()
                    tell("“${s.title}” cannot be exported yet", problems.joinToString(" "))
                    return@forEachIndexed
                }
                busy("Forging the .bardic", label)
                val (file, updated) = withContext(Dispatchers.IO) {
                    val r = BardicIO.forge(app, s, bard)
                    Library.putStory(r.second, touch = false)
                    r
                }
                if (ed?.story?.uid == updated.uid) ed?.story = updated
                files += file
            }
        } catch (e: Exception) {
            idle()
            tell("The export stopped", spaceMessage(e))
            return@launch
        }
        idle()
        if (files.isNotEmpty()) sheet = Sheet.Exported(files)
    }

    fun shareExported(files: List<File>) = host.share(files)

    fun saveExported(files: List<File>) = scope.launch {
        try {
            if (files.size == 1) {
                val uri = host.saveAs(files[0].name) ?: return@launch
                withContext(Dispatchers.IO) {
                    app.contentResolver.openOutputStream(uri)?.use { out -> files[0].inputStream().use { it.copyTo(out) } }
                        ?: error("Cannot write there.")
                }
            } else {
                val tree = host.pickFolder() ?: return@launch
                withContext(Dispatchers.IO) {
                    val parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
                    files.forEach { f ->
                        val doc = DocumentsContract.createDocument(app.contentResolver, parent, "application/octet-stream", f.name)
                            ?: error("Cannot write in this folder.")
                        app.contentResolver.openOutputStream(doc)?.use { out -> f.inputStream().use { it.copyTo(out) } }
                    }
                }
            }
            sheet = null
            toast(if (files.size == 1) "Saved." else "${files.size} stories saved.")
        } catch (e: Exception) {
            tell("The file could not be saved", e.message ?: e.toString())
        }
    }

    fun exportAll() {
        settingsOpen = false
        exportStories(Library.stories.value)
    }

    fun wipeAll() = scope.launch {
        val v = ask(
            "Erase everything?",
            "Every story, sound and effect leaves this phone for good. Export your stories first if you want to keep them.",
            listOf(AskButton("Cancel", null), AskButton("Erase", "erase", BtnKind.DANGER)),
        )
        if (v?.value != "erase") return@launch
        settingsOpen = false
        table?.let { leaveTable() }
        leaveEditor()
        withContext(Dispatchers.IO) { Library.wipe() }
        settings.forgetPins(settings.pins)
        screen = Screen.Library
        toast("Bardic is empty again.")
    }

    // ------------------------------------------------------------------ editor

    fun openEditor(storyUid: String, chapter: Int) {
        val s = Library.story(storyUid) ?: return
        if (ed?.story?.uid != storyUid) {
            stopPreview()
            ed = EditorState(s, chapter.coerceIn(-1, s.chapters.lastIndex))
        } else {
            ed!!.chapter = chapter.coerceIn(-1, ed!!.story.chapters.lastIndex)
        }
        screen = Screen.Editor
    }

    private fun leaveEditor() {
        flushEditor()
        stopPreview()
        ed = null
    }

    private fun flushEditor() {
        if (saveJob?.isActive == true) {
            saveJob?.cancel()
            ed?.let { e -> Library.putStory(e.story) }
        }
    }

    /** Applies a change to the story in the editor and saves it shortly after. */
    fun edit(change: (Story) -> Story) {
        val e = ed ?: return
        e.story = change(e.story)
        e.saved = ""
        saveJob?.cancel()
        saveJob = scope.launch {
            delay(500)
            val s = e.story
            try {
                withContext(Dispatchers.IO) { Library.putStory(s) }
                if (ed === e) e.saved = "Saved"
            } catch (x: Exception) {
                if (ed === e) e.saved = "Not saved"
                toast(spaceMessage(x))
            }
        }
    }

    fun selectChapter(i: Int) {
        ed?.chapter = i
    }

    fun addChapter() {
        val e = ed ?: return
        edit { s -> s.copy(chapters = s.chapters + Chapter(uid(), "Chapter ${s.chapters.size + 1}")) }
        e.chapter = e.story.chapters.lastIndex
    }

    fun moveChapter(i: Int, d: Int) {
        val e = ed ?: return
        val j = i + d
        val list = e.story.chapters.toMutableList()
        if (j < 0 || j >= list.size) return
        val t = list[i]; list[i] = list[j]; list[j] = t
        edit { it.copy(chapters = list) }
        e.chapter = when (e.chapter) { i -> j; j -> i; else -> e.chapter }
    }

    fun removeChapter(i: Int) = scope.launch {
        val e = ed ?: return@launch
        val ch = e.story.chapters.getOrNull(i) ?: return@launch
        if (e.story.chapters.size == 1) return@launch
        if (ch.soundCount > 0) {
            val v = ask(
                "Remove “${ch.title}”?", "Its ${plural(ch.soundCount, "sound")} go with it.",
                listOf(AskButton("Cancel", null), AskButton("Remove", "rm", BtnKind.DANGER)),
            )
            if (v?.value != "rm") return@launch
        }
        stopPreview()
        edit { s -> s.copy(chapters = s.chapters.filterIndexed { k, _ -> k != i }) }
        e.chapter = (i - 1).coerceAtLeast(0)
    }

    fun soundsFor(t: Target): List<Sound> = when (t) {
        is Target.ChapterZone -> ed?.story?.chapters?.firstOrNull { it.uid == t.chapterUid }?.sounds(t.zone).orEmpty()
        Target.StorySoundbox -> ed?.story?.soundbox.orEmpty()
        Target.Shared -> Library.shared.value
    }

    fun setSounds(t: Target, list: List<Sound>) {
        when (t) {
            is Target.ChapterZone -> edit { s ->
                s.copy(chapters = s.chapters.map { if (it.uid == t.chapterUid) it.with(t.zone, list) else it })
            }
            Target.StorySoundbox -> edit { s -> s.copy(soundbox = list) }
            Target.Shared -> {
                sharedJob?.cancel()
                sharedJob = scope.launch(Dispatchers.IO) {
                    try {
                        Library.setShared(list)
                    } catch (e: Exception) {
                        withContext(Dispatchers.Main) { toast(spaceMessage(e)) }
                    }
                }
            }
        }
    }

    fun updateSound(t: Target, uid: String, change: (Sound) -> Sound) =
        setSounds(t, soundsFor(t).map { if (it.uid == uid) change(it) else it })

    fun removeSound(t: Target, uid: String) {
        if (previewing == uid) stopPreview()
        setSounds(t, soundsFor(t).filter { it.uid != uid })
    }

    fun moveSound(t: Target, i: Int, d: Int) {
        val list = soundsFor(t).toMutableList()
        val j = i + d
        if (j < 0 || j >= list.size) return
        val x = list[i]; list[i] = list[j]; list[j] = x
        setSounds(t, list)
    }

    fun openPicker(t: Target) {
        sheet = Sheet.Picker(t)
    }

    fun addFromFiles(t: Target) = scope.launch {
        val uris = host.pickAudio()
        if (uris.isEmpty()) return@launch
        sheet = null
        var added = 0
        var skipped = 0
        val sounds = ArrayList<Sound>()
        try {
            uris.forEachIndexed { i, uri ->
                val info = withContext(Dispatchers.IO) { BardicIO.describe(app, uri) }
                if (!withContext(Dispatchers.IO) { BardicIO.isAudio(app, uri, info.name) }) {
                    skipped++
                    return@forEachIndexed
                }
                busy("Adding sounds", "${info.name} (${i + 1} of ${uris.size})", i.toFloat() / uris.size)
                sounds += withContext(Dispatchers.IO) { BardicIO.addAudio(app, uri, t.loop) }
                added++
            }
        } catch (e: Exception) {
            toast(spaceMessage(e), 4000)
        }
        if (sounds.isNotEmpty()) setSounds(t, soundsFor(t) + sounds)
        idle()
        if (skipped > 0) toast("${plural(skipped, "file")} skipped: not audio.")
        else if (added > 0) toast("${plural(added, "sound")} added.")
    }

    fun addExisting(t: Target, picked: List<Sound>) {
        sheet = null
        if (picked.isEmpty()) return
        setSounds(t, soundsFor(t) + picked.map { it.copy(uid = uid(), loop = t.loop, volume = 0.75f) })
    }

    /** Sounds already on the phone, for the picker: each audio file once, with where it comes from. */
    fun reusable(t: Target): List<Pair<Sound, String>> {
        val inList = soundsFor(t).map { it.blob }.toSet()
        val seen = LinkedHashMap<String, Pair<Sound, String>>()
        val stories = Library.stories.value.map { if (it.uid == ed?.story?.uid) ed!!.story else it }
        stories.forEach { st -> st.allSounds().forEach { s -> if (s.blob !in seen) seen[s.blob] = s to st.title } }
        Library.shared.value.forEach { s -> if (s.blob !in seen) seen[s.blob] = s to "Shared soundbox" }
        return seen.values.filter { it.first.blob !in inList }.sortedBy { it.first.name.lowercase() }
    }

    fun togglePreview(s: Sound, t: Target) {
        if (previewing == s.uid) {
            stopPreview()
            return
        }
        stopPreview()
        val f = Library.blobFile(s.blob)
        if (!f.isFile) {
            toast("This sound is missing.")
            return
        }
        try {
            val p = MediaPlayer()
            p.setDataSource(f.absolutePath)
            p.setVolume(s.volume * s.volume, s.volume * s.volume)
            p.setOnCompletionListener { stopPreview() }
            p.prepare()
            p.start()
            player = p
            previewing = s.uid
            if (s.duration == null && p.duration > 0) {
                val d = p.duration / 1000.0
                updateSound(t, s.uid) { it.copy(duration = d) }
            }
        } catch (e: Exception) {
            toast("This sound cannot be played.")
            stopPreview()
        }
    }

    fun stopPreview() {
        player?.let { runCatching { it.stop() }; it.release() }
        player = null
        previewing = null
    }

    // ------------------------------------------------------------------ table

    fun openTable(storyUid: String, chapter: Int) = scope.launch {
        flushEditor()
        stopPreview()
        val story = (if (ed?.story?.uid == storyUid) ed!!.story else Library.story(storyUid)) ?: return@launch
        val from = screen
        table?.let { closing = it.close() }
        closing?.join()
        val session = TableSession(app, story, settings, scope) { toast(it, 3200) }
        table = session
        session.open(chapter.coerceIn(0, story.chapters.lastIndex))
        screen = Screen.Table(if (from is Screen.Table) from.from else from)
    }

    fun leaveTable() {
        val t = table ?: return
        val from = (screen as? Screen.Table)?.from ?: Screen.Library
        t.stopAll()
        closing = t.close()
        table = null
        if (from == Screen.Editor && ed != null) {
            // Loop and volume changes made at the table go back into the editor.
            Library.story(t.story.uid)?.let { ed?.story = t.story }
            ed?.chapter = t.chapterIndex
            screen = Screen.Editor
        } else {
            leaveEditor()
            screen = Screen.Library
        }
    }

    fun openLink(url: String) = host.openLink(url)
}
