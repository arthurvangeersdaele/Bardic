# Web player sounds

The current sounds come from Battle for Wesnoth, 0 A.D., Flare and Stendhal (GPL, Creative Commons, public domain): see [CREDITS.md](CREDITS.md). If you replace or add files, keep that list up to date.

Drop MP3 files in these folders and push to `main`: the **Update sound library** action rebuilds `docs/play/library.json` and the web player shows them on the next page load.

```
sounds/
├── forest/                     The Forest Adventure
│   ├── 1-in-the-forest/
│   │   ├── music/              one track at a time, crossfades, loops forever by default
│   │   ├── ambience/           layered, loops forever by default
│   │   └── events/             one-shots, play once by default
│   ├── 2-fight-with-a-bear/
│   ├── 3-a-night-at-the-pub/
│   └── 4-the-human-village/
├── big-war/                    The Big War (5 chapters)
├── underwater/                 Underwater Adventure (5 chapters)
└── soundbox/                   quick effects, shared by every story
```

- The card title comes from the file name: `01_rain-on-leaves.mp3` shows as **Rain on leaves**. A leading number only sets the order.
- MP3 is the safest format (it plays in every browser). Keep each file under 100 MB (GitHub limit); 128 to 192 kbps is plenty.
- Opening a story downloads every chapter of that story, so it can play any sound instantly. Lighter files mean a faster start, especially on mobile data.
- Story and chapter titles live in `docs/play/stories.json`. If you rename a chapter folder, change its `id` there too.
- To rebuild the list by hand: `python3 .github/scripts/build_sound_library.py`.
