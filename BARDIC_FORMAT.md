# The `.bardic` file format (version 2)

A `.bardic` file is one story, sounds included, that can be shared between game masters. The web Story builder writes it, the Recueil lists it, and the Android app and Bardic for iPhone import and export it.

## Container

- A standard **ZIP archive** with the `.bardic` extension.
- Entries are written **stored** (method 0, no compression): MP3 files do not compress, and stored entries open instantly on a phone. Readers must also accept **deflated** entries (method 8), in case someone zips a story by hand.
- File names are UTF-8 (general purpose flag bit 11).
- The first entry is `story.json`. Readers must not rely on the order, though.
- No ZIP64: a `.bardic` file stays under 4 GB. Files shared through the Recueil must stay under **100 MB** (GitHub's limit).

```
story.json
sounds/1/music/01-tavern-hearth.mp3
sounds/1/ambience/01-rain-on-stone.mp3
sounds/1/events/01-church-bells.mp3
sounds/2/music/01-final-duel.mp3
sounds/soundbox/01-critical-hit.mp3
```

The folder layout above is what the builder writes, but readers find sounds **only through the `file` paths in `story.json`**, never by guessing paths.

## `story.json`

```json
{
  "format": "bardic",
  "version": 2,
  "id": "6f1c2a7e-4b8d-4f3a-9a51-2d0c8e7b1f42",
  "revision": 3,
  "bard": "Arthur",
  "title": "The Drowned Abbey",
  "description": "A flooded monastery, a choir of ghosts and a very angry abbot.",
  "created": "2026-10-13T18:40:00Z",
  "forged": "2026-10-15T20:12:09Z",
  "generator": "Bardic Story builder (web)",
  "chapters": [
    {
      "title": "The flooded nave",
      "music": [
        { "name": "Tavern hearth", "file": "sounds/1/music/01-tavern-hearth.mp3", "loop": "infinite", "volume": 0.75, "duration": 182.4 }
      ],
      "ambience": [],
      "events": []
    }
  ],
  "soundbox": [
    { "name": "Critical hit", "file": "sounds/soundbox/01-critical-hit.mp3", "loop": "once", "volume": 0.75 }
  ]
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `format` | string | yes | Always `"bardic"`. |
| `version` | integer | yes | `2`. A reader refuses versions it does not know. |
| `id` | string | yes | UUID of the story, created at the first forge and kept by every later revision. Lets the app recognise a newer revision of a story it already has. |
| `revision` | integer | yes | Hidden counter, 1 for the first forge, +1 every time the story is forged again. Never typed by hand. |
| `bard` | string | yes | Bard name of whoever forged this revision, taken from the settings (app or web). 1 to 60 characters. |
| `title` | string | yes | Story title, 1 to 120 characters. |
| `description` | string | no | One or two sentences. |
| `created` | string | no | ISO 8601 date of the first forge, kept across revisions. |
| `forged` | string | no | ISO 8601 date of this revision. |
| `generator` | string | no | Tool that wrote the file. |
| `chapters` | array | yes | At least one chapter, in play order. |
| `chapters[].title` | string | yes | Chapter title. |
| `chapters[].music` / `ambience` / `events` | array of sounds | yes | The three zones of the mixing table. May be empty. |
| `soundbox` | array of sounds | yes | Quick effects for this story. May be empty. |

A **sound**:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | Card title. |
| `file` | string | yes | Path of the audio entry inside the archive. MP3 recommended; OGG, M4A and WAV are accepted. |
| `loop` | string | yes | `"once"`, `"twice"` or `"infinite"` (the 1×, 2× and ∞ of the app). |
| `volume` | number | no | 0 to 1, default 0.75. |
| `duration` | number | no | Seconds, informative only. |

Default loop modes used by the builder: Music and Ambience `infinite`, Events and Soundbox `once`.

Unknown fields must be kept when a tool re-saves a file, so later versions can add things without breaking older ones.

## Versioning a story

Every tool that writes a `.bardic` file (web Story builder, Android app, Bardic for iPhone) does the same thing when it forges:

1. keep `id` and `created` from the opened file, or create them for a new story;
2. set `revision` to the opened revision + 1 (1 for a new story);
3. set `bard` to the bard name from the settings, and `forged` to now.

The bard name is set once, in the app settings or in the web player's Settings (it is shared with the Story builder). A file cannot be forged without one.

## Version 1

Version 1 files (October 2026) have no `id`, `revision` or `bard`, and an optional `author`. Readers still accept them: `author` becomes `bard`, `revision` counts as 1 and a new `id` is created when they are forged again, which writes version 2.
