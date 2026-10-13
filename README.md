# Bardic

Game Master Phone Sound Table: an Android app that lets tabletop RPG game masters run music, ambience and sound effects live from their phone.

Project page: https://arthurvangeersdaele.github.io/Bardic/

**Play it in your browser:** https://arthurvangeersdaele.github.io/Bardic/play/ with four ready-made stories (The Forest Adventure, The Big War, Underwater Adventure, Werewolf), the mixing table and the soundbox. No import and no story editing in the web edition; its sounds live in [`docs/play/sounds/`](docs/play/sounds/).

## Status

**Step 1: audio engine prototype** (in progress). The app currently opens on an engine test screen: 20 sound slots mixed by a native engine, with live CPU load, xruns and latency, to validate that 20 simultaneous MP3s play without glitches.

## Try it on your phone

1. Open the [latest dev build](https://github.com/arthurvangeersdaele/bardic/releases/tag/dev-latest) on your Android phone.
2. Download the `.apk` and open it. Allow installs from your browser when Android asks.
3. In the app, tap **Pick MP3s**, select one or more files, then **Play all**.

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

- `stories.json`: the four stories and their chapters;
- `sounds/<story>/<chapter>/{music,ambience,events}/*.mp3` and `sounds/soundbox/*.mp3`: the audio files;
- `library.json`: the list of sound files, rebuilt automatically by the **Update sound library** action when MP3s are pushed (or by hand with `python3 .github/scripts/build_sound_library.py`).

Opening a story downloads every MP3 of every chapter into memory, so each sound starts instantly. Themes (Obsidian, Parchment, Blood, Divination, each dark or light), fade-out length, music crossfade and screen wake lock are in Settings.

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

1. Audio engine prototype (in progress)
2. Stories, chapters and local database (Room)
3. Live mixing table
4. Chapter editor and sound picker
5. Soundbox, settings, themes (Parchment, Obsidian, Blood, Divination), `.bardic` export
