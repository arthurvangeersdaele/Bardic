# Bardic

Game Master Phone Sound Table: an Android app that lets tabletop RPG game masters run music, ambience and sound effects live from their phone.

Project page: https://arthurvangeersdaele.github.io/Bardic/

**Play it in your browser:** https://arthurvangeersdaele.github.io/Bardic/play/ with three ready-made stories (The Forest Adventure, The Big War, Underwater Adventure), the mixing table and the soundbox. More tales, like Werewolf, are in the Compagnie des bardes. No import and no story editing in the web edition; its sounds live in [`docs/play/sounds/`](docs/play/sounds/).

**On iPhone:** [Bardic for iPhone](https://arthurvangeersdaele.github.io/Bardic/ios/) installs from Safari on the Home Screen (Share, then Add to Home Screen). It only runs from there: opened in a browser tab it shows the install steps, and on other devices it says it is made for iPhone. The Bardic page shows its install button only on an iPhone.

## Status

**Android beta.** The app follows Bardic for iPhone, natively:

- **Library**: stories kept on the phone, with four ways to add one: New story, Discovery (the web edition's three stories), the Recueil, Import .bardic.
- **Story editor**: chapters (add, rename, reorder, remove), Music / Ambience / Events and the story's own soundbox; sounds picked from the phone or a cloud folder, or reused from another story; listen, rename, reorder, loop mode.
- **Mixing table**: the chapter on screen is loaded into the engine as soon as it opens, so its sounds start instantly. Up to 20 sounds held at once; a sound of another chapter takes the voice of an idle card. Music crossfades, green-to-red progress along the bottom edge of each card with a countdown, pause/resume all, fade out all, master volume. Events can also be set to random: they come back after a pause of 0.5 s to a maximum set in Settings (1 to 10 s).
- **Soundbox**: the story's effects and the shared ones, decoded in memory and fired without taking any of the 20 voices; pins.
- **Settings**: Obsidian, Parchment, Blood and Divination in dark, light or system mode, bard name, fade-out length, music crossfade, keep the screen awake, storage, export every story, erase everything.
- **Playback with the screen off**: a media notification with Pause all and Fade out all; pauses on phone calls and when headphones are unplugged.
- `.bardic` import and export (format 2), with the revision counter and the bard name.

The engine test screen of step 1 is still there, under Settings, About, Engine test.

## Try it on your phone

1. Open the [latest dev build](https://github.com/arthurvangeersdaele/Bardic/releases/tag/dev-latest) on your Android phone.
2. Download the `.apk` and open it. Allow installs from your browser when Android asks.
3. Tap **Discovery** to add a ready-made story, or **New story** to build one with your own sounds, then **Play**.

Every push to `main` rebuilds the APK automatically (GitHub Actions). All builds share the same debug key, so a new build installs over the previous one. When the build fails, the compiler errors are reported as an annotation on the run.

## Architecture

| Layer | Tech |
| --- | --- |
| UI | Kotlin, Jetpack Compose, landscape only; fonts Cormorant SC and Barlow Semi Condensed (SIL OFL, `app/src/main/assets/licenses/`) |
| Storage | `filesDir/library/`: one JSON file per story, the shared soundbox, and the audio files they point to (`data/Library.kt`) |
| Audio | C++ mixer on [Oboe](https://github.com/google/oboe) (AAudio / OpenSL ES), one low-latency output stream |
| Decoding | Android NDK `AMediaExtractor` + `AMediaCodec`, streamed per voice into lock-free ring buffers |
| Target | minSdk 26 (Android 8.0), targetSdk 35 (raise to 36 before publishing on Google Play) |

Engine details (`app/src/main/cpp/audio_engine.cpp`):

- up to 20 voices mixed in a single audio callback, no allocation or locks on the audio thread;
- one decoder thread fills a 2-second ring buffer per voice, so every loaded sound is pre-decoded and starts instantly;
- loop once / twice / infinite handled at decode time for gapless loops;
- fade-out on End, smoothed volume changes (no clicks), linear resampling to the device rate;
- fade envelope per voice: fade-in for crossfades, 40 ms fade on pause (no click), resume from a fade-out;
- soundbox effects decoded fully in memory and mixed as one-shots (up to 24 at once) with their own volume;
- automatic stream reopen when the output device changes (headphones, Bluetooth).

## Web edition

`docs/play/` is a static page served by GitHub Pages (no build step):

- `stories.json`: the three stories and their chapters;
- `sounds/<story>/<chapter>/{music,ambience,events}/*.mp3` and `sounds/soundbox/*.mp3`: the audio files;
- `library.json`: the list of sound files, rebuilt automatically by the **Update sound library** action when MP3s are pushed (or by hand with `python3 .github/scripts/build_sound_library.py`).

Opening a story downloads every MP3 of every chapter into memory, so each sound starts instantly. Themes (Obsidian, Parchment, Blood, Divination, each dark or light), fade-out length, music crossfade and screen wake lock are in Settings.

## Bardic for iPhone

`docs/ios/` is a Home Screen web app that follows the Android plan, served by GitHub Pages (no build step):

- **Stories kept on the phone**: stories, chapters and sounds live in IndexedDB (`db.js`), sounds as blobs shared between stories, and the app asks iOS for persistent storage (Settings shows whether it is granted and how much room is left).
- **Library**: new story, import a `.bardic` from Files, add a tale of the Recueil, or add one of the three discovery stories (downloaded once from `docs/play/`).
- **Story editor**: chapters (add, rename, reorder, remove), Music, Ambience and Events with loop mode, order and preview per sound, the story's own soundbox, a description. Sounds come from Files or are reused from any story already on the phone.
- **Mixing table**: the same table as the web player (cards, loops, fades, crossfade, master), plus a soundbox drawer with the story's effects and the shared ones. Loop and volume changes made at the table are kept.
- **Shared soundbox**: quick effects available on every table.
- **Export**: forges the next revision of a story (`.bardic` format 2, signed with the bard name) and opens the iOS share sheet: Files, iCloud Drive, AirDrop. Files are named `YYMMDD_story-title.bardic`. Settings can export every story at once, as a backup.
- **Settings**: theme (Obsidian, Parchment, Blood, Divination), dark, light or system, bard name, fade-out, music crossfade, keep the screen awake (on by default), play with the silent switch on (on by default).
- Landscape only (portrait shows a turn-your-phone screen). `sw.js` keeps the app itself offline; bump its `VERSION` (and `VERSION` in `app.js`) when shipping a change.

iOS limits to know: audio stops when the screen locks in a Home Screen app, hence the screen kept awake; storage can only be cleared by iOS when it is not marked persistent, so exporting stories now and then is the backup.

## Compagnie des bardes

`docs/compagnie/` is the community corner of the site:

Builder and playing your own files are for computers (the app does both on a phone); on a phone the Compagnie shows the Recueil only.

- **Play a tale** (`../play/#/bardic`): opens a `.bardic` file from the computer, or a tale of the Recueil, on the player's mixing table.
- **Story builder** (`builder.html`): name a story and its chapters, drop MP3s into Music, Ambience, Events and the Soundbox, and download a `.bardic` file. Everything runs in the browser, nothing is uploaded. It can also open an existing `.bardic` to edit it.
- **Recueil** (`recueil.html`): the shared library of `.bardic` files stored in `docs/recueil/`. Anyone can add one through a pull request ([how](docs/recueil/README.md)); the **Recueil** action checks pull requests and rebuilds `docs/recueil/index.json` once they are merged.

The `.bardic` format (a ZIP with `story.json` and the audio files, signed with a bard name and versioned by a hidden revision counter) is specified in [BARDIC_FORMAT.md](BARDIC_FORMAT.md). The bard name is set in Settings: the web player's (shared with the Story builder) and the Android app's. In the app, `app/src/main/java/com/bardic/app/bardic/` reads and writes the format and `settings/BardSettings.kt` keeps the bard name; the engine test screen can already open a `.bardic` and export it as its next revision.

## Icons

- `branding/`: the Bardic icon and its pumpkin version, each with rounded corners (web, social) and as a full square (stores; Android and iOS cut their own shape). 1024 × 1024 SVG.
- Android: adaptive icon in `app/src/main/res/` (`mipmap-anydpi-v26/ic_launcher.xml`, with a monochrome layer for themed icons). The pumpkin version is ready as `@mipmap/ic_launcher_pumpkin`: point `android:icon` and `android:roundIcon` in the manifest to it to switch.
- Web: `docs/icons/` (favicon and Apple touch icon).

## Build locally

Open the folder in Android Studio (it will offer to create the Gradle wrapper), or with Gradle 8.11 installed:

```
gradle assembleDebug
```

## Roadmap

- Web edition (available): play in the browser on a computer, with the Compagnie des bardes (Story builder, Recueil, playing your own `.bardic` files). On a phone, the web offers the discovery stories and the Recueil.
- Bardic for iPhone (available): Home Screen web app with stories kept on the phone, editor, mixing table, soundboxes and `.bardic` import and export.

1. Audio engine: 20 voices, gapless loops, fades (done, tested on a phone)
2. Android app beta: library, editor, mixing table, soundbox, settings and themes, `.bardic` import and export, Discovery and Recueil (available)
3. Field tests at the table, fixes and polish (in progress)
4. Release on Google Play: target API 36, store listing (planned)
