# The `.bardic-flow` file format (version 1)

A `.bardic-flow` file is a story **and its timing**: a `.bardic` file (see [BARDIC_FORMAT.md](BARDIC_FORMAT.md)) with one more entry, `flow.json`. The Flow editor writes it on a computer; Bardic Flow plays it on a phone, chapter by chapter, as a cascade of timed sound cards joined by a golden wire.

## Container

The same ZIP as a `.bardic` (stored entries, UTF-8 names, no ZIP64), with the `.bardic-flow` extension:

```
story.json
flow.json
sounds/1/music/01-tavern-hearth.mp3
...
```

`story.json` and the audio are kept exactly as in the `.bardic` the Flow was made from, revision included. Dropping `flow.json` gives that `.bardic` back: Bardic Flow does it with **Export .bardic**.

## `flow.json`

```json
{
  "format": "bardic-flow",
  "version": 1,
  "id": "0d6b7e7a-2f0c-4c55-9f43-3c6f1f0c1a7e",
  "story": "6f1c2a7e-4b8d-4f3a-9a51-2d0c8e7b1f42",
  "revision": 2,
  "bard": "Arthur",
  "created": "2026-10-17T07:40:00Z",
  "forged": "2026-10-17T08:12:09Z",
  "generator": "Bardic Flow editor (web)",
  "chapters": [
    {
      "steps": [
        {
          "title": "Opening",
          "gate": true,
          "next": null,
          "cards": [
            { "name": "Tavern hearth", "file": "sounds/1/music/01-tavern-hearth.mp3", "zone": "music",
              "offset": 0, "start": 0, "duration": 182.4, "repeat": false, "fadeIn": 2, "fadeOut": 4, "volume": 0.75 },
            { "name": "Rain on stone", "file": "sounds/1/ambience/01-rain-on-stone.mp3", "zone": "ambience",
              "offset": 5, "start": 0, "duration": 300, "repeat": true, "fadeIn": 2, "fadeOut": 4, "volume": 0.6 }
          ]
        },
        {
          "title": "",
          "gate": false,
          "next": 12,
          "cards": [
            { "name": "Church bells", "file": "sounds/1/events/01-church-bells.mp3", "zone": "events",
              "offset": 0, "start": 0, "duration": 8.2, "repeat": false, "fadeIn": 0, "fadeOut": 0, "volume": 0.75 }
          ]
        }
      ]
    }
  ]
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `format` | string | Always `"bardic-flow"`. |
| `version` | integer | `1`. A reader refuses versions it does not know. |
| `id` | string | UUID of the Flow, created the first time it is forged, kept by every later revision. |
| `story` | string | `id` of the story in `story.json`. |
| `revision` | integer | Hidden counter, +1 every time the Flow is forged. |
| `bard` | string | Bard name of whoever forged this revision (registered name, or `"Forgotten Barde"`). |
| `created`, `forged`, `generator` | string | As in `story.json`. |
| `chapters` | array | One entry per chapter of `story.json`, in the same order. |
| `chapters[].steps` | array of steps | Played from top to bottom. |

A **step**:

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | Shown on the wire. Empty: the names of its sounds. |
| `gate` | boolean | `true`: the wire stops before this step and waits for the bard's tap. The first step of a chapter is always a gate. |
| `next` | number or `null` | When the step after it starts, in seconds from the start of this one. `null`: when its last card ends. Cards still playing carry on under the next step. |
| `cards` | array of cards | 0 to 3 sounds side by side. |

A **card**:

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Card title. |
| `file` | string | Path of the audio entry in the archive (any sound of the story, from any chapter or the soundbox). |
| `zone` | string | `music`, `ambience`, `events` or `soundbox`: the colour of the card. |
| `offset` | number | Seconds after the start of the step. |
| `start` | number | Seconds into the sound where it begins (trim). |
| `duration` | number | Seconds it plays. Without `repeat`, at most the length of the sound after `start`. |
| `repeat` | boolean | Loops the sound (from `start`) until `duration` is reached. Replaces the ∞, 2× and random of Bardic: a Flow only knows lengths. |
| `fadeIn`, `fadeOut` | number | Seconds, 0 for none. |
| `volume` | number | 0 to 1. |

Unknown fields must be kept when a tool re-saves a file.

## Playing

In the player, time flows down: inside a run (a gate and the steps that follow it on their own) each card sits at the height where it starts and is as tall as it lasts (long sounds squeezed, short ones stretched to stay readable), so sounds that overlap stand side by side. A thread leaves the wire at the card's start, straight across, and the gold comes down both sides of the card with the time line, closing its bottom edge when the sound ends. Each card has a start button, to start it by hand ahead of the wire; once the wire has reached it, or left its run behind, the button is gone.

A chapter opens on its first gate. Tapping a gate fades out the sounds of the run before it (its pending sounds are called off). Starting a step starts each of its cards after its `offset`; when the step ends (`next`, or its last card), the following step starts on its own, unless it is a gate, where the wire waits. After the last step, the wire waits for **Next chapter**. Tapping a step's node jumps the wire there; tapping a playing card fades it out.

## A first Flow from a `.bardic`

Importing a plain `.bardic` builds a first Flow for each chapter: the first music and up to two ambiances open the chapter together, then every other music, the other ambiances (three at a time) and each event get a gate of their own. Endless sounds repeat for 3 minutes (music) or 5 minutes (ambiances), sounds played twice last twice their length. When the opening holds sounds that repeat, its `next` is 30 s, so the following gate is ready without waiting for them.
