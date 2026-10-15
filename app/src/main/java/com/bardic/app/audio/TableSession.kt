package com.bardic.app.audio

import android.content.Context
import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.bardic.app.bardic.LoopMode
import com.bardic.app.data.Library
import com.bardic.app.data.Sound
import com.bardic.app.data.Story
import com.bardic.app.data.Zone
import com.bardic.app.settings.AppSettings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors

/** What the table reads from the engine about 15 times a second. */
class Live(val states: IntArray, val progress: FloatArray, val times: FloatArray)

/** A sound card at the table. [slot] is the engine voice it holds, if any. */
class Card(val chapterIndex: Int, val zone: Zone, sound: Sound) {
    var sound by mutableStateOf(sound)
    @Volatile var slot: Int? = null
    var failed by mutableStateOf(false)
    /** Random events: true while the sound keeps coming back. */
    var randomOn by mutableStateOf(false)
    /** Random events: when it plays again (uptime ms), 0 while it plays. */
    var nextAt by mutableLongStateOf(0L)
    @Volatile var startedAt = 0L

    /** A random event between two plays. */
    val waiting: Boolean get() = randomOn && nextAt > 0L
}

class Pad(val sound: Sound, val own: Boolean, val index: Int) {
    /** 0 loading, 1 ready, 2 unavailable */
    var state by mutableIntStateOf(0)
    var fired by mutableIntStateOf(0)
}

/**
 * One story open at the mixing table: owns the engine voices for its cards.
 * A voice is a loaded sound (up to 20). The chapter on screen is loaded first, so its sounds start
 * instantly; other chapters' sounds load when played, taking the voice of an idle card.
 */
class TableSession(
    private val context: Context,
    story: Story,
    private val settings: AppSettings,
    private val scope: CoroutineScope,
    private val onMessage: (String) -> Unit,
) {
    var story by mutableStateOf(story)
        private set
    val cards: List<Card> = story.chapters.flatMapIndexed { ci, c ->
        Zone.values().flatMap { z -> c.sounds(z).map { Card(ci, z, it) } }
    }
    var chapterIndex by mutableIntStateOf(0)
        private set
    var live by mutableStateOf(Live(IntArray(N), FloatArray(N), FloatArray(2 * N)))
        private set
    var pausedByAll by mutableStateOf<List<Card>>(emptyList())
        private set
    var pads by mutableStateOf<List<Pad>>(emptyList())
        private set

    private val owner = arrayOfNulls<Card>(N)
    private val engine = Executors.newSingleThreadExecutor { r -> Thread(r, "bardic-table").apply { priority = Thread.NORM_PRIORITY + 1 } }
        .asCoroutineDispatcher()
    private var poll: Job? = null
    /** Random events that were waiting when everything was paused, started again on resume. */
    private var heldRandom by mutableStateOf<List<Card>>(emptyList())
    private var saveJob: Job? = null
    private var closed = false

    fun cardsOf(chapter: Int, zone: Zone) = cards.filter { it.chapterIndex == chapter && it.zone == zone }

    fun open(startChapter: Int) {
        NativeEngine.start()
        applyMaster()
        applySoundboxVolume()
        PlaybackController.attach(context, this)
        setChapter(startChapter)
        poll = scope.launch {
            val states = IntArray(N)
            val progress = FloatArray(N)
            val times = FloatArray(2 * N)
            while (isActive) {
                NativeEngine.readStates(states)
                NativeEngine.readProgress(progress)
                NativeEngine.readTimes(times)
                live = Live(states.copyOf(), progress.copyOf(), times.copyOf())
                if (pausedByAll.isNotEmpty() && pausedByAll.none {
                        val st = stateOf(it)
                        st == NativeEngine.PAUSED || st == NativeEngine.PAUSING
                    }
                ) pausedByAll = emptyList()
                runRandom()
                PlaybackController.update(anyPlaying())
                delay(66)
            }
        }
        loadPads()
    }

    /** Lets go of the voices and effects. The returned job ends once the engine is free for another table. */
    fun close(): Job? {
        if (closed) return null
        closed = true
        poll?.cancel()
        flushSave()
        PlaybackController.detach(this)
        return scope.launch(engine) {
            for (i in 0 until N) if (owner[i] != null) NativeEngine.end(i, 150)
            NativeEngine.stopPads()
            delay(200)
            for (i in 0 until N) {
                NativeEngine.unload(i)
                owner[i]?.slot = null
                owner[i] = null
            }
            withContext(Dispatchers.IO) { NativeEngine.clearPads() }
            engine.close()
        }
    }

    // ------------------------------------------------------------------ state of a card

    fun stateOf(card: Card, l: Live = live): Int {
        val s = card.slot ?: return -1
        return if (owner[s] === card) l.states[s] else -1
    }

    fun isActive(card: Card, l: Live = live): Boolean = stateOf(card, l).let {
        it == NativeEngine.PLAYING || it == NativeEngine.ENDING || it == NativeEngine.PAUSING
    }

    /** 0..1, or -1 for a running infinite loop. */
    fun progressOf(card: Card, l: Live = live): Float {
        val st = stateOf(card, l)
        if (st != NativeEngine.PLAYING && st != NativeEngine.ENDING && st != NativeEngine.PAUSING && st != NativeEngine.PAUSED) return 0f
        return l.progress[card.slot ?: return 0f]
    }

    /** Seconds left, null when unknown or infinite. */
    fun remainingOf(card: Card, l: Live = live): Double? {
        val s = card.slot ?: return null
        if (owner[s] !== card) return null
        val total = l.times[2 * s + 1]
        if (total <= 0f) return null
        return (total - l.times[2 * s]).toDouble().coerceAtLeast(0.0)
    }

    fun anyPlaying(l: Live = live) = cards.any { stateOf(it, l) == NativeEngine.PLAYING }

    fun chapterPlaying(chapter: Int, l: Live = live) = cards.any { it.chapterIndex == chapter && (isActive(it, l) || it.waiting) }

    // ------------------------------------------------------------------ actions

    fun setChapter(i: Int) {
        val next = i.coerceIn(0, story.chapters.lastIndex)
        // Silence between chapters (setting): the sounds of the other chapters fade out over 4 s.
        if (settings.silenceChapters && next != chapterIndex) {
            cards.filter { it.chapterIndex != next && (isActive(it) || stateOf(it) == NativeEngine.PAUSED || it.waiting) }
                .forEach { end(it, 4000) }
            pausedByAll = pausedByAll.filter { it.chapterIndex == next }
            heldRandom = heldRandom.filter { it.chapterIndex == next }
        }
        chapterIndex = next
        val target = chapterIndex
        scope.launch(engine) {
            // Preload the chapter on screen, so its sounds start the moment they are tapped.
            for (card in cards.filter { it.chapterIndex == target }) {
                if (closed || chapterIndex != target) return@launch
                if (card.slot != null && owner[card.slot!!] === card) continue
                val slot = freeSlot(target, card, allowCurrentChapter = false) ?: break
                loadInto(card, slot)
            }
        }
    }

    fun toggle(card: Card) {
        val st = stateOf(card)
        if (card.waiting) {
            // Between two plays: tapping stops the random event.
            card.randomOn = false
            card.nextAt = 0L
            return
        }
        if (st == NativeEngine.PLAYING) {
            pause(card)
            return
        }
        val fade = settings.fadeMs
        var fadeIn = fadeInMs()
        if (card.zone == Zone.MUSIC && st != NativeEngine.ENDING) {
            val others = cards.filter { it !== card && it.zone == Zone.MUSIC && (isActive(it) || stateOf(it) == NativeEngine.PAUSED) }
            val crossing = others.any { isActive(it) }
            others.forEach { end(it, if (settings.crossfade) fade else 150) }
            if (crossing && settings.crossfade && st != NativeEngine.PAUSED) fadeIn = maxOf(fade, fadeIn)
        }
        if (card.sound.loop == LoopMode.RANDOM) {
            card.randomOn = true
            card.nextAt = 0L
        }
        card.startedAt = SystemClock.uptimeMillis()
        play(card, fadeIn)
        pausedByAll = pausedByAll.filter { it !== card }
    }

    /** Plays the random events again, after a pause of 0.5 s to the maximum set in the settings. */
    private fun runRandom() {
        val now = SystemClock.uptimeMillis()
        for (c in cards) {
            if (!c.randomOn) continue
            val st = stateOf(c)
            val sounding = st == NativeEngine.PLAYING || st == NativeEngine.PAUSING || st == NativeEngine.PAUSED || st == NativeEngine.ENDING
            if (sounding) {
                if (c.nextAt != 0L) c.nextAt = 0L
            } else if (now - c.startedAt > 400) {
                if (c.nextAt == 0L) {
                    c.nextAt = now + randomPause()
                } else if (now >= c.nextAt) {
                    c.nextAt = 0L
                    c.startedAt = now
                    play(c, fadeInMs())
                }
            }
        }
    }

    /** Fade-in when Play is tapped (and when a random event comes back), from the settings. */
    private fun fadeInMs() = settings.fadeInMs.coerceAtLeast(30)

    private fun randomPause(): Long {
        val max = settings.randomMax * 1000L
        return 500L + kotlin.random.Random.nextLong((max - 500L).coerceAtLeast(1L))
    }

    private fun play(card: Card, fadeInMs: Int) {
        PlaybackController.willPlay(context)
        scope.launch(engine) {
            var slot = card.slot?.takeIf { owner[it] === card }
            if (slot == null) {
                slot = freeSlot(chapterIndex, card, allowCurrentChapter = true)
                if (slot == null) {
                    withContext(Dispatchers.Main) {
                        onMessage("${N} sounds are already playing or paused. End one to start another.")
                    }
                    return@launch
                }
                if (!loadInto(card, slot)) return@launch
            }
            NativeEngine.play(slot, fadeInMs)
        }
    }

    fun pause(card: Card) {
        val s = card.slot ?: return
        if (owner[s] === card) NativeEngine.pause(s)
    }

    fun end(card: Card, ms: Int = settings.fadeMs) {
        card.randomOn = false
        card.nextAt = 0L
        val s = card.slot ?: return
        if (owner[s] === card) NativeEngine.end(s, ms)
    }

    fun setLoop(card: Card, loop: LoopMode) {
        card.sound = card.sound.copy(loop = loop)
        if (loop == LoopMode.RANDOM) {
            card.randomOn = isActive(card) || stateOf(card) == NativeEngine.PAUSED
        } else {
            card.randomOn = false
            card.nextAt = 0L
        }
        card.slot?.let { if (owner[it] === card) NativeEngine.setLoop(it, loop.engine) }
        saveSoon()
    }

    fun setVolume(card: Card, v: Float) {
        card.sound = card.sound.copy(volume = (v * 100).toInt() / 100f)
        card.slot?.let { if (owner[it] === card) NativeEngine.setVolume(it, curve(v)) }
        saveSoon()
    }

    fun pauseAll() {
        if (pausedByAll.isNotEmpty() || heldRandom.isNotEmpty()) {
            pausedByAll.forEach { if (stateOf(it) == NativeEngine.PAUSED) play(it, 30) }
            pausedByAll = emptyList()
            val now = SystemClock.uptimeMillis()
            heldRandom.forEach { it.randomOn = true; it.nextAt = now + randomPause() }
            heldRandom = emptyList()
        } else {
            val playing = cards.filter { stateOf(it) == NativeEngine.PLAYING }
            playing.forEach { pause(it) }
            // Random events waiting for their next play hold still too.
            val waiting = cards.filter { it.waiting }
            waiting.forEach { it.randomOn = false; it.nextAt = 0L }
            heldRandom = waiting
            pausedByAll = playing
        }
    }

    /** True while "Resume all" is offered. */
    val holding: Boolean get() = pausedByAll.isNotEmpty() || heldRandom.isNotEmpty()

    /** Pauses what plays (calls, unplugged headphones). Does nothing when all is already quiet. */
    fun pauseForInterruption() {
        if (!holding && (anyPlaying() || cards.any { it.waiting })) pauseAll()
    }

    fun stopAll() {
        cards.forEach { end(it) }
        pausedByAll = emptyList()
        heldRandom = emptyList()
        NativeEngine.stopPads()
    }

    fun applyMaster() = NativeEngine.setMasterVolume(curve(settings.master))
    fun applySoundboxVolume() = NativeEngine.setSoundboxVolume(curve(settings.soundboxVolume))

    // ------------------------------------------------------------------ soundbox

    private fun loadPads() {
        val list = story.soundbox.map { it to true } + Library.shared.value.map { it to false }
        pads = list.take(NativeEngine.MAX_PADS).mapIndexed { i, (s, own) -> Pad(s, own, i) }
        scope.launch(Dispatchers.IO) {
            for (p in pads) {
                if (closed) return@launch
                val d = runCatching { NativeEngine.loadPad(Library.blobFile(p.sound.blob), p.index) }.getOrDefault(-1f)
                withContext(Dispatchers.Main) { p.state = if (d > 0f) 1 else 2 }
            }
        }
    }

    fun fire(p: Pad) {
        if (p.state != 1) return
        PlaybackController.willPlay(context)
        val g = (p.sound.volume / 0.75f).coerceAtMost(1f)
        NativeEngine.firePad(p.index, g * g)
        p.fired++
    }

    // ------------------------------------------------------------------ voices

    /** A voice for [card]: a free one, else one held by an idle card (other chapters first). Engine thread. */
    private fun freeSlot(chapter: Int, card: Card, allowCurrentChapter: Boolean): Int? {
        (0 until N).firstOrNull { owner[it] == null }?.let { return it }
        val states = IntArray(N).also { NativeEngine.readStates(it) }
        fun idle(i: Int) = states[i] == NativeEngine.READY || states[i] == NativeEngine.LOADING ||
            states[i] == NativeEngine.DONE || states[i] == NativeEngine.EMPTY
        (0 until N).firstOrNull { idle(it) && owner[it]?.chapterIndex != chapter }?.let { return it }
        if (allowCurrentChapter) (0 until N).firstOrNull { idle(it) && owner[it] !== card }?.let { return it }
        return null
    }

    /** Engine thread. */
    private fun loadInto(card: Card, slot: Int): Boolean {
        owner[slot]?.slot = null
        owner[slot] = card
        card.slot = slot
        val ok = runCatching {
            NativeEngine.load(Library.blobFile(card.sound.blob), slot, card.sound.loop.engine)
        }.getOrDefault(false)
        if (!ok) {
            owner[slot] = null
            card.slot = null
            scope.launch(Dispatchers.Main) { card.failed = true }
            return false
        }
        NativeEngine.setVolume(slot, curve(card.sound.volume))
        return true
    }

    // ------------------------------------------------------------------ saving loop and volume changes

    private fun saveSoon() {
        saveJob?.cancel()
        saveJob = scope.launch {
            delay(800)
            save()
        }
    }

    private fun flushSave() {
        if (saveJob?.isActive == true) {
            saveJob?.cancel()
            save()
        }
    }

    private fun save() {
        val bySound = cards.associateBy { it.sound.uid }
        val updated = story.copy(chapters = story.chapters.map { c ->
            c.copy(
                music = c.music.map { bySound[it.uid]?.sound ?: it },
                ambience = c.ambience.map { bySound[it.uid]?.sound ?: it },
                events = c.events.map { bySound[it.uid]?.sound ?: it },
            )
        })
        story = updated
        scope.launch(Dispatchers.IO) { runCatching { Library.putStory(updated, touch = false) } }
    }

    companion object {
        const val N = NativeEngine.MAX_VOICES
        fun curve(v: Float) = v * v
    }
}
