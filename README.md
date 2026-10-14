# Bardic

Game Master Phone Sound Table: an Android app that lets tabletop RPG game masters run music, ambience and sound effects live from their phone.

Project page: https://arthurvangeersdaele.github.io/Bardic/

**Play it in your browser:** https://arthurvangeersdaele.github.io/Bardic/play/ with three ready-made stories (The Forest Adventure, The Big War, Underwater Adventure), the mixing table and the soundbox. More tales, like Werewolf, are in the Compagnie des bardes. No import and no story editing in the web edition; its sounds live in [`docs/play/sounds/`](docs/play/sounds/).

**On iPhone:** [Bardic for iPhone](https://arthurvangeersdaele.github.io/Bardic/ios/) installs from Safari on the Home Screen (Share, then Add to Home Screen). It only runs from there: opened in a browser tab it shows the install steps, and on other devices it says it is made for iPhone. The Bardic page shows its install button only on an iPhone.

## Status

**Step 1: audio engine prototype** (in progress). The app currently opens on an engine test screen: 20 sound slots mixed by a native engine, with live CPU load, xruns and latency, to validate that 20 simultaneous MP3s play without glitches.

## Try it on your phone

1. Open the [latest dev build](https://github.com/arthurvangeersdaele/bardic/releases/tag/dev-latest) on your Android phone.
2. Download the `.apk` and open it. Allow installs from your browser when Android asks.
3. In the app, tap **Demo sounds** (generated test sounds, no file needed) or **Pick MP3s** to use your own files, then **Play all**. The status line under the stats says what was loaded, or why not.

Every push to `main` rebuilds the APK automatically (GitHub Actions). All builds share the same debug key, so a new build installs over the previous one.

## Architecture

| Layer | Tech |
| --- | --- |
| UI | Kotlin, Jetpack Compose (Material 3), landscape only |
| Audio | C++ mixer on [Oboe](https://github.com/google/oboe) (AAudio / OpenSL ES), one low-latency output stream |
| Decoding | Android NDK `AMediaExtractor` + `AMediaCodec`, streamed per voice into lock-free ring buffers |
| Target | minSdk 26 (Android 8.0), targetSdk 35 (raise to 36 before publishing on Google Play) |

Engine details (`app/src/main/cpp/audio_engine.cpp`):

- up to 20 voices mixed in a single audio callback, no allocation or locks on the audio thread;
- one decoder thread fills a 2-second ring buffer per voice, so every loaded sound is pre-decoded and starts instantly;
- loop once / twice / infinite handled at decode time for gapless loops;
- fade-out on End, smoothed volume changes (no clicks), linear resampling to the device rate;
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

1. Audio engine prototype (in progress)
2. Stories, chapters and local database (Room)
3. Live mixing table
4. Chapter editor and sound picker
5. Soundbox, settings, themes (Parchment, Obsidian, Blood, Divination), `.bardic` export
