"""Credits (project, author, licence, link) for every source file used by the tales."""
import csv, os, re, urllib.parse
META = '/home/claude/meta'

LIC_URL = {
    'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/',
    'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
    'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
    'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
    'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
    'GNU GPL v2+': 'https://www.gnu.org/licenses/old-licenses/gpl-2.0.html',
    'GNU GPL v3': 'https://www.gnu.org/licenses/gpl-3.0.html',
    'GNU GPL v3+': 'https://www.gnu.org/licenses/gpl-3.0.html',
    'GNU GPL': 'https://www.gnu.org/licenses/gpl-3.0.html',
    'OGA-BY 3.0': 'https://static.opengameart.org/OGA-BY-3.0.txt',
    'BSD': 'https://opensource.org/license/bsd-3-clause',
}

REPO_URL = {
    'W': ('Battle for Wesnoth', 'https://github.com/wesnoth/wesnoth/blob/master/'),
    'Z': ('0 A.D.', 'https://github.com/0ad/0ad/blob/main/'),
    'F': ('Flare', 'https://github.com/flareteam/flare-game/blob/master/'),
    'S': ('Stendhal', 'https://github.com/arianne/stendhal/blob/master/'),
    'FC': ('FreeCol', 'https://github.com/FreeCol/freecol/blob/master/'),
    'PI': ('Pioneer Space Simulator', 'https://github.com/pioneerspacesim/pioneer/blob/master/'),
    'TG': ('/tg/station 13', 'https://github.com/tgstation/tgstation/blob/master/'),
    'RE': ('Red Eclipse', 'https://github.com/redeclipse/sounds/blob/master/'),
    'OC': ('OpenClonk', 'https://github.com/openclonk/openclonk/blob/master/'),
    'UH': ('Unknown Horizons', 'https://github.com/unknown-horizons/unknown-horizons/blob/master/'),
    'SPD': ('Shattered Pixel Dungeon', 'https://github.com/00-Evan/shattered-pixel-dungeon/blob/master/'),
    'ZK': ('Zero-K', 'https://github.com/ZeroK-RTS/Zero-K/blob/master/'),
    'MG': ('MegaGlest', 'https://github.com/MegaGlest/megaglest-data/blob/develop/'),
    'ES': ('Endless Sky', 'https://github.com/endless-sky/endless-sky/blob/master/'),
    'CB': ('Colobot: Gold Edition', 'https://github.com/colobot/colobot-music/blob/master/'),
    'MD': ('Mindustry', 'https://github.com/Anuken/Mindustry/blob/master/'),
    'OS': ('OpenSFX (OpenTTD)', 'https://github.com/OpenTTD/OpenSFX/blob/master/'),
    'OSE': ('OpenRCT2 OpenSoundEffects', 'https://github.com/OpenRCT2/OpenSoundEffects/blob/master/'),
    'OM': ('OpenRCT2 OpenMusic', 'https://github.com/OpenRCT2/OpenMusic/blob/master/'),
    'CD': ('Cataclysm: DDA CC-Sounds', 'https://github.com/Fris0uman/CDDA-Soundpacks/blob/master/'),
    'HS': ('Hypersomnia', 'https://github.com/TeamHypersomnia/Hypersomnia/blob/master/'),
}


def norm_lic(s):
    s = s.replace('*', '').strip()
    s = s.replace('Creative Commons Attribution-ShareAlike', 'CC BY-SA').replace('Creative Commons Attribution', 'CC BY').replace('Creative Commons Zero', 'CC0').replace(' Unported', '')
    if s.startswith('OGA BY'): return 'OGA-BY 3.0'
    if s.upper().startswith('BSD'): return 'BSD'
    t = s.upper().replace('-', ' ').replace('  ', ' ')
    if 'CC0' in t or 'CC 0' in t or 'ZERO' in t or 'PUBLIC DOMAIN' in t:
        return 'CC0' if 'CC' in t else 'Public domain'
    m = re.search(r'BY[ -]?SA ?(\d\.\d)?', t)
    if m:
        return 'CC BY-SA ' + (m.group(1) or '3.0')
    m = re.search(r'CC[ -]?BY ?(\d\.\d)?', t)
    if m:
        return 'CC BY ' + (m.group(1) or '3.0')
    if 'GPL' in t:
        return 'GNU GPL v2+' if '2' in t else 'GNU GPL'
    return s


# ---- Battle for Wesnoth
_WES = None
def wesnoth(rel):
    global _WES
    if _WES is None:
        _WES = {r['File']: r for r in csv.DictReader(open(os.path.join(META, 'wes_copyrights.csv'), encoding='utf-8'))}
    r = _WES.get(rel, {})
    authors = '; '.join(a.strip() for a in r.get('Author - Real Name(other name);Real Name(other name);etc', '').split(';') if a.strip())
    lic = r.get('License', 'GNU GPL v2+')
    lic = {'GNU GPL v2+': 'GNU GPL v2+', 'CC BY-SA 4.0': 'CC BY-SA 4.0'}.get(lic, lic)
    return authors or 'Wesnoth contributors', lic


# ---- Stendhal (doc/sources/audio-*.txt)
_STE = None
def stendhal(rel):
    global _STE
    if _STE is None:
        _STE = []
        for name in ('sfx', 'music', 'loop', 'weather'):
            section = ''
            for line in open(os.path.join(META, f'stendhal_audio-{name}.txt'), encoding='utf-8'):
                line = line.rstrip('\n')
                if not line.strip():
                    continue
                if line.endswith('/') and ' ' not in line.strip():
                    section = line.strip(); continue
                m = re.match(r'(\S+)\s+(.*)$', line)
                if not m:
                    continue
                pat = re.escape(m.group(1))
                pat = re.sub(r'\\\[(\d+)\\-(\d+)\\\]', lambda r: '(' + '|'.join(str(i).zfill(len(r.group(1))) for i in range(int(r.group(1)), int(r.group(2)) + 1)) + ')', pat)
                pat = pat.replace('\\*', '.*')
                _STE.append((section, re.compile(pat + r'(\.ogg|\.flac)?$'), [p.strip() for p in m.group(2).split(';')]))
    path = rel[len('data/'):] if rel.startswith('data/') else rel
    folder, fname = path.rsplit('/', 1)
    for section, rx, parts in _STE:
        if section.rstrip('/') == folder and rx.match(fname):
            author = parts[0]
            lic = parts[1].split(':')[0].strip() if len(parts) > 1 else 'see Stendhal'
            return author, norm_lic(lic) if lic.lower() != 'gpl' else 'GNU GPL', (parts[2] if len(parts) > 2 else '')
    for section, rx, parts in _STE:   # loop/ and weather/ sounds are listed without their folder
        if rx.match(fname):
            lic = parts[1].split(':')[0].strip() if len(parts) > 1 else ''
            return parts[0], norm_lic(lic) if lic.lower() != 'gpl' else 'GNU GPL', (parts[2] if len(parts) > 2 else '')
    raise KeyError('stendhal ' + rel)


# ---- Red Eclipse readme blocks
def _re_blocks(fname):
    blocks, cur = [], None
    for line in open(os.path.join(META, fname), encoding='utf-8'):
        if line.startswith('Files:'):
            cur = {'files': line[6:].split(), 'copy': [], 'lic': ''}; blocks.append(cur); key = 'files'
        elif cur is not None and line.startswith('Copyright:'):
            cur['copy'].append(line[10:].strip()); key = 'copy'
        elif cur is not None and line.startswith('License:'):
            cur['lic'] = line[8:].strip(); key = 'lic'
        elif cur is not None and line.startswith(' ') and key == 'copy' and line.strip() and not line.strip().startswith('<'):
            cur['copy'].append(line.strip())
        elif cur is not None and line.startswith(' ') and key == 'files':
            cur['files'] += line.split()
    return blocks
def redeclipse(rel):
    fname = 're_bart.txt' if '/bart/' in rel else 're_ambience.txt'
    if '/bart/' in rel:
        return 'bart, modified by Quinton Reeves', 'CC0'
    name = rel.split('/')[-1]
    best = None
    for b in _re_blocks(fname):
        for pat in b['files']:
            if re.fullmatch(pat.replace('.', r'\.').replace('*', '.*'), name):
                best = b
    if not best:
        return 'Quinton Reeves, Alex Anguix', 'CC BY-SA 4.0'
    if not best['copy'] and not best['lic']:
        txt = open(os.path.join(META, fname), encoding='utf-8').read()
        i = txt.index('Files: ' + name); blk = txt[i:i + 600]
        m = re.search(r'created by ([^<\n]+)', blk)
        return (m.group(1).strip() if m else 'Red Eclipse contributors'), ('CC BY-SA 3.0' if 'ShareAlike' in blk else 'CC BY 3.0')
    who = ', '.join(re.sub(r'^Copyright\s*(\d{4}\s*)?', '', c).strip() for c in best['copy'] if c)
    lic = best['lic'].replace('CC-BY-SA4', 'CC BY-SA 4.0').replace('CC-BY-SA3', 'CC BY-SA 3.0').replace('CC-BY', 'CC BY 3.0')
    return who, norm_lic(lic)


# ---- Cataclysm DDA CC-Sounds credits.md tables
def cdda(rel):
    d, name = rel.rsplit('/', 1)
    f = os.path.join(META, 'cd_' + d.replace('/', '_') + '.md')
    for line in open(f, encoding='utf-8'):
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) >= 3 and cells[0] == name:
            return cells[1], norm_lic(cells[2]), (cells[3] if len(cells) > 3 else '')
    raise KeyError('cdda ' + rel)


# ---- OpenSFX psfo
def opensfx(rel):
    for line in open(os.path.join(META, 'opensfx.psfo'), encoding='utf-8'):
        if f'"{rel}"' in line:
            m = re.search(r'"[^"]+" "([^"]+)"\. (.*)License: (.*)\.$', line.strip())
            desc, who, lic = m.group(1), m.group(2).strip(), m.group(3)
            who = who.replace('By ', '').replace('Original ', '').rstrip('. ')
            return who, norm_lic(lic)
    raise KeyError(rel)


UH_SPECIAL = {
    'irelands_coast.ogg': ('Matthew Pablo', 'CC BY 3.0'),
    'Peer Gynt Suite No. 1, Op. 46 - I. Morning.ogg': ('Edvard Grieg, performed by the Czech National Symphony Orchestra (Musopen)', 'Public domain'),
    'ships_bell.ogg': ('Stephan (pdsounds.org)', 'Public domain'),
}
FC_SPECIAL = {'musicbox.ogg': 'Stian Grenborgen'}
OC_SOUND = 'OpenClonk team'
MG_SPECIAL = {'asak-jadeflange.ogg': 'Asak (jadeflange)', 'aminos-together_together.ogg': 'Aminos (together)'}


def credit(fullref):
    a, rel = fullref.split(':', 1)
    project, base = REPO_URL[a]
    url = base + urllib.parse.quote(rel)
    name = rel.split('/')[-1]
    origin = ''
    if a == 'W':
        author, lic = wesnoth(rel)
    elif a == 'S':
        author, lic, origin = stendhal(rel)
    elif a == 'Z':
        author, lic = 'Wildfire Games', 'CC BY-SA 3.0'
    elif a == 'F':
        author, lic = ('Brandon Morris, remaxim' if '/music/' in rel else 'Brandon Morris, Justin Jacobs, rubberduck'), 'CC BY-SA 3.0'
    elif a == 'FC':
        author, lic = FC_SPECIAL.get(name, 'Alexander Zhelanov'), 'CC BY 4.0'
    elif a == 'PI':
        author, lic = 'Pioneer contributors', 'CC BY-SA 3.0'
    elif a == 'TG':
        author, lic = '/tg/station 13 contributors', 'CC BY-SA 3.0'
    elif a == 'RE':
        author, lic = redeclipse(rel)
    elif a == 'OC':
        author, lic = ('K-Pone' if 'Music.ocg' in rel else OC_SOUND), 'CC BY 3.0'
    elif a == 'UH':
        author, lic = UH_SPECIAL.get(name, ('Unknown Horizons team', 'GNU GPL v2+'))
    elif a == 'SPD':
        author, lic = 'Kristjan Haaristo', 'GNU GPL v3'
    elif a == 'ZK':
        author, lic = 'D.700 (Vladislav Lapochkin)', 'CC0'
    elif a == 'MG':
        author, lic = MG_SPECIAL.get(name, 'MegaGlest team'), 'CC BY-SA 3.0'
    elif a == 'ES':
        author, lic = 'Endless Sky contributors', 'Public domain'
    elif a == 'CB':
        author, lic = 'Emxx52', 'GNU GPL v3'
    elif a == 'MD':
        author, lic = 'Anuken and Mindustry contributors', 'GNU GPL v3'
    elif a == 'OS':
        author, lic = opensfx(rel)
    elif a == 'OSE':
        author, lic = ('Ted John (IntelOrca)' if name == 'crowd.flac' else 'Karst van Galen Last (AuraSpecs)'), 'CC BY 4.0'
    elif a == 'OM':
        author, lic = 'OpenRCT2 OpenMusic contributors', 'Public domain'
    elif a == 'CD':
        author, lic, origin = cdda(rel)
    elif a == 'HS':
        author, lic = 'Hypersomnia (Patryk Czachurski and contributors)', 'CC0'
    else:
        raise KeyError(a)
    return {'project': project, 'url': url, 'file': name, 'author': author, 'license': lic, 'origin': origin}


def lic_md(lic):
    u = LIC_URL.get(lic)
    return f'[{lic}]({u})' if u else lic
