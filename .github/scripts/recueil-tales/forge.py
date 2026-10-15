"""Forges out/<slug>.bardic from the built sounds and writes credits.md sections."""
import json, os, sys, uuid, zipfile, subprocess
from datetime import datetime, timezone
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plan import STORIES
from build import jobs_for, OUT, duration
from resolve import resolve
from credits import credit, lic_md

NS = uuid.UUID('6b1d2c55-7e1a-4f0e-9a51-b4d1c0de2026')
SOUNDBOX = {   # (chapter, zone, index) picked from the chapters for quick play
    'the-1950-asylum': [(1, 'events', 3), (1, 'events', 5), (2, 'events', 2), (3, 'events', 5)],
    'treasure-island': [(1, 'events', 4), (3, 'events', 1), (3, 'events', 2), (4, 'events', 2)],
    'the-heist': [(4, 'events', 4), (3, 'events', 5), (4, 'events', 2), (2, 'events', 3)],
    'the-sandworms-desert': [(4, 'events', 1), (3, 'events', 1), (1, 'events', 1), (4, 'events', 4)],
    'seaside-story': [(1, 'events', 1), (3, 'events', 1), (1, 'events', 5), (4, 'events', 3)],
    'railway-in-the-southwest': [(1, 'events', 1), (3, 'events', 2), (3, 'events', 1), (3, 'events', 5)],
    'ai-year-2100': [(4, 'events', 2), (3, 'events', 3), (2, 'events', 3), (4, 'events', 4)],
    'space-odyssey': [(3, 'events', 5), (3, 'events', 3), (4, 'events', 2), (1, 'events', 5)],
    'le-camping-rondin-des-bois': [(4, 'events', 1), (1, 'events', 4), (2, 'events', 4), (4, 'events', 4)],
    'the-haunted-church': [(1, 'events', 2), (2, 'events', 4), (2, 'events', 5), (4, 'events', 3)],
}


def is_edited(recipe, opts):
    return not isinstance(recipe, str) or bool(opts) or recipe.startswith('BUILD:')


BUILD_SRC = {'train_on_rails': ['TG:machines/tram/tram_loop.ogg', 'OS:osfx_13.wav', 'S:sounds/clang-dull-1.ogg']}


def forge(story, now):
    jobs, chapters = jobs_for(story)
    projects, rows = [], []
    out_ch = []
    for ci, ch in enumerate(chapters, 1):
        c = {'title': ch['title'], 'description': ch['description']}
        for zone in ('music', 'ambience', 'events'):
            lst = []
            for s in ch[zone]:
                if not os.path.exists(s['_dest']):
                    raise FileNotFoundError(s['_dest'])
                lst.append({'name': s['name'], 'file': s['file'], 'loop': s['loop'], 'volume': s['volume'], 'duration': duration(s['_dest'])})
                recipe = s['_recipe']
                srcs = s['_src'] or BUILD_SRC.get(str(recipe)[6:], [])
                creds = [credit(resolve(r)) for r in dict.fromkeys(srcs)]
                for cr in creds:
                    if cr['project'] not in projects:
                        projects.append(cr['project'])
                edited = is_edited(recipe, {})
                rows.append((s['file'][len('sounds/'):], edited, creds))
            c[zone] = lst
        out_ch.append(c)
    soundbox = []
    for (ci, zone, i) in SOUNDBOX[story['slug']]:
        src = out_ch[ci - 1][zone][i - 1]
        soundbox.append({'name': src['name'], 'file': src['file'], 'loop': 'once', 'volume': 0.8, 'duration': src['duration']})
    desc = story['description'] + ' Sounds from ' + ', '.join(projects[:-1]) + ' and ' + projects[-1] + ' (see the Bardic sound credits).'
    js = {
        'format': 'bardic', 'version': 2,
        'id': str(uuid.uuid5(NS, story['slug'])), 'revision': 1, 'bard': 'Bardic',
        'title': story['title'], 'description': desc,
        'created': now, 'forged': now, 'generator': 'Bardic tale forge',
        'chapters': out_ch, 'soundbox': soundbox,
    }
    path = os.path.join(OUT, story['slug'] + '.bardic')
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_STORED) as z:
        z.writestr(zipfile.ZipInfo('story.json', date_time=(2026, 10, 15, 22, 0, 0)), json.dumps(js, ensure_ascii=False, indent=1).encode('utf-8'))
        seen = set()
        for c in out_ch:
            for zone in ('music', 'ambience', 'events'):
                for s in c[zone]:
                    if s['file'] in seen:
                        continue
                    seen.add(s['file'])
                    zi = zipfile.ZipInfo(s['file'], date_time=(2026, 10, 15, 22, 0, 0)); zi.compress_type = zipfile.ZIP_STORED
                    z.writestr(zi, open(os.path.join(OUT, story['slug'], s['file']), 'rb').read())
    # credits section
    md = [f"## {story['title']}", '',
          f"Tale `{story['slug']}.bardic` in the Recueil, forged by Bardic.", '',
          '| File | From | Author | Licence |', '| --- | --- | --- | --- |']
    for f, edited, creds in rows:
        frm = '<br>'.join(f"{cr['project']}: [{cr['file']}]({cr['url']})" + (f" ([original]({cr['origin']}))" if cr['origin'].startswith('http') else '') for cr in creds)
        who = '<br>'.join(cr['author'] for cr in creds)
        lic = '<br>'.join(lic_md(cr['license']) for cr in creds)
        md.append(f"| `{f}`{' *edited*' if edited else ''} | {frm} | {who} | {lic} |")
    md.append('')
    return path, js, '\n'.join(md)


if __name__ == '__main__':
    flt = sys.argv[1] if len(sys.argv) > 1 else ''
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    allmd = []
    for s in STORIES:
        if flt not in s['slug']:
            continue
        path, js, md = forge(s, now)
        n = sum(len(c[z]) for c in js['chapters'] for z in ('music', 'ambience', 'events'))
        print(f"{os.path.getsize(path) / 1048576:6.1f} MB  {n} sounds  {path}")
        allmd.append(md)
    open(os.path.join(OUT, 'credits.md'), 'w').write('\n'.join(allmd))
