#!/usr/bin/env python3
"""Checks every .bardic file in docs/recueil/ and writes docs/recueil/index.json for the Recueil page.

    python3 .github/scripts/build_recueil_index.py          # rebuild index.json
    python3 .github/scripts/build_recueil_index.py --check  # only validate (pull requests)

Format: BARDIC_FORMAT.md at the repo root.
"""
import json
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

RECUEIL = Path(__file__).resolve().parents[2] / "docs" / "recueil"
ZONES = ("music", "ambience", "events")
LOOPS = ("once", "twice", "infinite")
LIMIT = 100 * 1024 * 1024


def check(path: Path):
    errors = []
    size = path.stat().st_size
    if size > LIMIT:
        errors.append(f"{size / 1048576:.0f} MB, over GitHub's 100 MB limit")
    try:
        zf = zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        return None, ["not a ZIP archive"]
    names = set(zf.namelist())
    if "story.json" not in names:
        return None, ["no story.json inside"]
    try:
        story = json.loads(zf.read("story.json").decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        return None, [f"story.json is not valid JSON ({exc})"]
    if story.get("format") != "bardic":
        errors.append('format must be "bardic"')
    if story.get("version") != 1:
        errors.append("version must be 1")
    title = story.get("title")
    if not isinstance(title, str) or not title.strip():
        errors.append("missing title")
    chapters = story.get("chapters")
    if not isinstance(chapters, list) or not chapters:
        errors.append("at least one chapter is needed")
        chapters = []
    sounds = 0

    def sound_list(items, where):
        nonlocal sounds
        if not isinstance(items, list):
            errors.append(f"{where} must be a list")
            return
        for s in items:
            sounds += 1
            if not isinstance(s, dict) or not s.get("name") or not s.get("file"):
                errors.append(f"{where}: a sound has no name or file")
                continue
            if s["file"] not in names:
                errors.append(f"{where}: {s['file']} is missing from the archive")
            if s.get("loop") not in LOOPS:
                errors.append(f"{where}: {s['name']} has an unknown loop mode")

    for i, ch in enumerate(chapters, 1):
        if not isinstance(ch, dict) or not str(ch.get("title", "")).strip():
            errors.append(f"chapter {i} has no title")
            continue
        for z in ZONES:
            sound_list(ch.get(z, []), f"chapter {i} {z}")
    sound_list(story.get("soundbox", []), "soundbox")
    entry = {
        "file": path.name,
        "title": (title or path.stem).strip() if isinstance(title, str) else path.stem,
        "author": story.get("author", ""),
        "description": story.get("description", ""),
        "chapters": [str(c.get("title", "")).strip() for c in chapters if isinstance(c, dict)],
        "sounds": sounds,
        "size": size,
    }
    return entry, errors


def main():
    only_check = "--check" in sys.argv
    files = sorted(RECUEIL.glob("*.bardic"))
    tales, failed = [], False
    for f in files:
        entry, errors = check(f)
        if errors:
            failed = True
            print(f"::error file=docs/recueil/{f.name}::{f.name}: " + "; ".join(errors))
        else:
            print(f"ok  {f.name}: {entry['title']} ({len(entry['chapters'])} chapters, {entry['sounds']} sounds)")
            tales.append(entry)
    if only_check:
        sys.exit(1 if failed else 0)
    tales.sort(key=lambda t: t["title"].lower())
    out = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "tales": tales}
    old = RECUEIL / "index.json"
    if old.exists():
        prev = json.loads(old.read_text(encoding="utf-8"))
        if prev.get("tales") == tales:
            print("index.json already up to date")
            return
    old.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"index.json: {len(tales)} tales")


if __name__ == "__main__":
    main()
