#!/usr/bin/env python3
"""Builds docs/play/library.json from the MP3 files found in docs/play/sounds/.

Layout read by the web player:

    docs/play/sounds/<story>/<chapter>/music/*.mp3
    docs/play/sounds/<story>/<chapter>/ambience/*.mp3
    docs/play/sounds/<story>/<chapter>/events/*.mp3
    docs/play/sounds/soundbox/*.mp3

Story and chapter folders are the ids listed in docs/play/stories.json.
Files are sorted by name; a leading number ("01 ", "02-") sets the order
and is hidden from the card title.
"""
import json
import os
import re
from pathlib import Path

PLAY = Path(os.environ.get("BARDIC_PLAY_DIR") or Path(__file__).resolve().parents[2] / "docs" / "play")
ZONES = ("music", "ambience", "events")
AUDIO = {".mp3", ".ogg", ".m4a", ".wav"}


def title_from(path: Path) -> str:
    name = re.sub(r"^\d+[\s._-]*", "", path.stem)
    name = re.sub(r"[_-]+", " ", name).strip() or path.stem
    return name[:1].upper() + name[1:]


def sounds_in(folder: Path) -> list:
    if not folder.is_dir():
        return []
    files = sorted(f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in AUDIO)
    return [
        {"name": title_from(f), "file": f.relative_to(PLAY).as_posix(), "size": f.stat().st_size}
        for f in files
    ]


def main() -> None:
    stories = json.loads((PLAY / "stories.json").read_text(encoding="utf-8"))["stories"]
    chapters = {}
    for story in stories:
        for chapter in story["chapters"]:
            base = PLAY / "sounds" / story["id"] / chapter["id"]
            chapters[f'{story["id"]}/{chapter["id"]}'] = {z: sounds_in(base / z) for z in ZONES}
    library = {"chapters": chapters, "soundbox": sounds_in(PLAY / "sounds" / "soundbox")}
    out = PLAY / "library.json"
    out.write_text(json.dumps(library, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    count = sum(len(v) for c in chapters.values() for v in c.values()) + len(library["soundbox"])
    print(f"library.json: {count} sounds")


if __name__ == "__main__":
    main()
