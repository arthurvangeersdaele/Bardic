# Recueil tales forged by Bardic

Scripts that built the ten tales signed **Bardic** in `docs/recueil/` (October 2026).

- `plan.py`: the tales, their chapters and every sound with its source file and recipe.
- `fetch.py`, `resolve.py`: pull the source files from blob-less clones of the open-source game repos.
- `build.py`: cuts, loops and levels each sound and encodes it to MP3 (needs ffmpeg and numpy).
- `forge.py`: writes `story.json` and the `.bardic` archive; `credits.py` credits every source file.
- `publish.py`: copies the tales into `docs/recueil/` and writes `docs/recueil/CREDITS.md`.

Paths at the top of the scripts point to the machine they were run on: adjust them before running again.
