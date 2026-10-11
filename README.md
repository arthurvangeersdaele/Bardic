# Bardic

Game Master Phone Sound Table: an Android app that lets tabletop RPG game masters run music, ambience and sound effects live from their phone.

Project page: https://arthurvangeersdaele.github.io/bardic/

## Status

**Step 1 — audio engine prototype** (in progress). The app currently opens on an engine test screen: 20 sound slots mixed by a native engine, with live CPU load, xruns and latency, to validate that 20 simultaneous MP3s play without glitches.

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

## Build locally

Open the folder in Android Studio (it will offer to create the Gradle wrapper), or with Gradle 8.11 installed:

```
gradle assembleDebug
```

## Roadmap

1. Audio engine prototype — in progress
2. Stories, chapters and local database (Room)
3. Live mixing table
4. Chapter editor and sound picker
5. Soundbox, settings, themes (Parchment, Obsidian, Blood, Divination), `.bardic` export
