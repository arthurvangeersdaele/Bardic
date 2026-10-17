#!/usr/bin/env python3
"""Builds the discovery tale of Bardic Flow: Underwater Adventure, timed step by step.

Reads the web edition's sounds (docs/play/sounds/underwater and the soundbox) and writes
docs/flow/discovery/261017_underwater-adventure.bardic-flow (a .bardic plus flow.json,
see BARDIC_FLOW_FORMAT.md). Run from the repo root:

    python3 .github/scripts/build_flow_discovery.py
"""
import json
import re
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLAY = ROOT / 'docs' / 'play'
OUT = ROOT / 'docs' / 'flow' / 'discovery' / '261017_underwater-adventure.bardic-flow'
STAMP = '2026-10-17T07:00:00Z'

library = json.loads((PLAY / 'library.json').read_text())
stories = json.loads((PLAY / 'stories.json').read_text())['stories']
meta = next(s for s in stories if s['id'] == 'underwater')


def length(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True, check=True).stdout
    return round(float(out.strip()), 1)


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


# ---------- story.json, as the Story builder would write it ----------
files = {}      # archive path -> source file
by_name = {}    # (chapter index or 'sb', sound name) -> sound
chapters = []
for ci, ch in enumerate(meta['chapters']):
    src = library['chapters'][f"underwater/{ch['id']}"]
    out = {'title': ch['title']}
    for zone in ('music', 'ambience', 'events'):
        out[zone] = []
        for k, s in enumerate(src.get(zone, [])):
            path = f"sounds/{ci + 1}/{zone}/{k + 1:02d}-{slug(s['name'])}.mp3"
            files[path] = PLAY / s['file']
            sound = {'name': s['name'], 'file': path, 'loop': 'once' if zone == 'events' else 'infinite',
                     'volume': 0.75, 'duration': length(PLAY / s['file'])}
            out[zone].append(sound)
            by_name[(ci, s['name'])] = dict(sound, zone=zone)
    chapters.append(out)

SOUNDBOX = ['Critical hit', 'Level up', 'Fireball', 'Explosion', 'Gold coins', 'Drink a potion', 'Creaking door', 'Evil laugh', 'Fanfare']
soundbox = []
for k, name in enumerate(SOUNDBOX):
    s = next(x for x in library['soundbox'] if x['name'] == name)
    path = f"sounds/soundbox/{k + 1:02d}-{slug(name)}.mp3"
    files[path] = PLAY / s['file']
    sound = {'name': name, 'file': path, 'loop': 'once', 'volume': 0.75, 'duration': length(PLAY / s['file'])}
    soundbox.append(sound)
    by_name[('sb', name)] = dict(sound, zone='soundbox')

story = {
    'format': 'bardic', 'version': 2, 'id': '7b0e5d1c-5a43-4c0e-9f7e-2a6d1f3c9e01', 'revision': 1, 'bard': 'Bardic',
    'title': meta['title'],
    'description': f"{meta['blurb']} Sounds from Battle for Wesnoth and 0 A.D., credited file by file in the Bardic repository (docs/play/sounds/CREDITS.md).",
    'created': STAMP, 'forged': STAMP, 'generator': 'Bardic Flow discovery script', 'chapters': chapters, 'soundbox': soundbox,
}


# ---------- flow.json: the timing ----------
def card(ch, name, offset=0, duration=None, repeat=False, fade_in=0, fade_out=0, volume=0.75, start=0):
    s = by_name[(ch, name)]
    return {'name': name, 'file': s['file'], 'zone': s['zone'], 'offset': offset, 'start': start,
            'duration': duration if duration is not None else round(s['duration'] - start, 1),
            'repeat': repeat, 'fadeIn': fade_in, 'fadeOut': fade_out, 'volume': volume}


def step(title, cards, gate=True, next_=None):
    return {'title': title, 'gate': gate, 'next': next_, 'cards': cards}


AMB = 600  # ambiances hold for ten minutes, the time of a scene

flow_chapters = [
    {'steps': [  # 1. Chill on the beach
        step('The beach at noon', [
            card(0, 'Mediterranean waves', fade_in=4, fade_out=8, volume=0.55),
            card(0, 'Gentle waves', duration=AMB, repeat=True, fade_in=3, fade_out=6, volume=0.6),
            card(0, 'Tropical day', offset=6, duration=AMB, repeat=True, fade_in=5, fade_out=6, volume=0.45),
        ], next_=20),
        step('Someone walks by', [card(0, 'Footsteps in the sand', volume=0.7)], gate=False),
        step('A swim', [card(0, 'Splash', volume=0.8)]),
        step('A ship far out', [
            card(0, 'Ship horn far away', volume=0.6),
            card(0, 'Ship horn far away', offset=9, volume=0.4),
        ]),
    ]},
    {'steps': [  # 2. The tsunami
        step('The ground shakes', [
            card(1, 'Earthquake rumble', volume=0.85),
            card(1, 'Suspense', offset=3, duration=90, fade_in=5, fade_out=8, volume=0.6),
            card(1, 'Storm winds', offset=4, duration=AMB, repeat=True, fade_in=6, fade_out=6, volume=0.4),
        ], next_=12),
        step('Thunder', [card(1, 'Thunder', volume=0.7)], gate=False),
        step('The giant wave', [
            card(1, 'The giant wave', volume=0.9),
            card(1, 'Panic scream', offset=2, volume=0.6),
            card(1, 'Raging sea', offset=3, duration=AMB, repeat=True, fade_in=4, fade_out=6, volume=0.65),
        ], next_=12),
        step('Swept away', [card(1, 'Point of no return', fade_in=2, fade_out=8, volume=0.7)]),
    ]},
    {'steps': [  # 3. Discovering the underwater world
        step('Below the surface', [
            card(2, 'Deep water', duration=AMB, repeat=True, fade_in=4, fade_out=6, volume=0.6),
            card(2, 'Bubbles', offset=0.5, volume=0.7),
            card(2, 'The deep path', offset=2, fade_in=6, fade_out=8, volume=0.55),
        ], next_=25),
        step('The current', [card(2, 'Ocean current', duration=480, repeat=True, fade_in=6, fade_out=6, volume=0.4)], gate=False, next_=15),
        step('Bubbles rise', [card(2, 'Bubbles', volume=0.5)], gate=False),
        step('A mermaid sings', [
            card(2, 'Mermaid call', volume=0.75),
            card(2, 'Mermaid call', offset=3, volume=0.45),
        ]),
        step('Something huge', [card(2, 'Something huge swims by', volume=0.9)]),
    ]},
    {'steps': [  # 4. The Pirates ship
        step('Aboard the pirate ship', [
            card(3, 'Creaking ship', duration=AMB, repeat=True, fade_in=3, fade_out=6, volume=0.6),
            card(3, 'Three sheets', offset=1, fade_in=4, fade_out=8, volume=0.55),
            card(3, 'Harbor', offset=4, duration=AMB, repeat=True, fade_in=5, fade_out=6, volume=0.3),
        ], next_=20),
        step('The treasure', [
            card(3, 'Treasure chest', volume=0.8),
            card('sb', 'Gold coins', offset=0.4, volume=0.7),
        ]),
        step('Ramming speed!', [
            card(3, 'Ramming speed', volume=0.85),
            card(3, 'Cannon fire', offset=1.5, volume=0.85),
            card(3, 'Cannon fire', offset=4, volume=0.6),
        ]),
        step('Boarding', [
            card(3, 'Cutlass clash', volume=0.8),
            card(3, 'Musket shot', offset=1.2, volume=0.75),
            card(3, 'Cutlass clash', offset=2.4, volume=0.7),
        ], gate=False),
        step('Bandit country', [card(3, 'Bandit country', fade_in=3, fade_out=6, volume=0.6)]),
    ]},
    {'steps': [  # 5. The Kraken
        step('Storm at sea', [
            card(4, 'Storm at sea', duration=AMB, repeat=True, fade_in=3, fade_out=6, volume=0.55),
            card(4, 'Weight of revenge', offset=2, fade_in=5, fade_out=8, volume=0.6),
            card(4, 'Hull under strain', offset=5, duration=AMB, repeat=True, fade_in=5, fade_out=6, volume=0.4),
        ], next_=15),
        step('The Kraken rises', [
            card(4, 'Kraken roar', volume=0.95),
            card(4, 'Tentacle slam', offset=3, volume=0.8),
        ]),
        step('Tentacles everywhere', [
            card(4, 'Tentacle slam', volume=0.8),
            card(4, 'Tentacle slam', offset=2.5, volume=0.65),
            card(4, 'The hull breaks', offset=4, volume=0.9),
        ], gate=False),
        step('Man overboard', [card(4, 'Man overboard', volume=0.85)]),
        step('The final strike', [
            card(4, 'Kraken roar', volume=0.9),
            card(4, 'The Kraken dies', offset=4.5, volume=0.95),
            card('sb', 'Fanfare', offset=8.5, volume=0.7),
        ]),
    ]},
]

flow = {
    'format': 'bardic-flow', 'version': 1, 'id': '3c9a6e2f-81d4-4b7a-a5e2-6f0b9d4c2a17', 'story': story['id'],
    'revision': 2, 'bard': 'Bardic', 'created': STAMP, 'forged': STAMP, 'generator': 'Bardic Flow discovery script',
    'chapters': flow_chapters,
}

OUT.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_STORED) as z:
    z.writestr('story.json', json.dumps(story, indent=2, ensure_ascii=False) + '\n')
    z.writestr('flow.json', json.dumps(flow, indent=2, ensure_ascii=False) + '\n')
    for path in sorted(files):
        z.write(files[path], path)
print(f'{OUT.relative_to(ROOT)}: {OUT.stat().st_size / 1048576:.1f} MB, {sum(len(c["steps"]) for c in flow_chapters)} steps')
