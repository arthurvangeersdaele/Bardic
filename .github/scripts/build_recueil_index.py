#!/usr/bin/env python3
"""Checks every .bardic file in docs/recueil/ and writes docs/recueil/index.json for the Recueil page,
and docs/recueil/sounds.json: every sound of every tale, for the Story builder's sound library.

    python3 .github/scripts/build_recueil_index.py          # rebuild index.json
    python3 .github/scripts/build_recueil_index.py --check  # only validate (pull requests)

In a pull request (PR_AUTHOR and BASE_REF set), --check also guards ownership:
a bard name registered in docs/recueil/bards.json (by "Connect with GitHub" in Bardic's settings)
can only sign tales sent by its GitHub owner; "Forgotten Barde" is open to everyone;
a tale already in the Recueil keeps its bard, and an update must raise its revision.

Format: BARDIC_FORMAT.md at the repo root.
"""
import hashlib
import json
import os
import struct
import subprocess
import sys
import unicodedata
import zipfile
from datetime import datetime, timezone
from pathlib import Path

RECUEIL = Path(__file__).resolve().parents[2] / "docs" / "recueil"
ZONES = ("music", "ambience", "events")
LOOPS = ("once", "twice", "infinite", "random")
# Rows of the builder's sound library: soundbox effects are listed with the events.
LIBRARY_ROW = {"music": "music", "ambience": "ambience", "events": "events", "soundbox": "events"}
LIMIT = 100 * 1024 * 1024
FORGOTTEN = "Forgotten Barde"
# Names kept for Bardic itself (same list as auth-worker/src/index.js); only the maintainer signs with them.
RESERVED = {"forgotten barde", "forgotten bard", "bardic", "compagnie des bardes", "compagnie", "recueil",
            "admin", "administrator", "moderator", "github"}


def name_key(name):
    """Case, accents, apostrophe styles and spacing do not make a different name (as in the worker)."""
    s = unicodedata.normalize("NFKD", str(name or ""))
    s = "".join(c for c in s if not unicodedata.combining(c))
    for q in "\u2019\u2018`\u00b4":
        s = s.replace(q, "'")
    return " ".join(s.lower().split())


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=False)


def from_base(base, rel, default):
    r = git("show", f"{base}:{rel}")
    if r.returncode != 0:
        return default
    try:
        return json.loads(r.stdout)
    except ValueError:
        return default


def ownership(entries, author, base, maintainer):
    """Errors per file name for a pull request by `author` against `base` (e.g. origin/main)."""
    errors = {}
    is_maintainer = author.lower() == maintainer.lower()
    changed = git("diff", "--name-only", f"{base}...HEAD", "--", "docs/recueil/").stdout.split()
    for rel in ("docs/recueil/bards.json", "docs/recueil/index.json"):
        if rel in changed and not is_maintainer:
            errors.setdefault(Path(rel).name, []).append(
                "is kept by Bardic: register a bard name in Bardic's settings (Connect with GitHub) instead")
    bards = from_base(base, "docs/recueil/bards.json", {"bards": []}).get("bards", [])
    owners = {name_key(b.get("name")): b for b in bards}
    known = {t.get("id"): t for t in from_base(base, "docs/recueil/index.json", {"tales": []}).get("tales", []) if t.get("id")}
    for e in entries:
        rel = f"docs/recueil/{e['file']}"
        if rel not in changed:
            continue
        errs = errors.setdefault(e["file"], [])
        bard, key = e["bard"], name_key(e["bard"])
        if key == name_key(FORGOTTEN):
            pass
        elif key in owners:
            owner = owners[key].get("github", "")
            if owner.lower() != author.lower() and not is_maintainer:
                errs.append(f'is signed "{bard}", a bard name registered to @{owner}: only its owner can send tales signed with it')
        elif key in RESERVED:
            if not is_maintainer:
                errs.append(f'is signed "{bard}", a name kept for Bardic itself')
        else:
            errs.append(f'is signed "{bard}", which is not a registered bard name: connect GitHub in Bardic\'s settings '
                        f'and register it, or forge the tale as {FORGOTTEN}')
        old = known.get(e["id"])
        if old:
            if name_key(old.get("bard")) != key and not is_maintainer:
                errs.append(f'updates "{old.get("title")}" by {old.get("bard")}: a tale keeps its bard, forge yours with a new id')
            elif isinstance(e.get("revision"), int) and e["revision"] <= int(old.get("revision") or 0):
                errs.append(f"is revision {e['revision']}, the Recueil already has revision {old.get('revision')}: forge it again")
    return {k: v for k, v in errors.items() if v}


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
    version = story.get("version")
    if version not in (1, 2):
        errors.append("version must be 1 or 2")
    if version == 2:
        if not str(story.get("bard", "")).strip():
            errors.append("missing bard name")
        if not isinstance(story.get("revision"), int) or story["revision"] < 1:
            errors.append("revision must be a whole number from 1")
        if not str(story.get("id", "")).strip():
            errors.append("missing story id")
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
        "id": story.get("id", ""),
        "bard": str(story.get("bard") if version == 2 else story.get("author", "")).strip(),
        "revision": story.get("revision", 1) if version == 2 else 1,
        "description": story.get("description", ""),
        "chapters": [str(c.get("title", "")).strip() for c in chapters if isinstance(c, dict)],
        "sounds": sounds,
        "size": size,
    }
    return entry, errors


def data_span(path: Path, info: zipfile.ZipInfo):
    """Byte offset and length of an entry's data inside the archive (its local header comes first)."""
    with open(path, "rb") as f:
        f.seek(info.header_offset)
        header = f.read(30)
    sig, _, _, _, _, _, _, _, _, name_len, extra_len = struct.unpack("<IHHHHHIIIHH", header)
    if sig != 0x04034B50:
        raise ValueError(f"bad local header for {info.filename}")
    return info.header_offset + 30 + name_len + extra_len, info.compress_size


def library(entries):
    """sounds.json: each distinct sound file once, in the row it was used, with where to fetch its bytes.

    The builder downloads only these bytes (an HTTP range of the .bardic file), so the sounds are not
    stored twice in the repository.
    """
    seen = {}
    for e in entries:
        path = RECUEIL / e["file"]
        zf = zipfile.ZipFile(path)
        story = json.loads(zf.read("story.json").decode("utf-8"))
        infos = {i.filename: i for i in zf.infolist()}
        places = []
        for ch in story.get("chapters", []):
            for z in ZONES:
                places += [(z, s) for s in ch.get(z, []) or []]
        places += [("soundbox", s) for s in story.get("soundbox", []) or []]
        for zone, s in places:
            info = infos.get(s.get("file"))
            if info is None or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                continue
            row = LIBRARY_ROW[zone]
            # Same audio (CRC and size) in the same row is one library entry, whichever tale it comes from.
            key = (row, info.CRC, info.file_size)
            if key in seen:
                if e["title"] not in seen[key]["tales"]:
                    seen[key]["tales"].append(e["title"])
                continue
            offset, length = data_span(path, info)
            item = {
                "id": hashlib.sha1(f"{row}:{info.CRC}:{info.file_size}".encode()).hexdigest()[:12],
                "row": row,
                "name": str(s.get("name") or Path(info.filename).stem).strip(),
                "tale": e["title"],
                "tales": [e["title"]],
                "bard": e["bard"],
                "file": e["file"],
                "path": info.filename,
                "offset": offset,
                "length": length,
                "size": info.file_size,
                "deflated": info.compress_type == zipfile.ZIP_DEFLATED,
            }
            if isinstance(s.get("duration"), (int, float)) and s["duration"] > 0:
                item["duration"] = round(float(s["duration"]), 1)
            if zone == "soundbox":
                item["effect"] = True
            seen[key] = item
    sounds = list(seen.values())
    for item in sounds:
        if len(item["tales"]) == 1:
            del item["tales"]
    sounds.sort(key=lambda x: (x["row"], x["name"].lower(), x["tale"].lower()))
    return sounds


def write_if_changed(name, key, value):
    """Writes docs/recueil/<name> unless only its "updated" date would change."""
    out = RECUEIL / name
    if out.exists():
        try:
            if json.loads(out.read_text(encoding="utf-8")).get(key) == value:
                print(f"{name} already up to date")
                return
        except ValueError:
            pass
    data = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), key: value}
    out.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{name}: {len(value)} {key}")


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
        author, base = os.environ.get("PR_AUTHOR", ""), os.environ.get("BASE_REF", "")
        if author and base:
            maintainer = os.environ.get("MAINTAINER", "arthurvangeersdaele")
            for name, errs in ownership(tales, author, base, maintainer).items():
                failed = True
                print(f"::error file=docs/recueil/{name}::{name}: " + "; ".join(errs))
            if not failed:
                print(f"ok  ownership: every tale may be sent by @{author}")
        sys.exit(1 if failed else 0)
    tales.sort(key=lambda t: t["title"].lower())
    write_if_changed("index.json", "tales", tales)
    write_if_changed("sounds.json", "sounds", library(tales))


if __name__ == "__main__":
    main()
