"""Builds the web edition MP3s from the open-source game assets listed in spec.py.

Usage: put blob-less sparse clones of wesnoth/wesnoth, 0ad/0ad, flareteam/flare-game and
arianne/stendhal in ./src/ next to this script, plus Wesnoth's copyrights.csv as
src/wes_copyrights.csv and Stendhal's doc/sources/audio-*.txt as src/stendhal_audio-*.txt,
then run:  python3 build.py ../../../docs/play/sounds  [optional name filter]
Needs ffmpeg with libmp3lame.
"""
import csv, json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]  # docs/play/sounds
ns = {}
exec(open(os.path.join(HERE, 'spec.py')).read(), ns)
PLAN, REPEAT, MIN_LOOP, NO_XFADE = ns['PLAN'], ns['REPEAT'], ns['MIN_LOOP'], ns['NO_XFADE']
PRE = {'S': ('stendhal', 'data/'), 'W': ('wesnoth', 'data/core/'), 'WC': ('wesnoth', 'data/campaigns/'),
       'Z': ('0ad', 'binaries/data/mods/public/audio/'), 'F': ('flare-game', 'mods/fantasycore/')}
TMP = os.path.join(HERE, 'work'); os.makedirs(TMP, exist_ok=True)

WES = {r['File']: r for r in csv.DictReader(open(os.path.join(HERE, 'src/wes_copyrights.csv'), encoding='utf-8'))}

def src_path(s):
    k, p = s.split(':', 1); repo, pre = PRE[k]
    return os.path.join(HERE, 'src', repo, pre + p), repo, pre + p

def _stendhal_index():
    idx = []
    for name in ('audio-sfx', 'audio-music', 'audio-loop', 'audio-weather'):
        section = ''
        for line in open(os.path.join(HERE, 'src', f'stendhal_{name}.txt'), encoding='utf-8'):
            line = line.rstrip('\n')
            if not line.strip():
                continue
            if line.endswith('/') and ' ' not in line.strip():
                section = line.strip()
                continue
            m = re.match(r'(\S+)\s+(.*)$', line)
            if not m:
                continue
            pat = re.escape(m.group(1))
            pat = re.sub(r'\\\[(\d+)\\-(\d+)\\\]', lambda r: '(' + '|'.join(str(i).zfill(len(r.group(1))) for i in range(int(r.group(1)), int(r.group(2)) + 1)) + ')', pat)
            pat = pat.replace('\\*', '.*')
            parts = [p.strip() for p in m.group(2).split(';')]
            idx.append((section, re.compile(pat + r'(\.ogg)?$'), parts))
    return idx
STENDHAL = _stendhal_index()

def stendhal_credit(rel):
    folder, fname = rel.rsplit('/', 1)
    for section, rx, parts in STENDHAL:
        if section.rstrip('/') == folder and rx.match(fname):
            author = parts[0]
            lic = parts[1] if len(parts) > 1 else 'see Stendhal'
            lic = lic.split(':')[0].strip()
            lic = {'GPL': 'GNU GPL', 'public domain': 'Public domain'}.get(lic, lic)
            return author, lic, parts[2] if len(parts) > 2 else ''
    raise KeyError(rel)

def credit(s):
    path, repo, rel = src_path(s)
    if repo == 'wesnoth':
        r = WES.get(rel, {})
        authors = '; '.join(a.strip() for a in r.get('Author - Real Name(other name);Real Name(other name);etc', '').split(';') if a.strip())
        return {'project': 'Battle for Wesnoth', 'url': f'https://github.com/wesnoth/wesnoth/blob/master/{rel}',
                'file': rel.split('/')[-1], 'author': authors or 'Wesnoth contributors', 'license': r.get('License', 'GNU GPL v2+')}
    if repo == 'stendhal':
        author, lic, url = stendhal_credit(rel)
        return {'project': 'Stendhal', 'url': f'https://github.com/arianne/stendhal/blob/master/{rel}', 'file': rel.split('/')[-1],
                'author': author, 'license': lic, 'origin': url}
    if repo == '0ad':
        return {'project': '0 A.D.', 'url': f'https://github.com/0ad/0ad/blob/main/{rel}', 'file': rel.split('/')[-1],
                'author': 'Wildfire Games', 'license': 'CC BY-SA 3.0'}
    who = 'Brandon Morris, remaxim' if '/music/' in rel else 'Brandon Morris, Justin Jacobs, rubberduck'
    return {'project': 'Flare', 'url': f'https://github.com/flareteam/flare-game/blob/master/{rel}', 'file': rel.split('/')[-1],
            'author': who, 'license': 'CC BY-SA 3.0'}

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: raise RuntimeError(' '.join(cmd)[:300] + '\n' + r.stderr[-1500:])
    return r

def duration(f):
    return float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout.strip())

def channels(f):
    return int(run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', f]).stdout.strip())

def build(dest):
    kind, srcs, filt = PLAN[dest]
    srcs = [srcs] if kind == 'one' else srcs
    zone = 'music' if '/music/' in dest else 'ambience' if '/ambience/' in dest else 'soundbox' if dest.startswith('soundbox') else 'events'
    base = os.path.join(TMP, dest.replace('/', '__')[:-4])
    raw = base + '.raw.wav'
    stereo = any(channels(src_path(s)[0]) > 1 for s in srcs) or kind == 'mix'
    ac = ['-ac', '2' if stereo else '1', '-ar', '44100']
    if kind == 'one':
        cmd = ['ffmpeg', '-y', '-v', 'error', '-i', src_path(srcs[0])[0]] + (['-af', filt] if filt else []) + ac + [raw]
    else:
        ins = []
        for s in srcs: ins += ['-i', src_path(s)[0]]
        cmd = ['ffmpeg', '-y', '-v', 'error'] + ins + ['-filter_complex', filt, '-map', '[out]'] + ac + [raw]
    run(cmd)

    # Repeat short one-shots
    if dest in REPEAT:
        n, gap = REPEAT[dest]
        rep = base + '.rep.wav'
        parts = ''.join(f'[{i}]' + (f'apad=pad_dur={gap}' if gap else 'anull') + f'[p{i}];' for i in range(n))
        run(['ffmpeg', '-y', '-v', 'error'] + sum([['-i', raw] for _ in range(n)], []) +
            ['-filter_complex', parts + ''.join(f'[p{i}]' for i in range(n)) + f'concat=n={n}:v=0:a=1,afade=t=in:d=0.3[out]', '-map', '[out]', rep])
        raw = rep

    # Extend short ambience loops with crossfades
    if zone == 'ambience':
        d = duration(raw)
        if d < MIN_LOOP:
            n = int(MIN_LOOP // max(d * 0.8, 0.5)) + 1
            ext = base + '.loop.wav'
            if dest in NO_XFADE:
                n = int(MIN_LOOP // d) + 1
                fc = ''.join(f'[{i}]' for i in range(n)) + f'concat=n={n}:v=0:a=1[out]'
            else:
                x = round(min(1.5, d / 4), 3)
                fc, prev = '', '[0]'
                for i in range(1, n):
                    lab = f'[x{i}]' if i < n - 1 else '[out]'
                    fc += f'{prev}[{i}]acrossfade=d={x}:c1=tri:c2=tri{lab};'
                    prev = lab
                fc = fc.rstrip(';')
            run(['ffmpeg', '-y', '-v', 'error'] + sum([['-i', raw] for _ in range(n)], []) + ['-filter_complex', fc, '-map', '[out]', ext])
            raw = ext

    # Two-pass loudness normalisation
    target = {'music': -18, 'ambience': -23, 'events': -17, 'soundbox': -16}[zone]
    meas = run(['ffmpeg', '-v', 'info', '-i', raw, '-af', f'loudnorm=I={target}:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']).stderr
    m = json.loads(meas[meas.rindex('{'):meas.rindex('}') + 1])
    if m['input_i'] in ('-inf', 'inf') or float(m['input_i']) < -70:
        ln = 'anull'
    else:
        ln = (f"loudnorm=I={target}:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
              f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    final = os.path.join(OUT, dest)
    os.makedirs(os.path.dirname(final), exist_ok=True)
    br = {'music': '112k'}.get(zone, '96k' if stereo else '64k')
    cr = [credit(s) for s in srcs]
    authors = ', '.join(sorted({c['author'] for c in cr}))
    lic = ', '.join(sorted({c['license'] for c in cr}))
    title = re.sub(r'^\d+_', '', os.path.basename(dest)[:-4]).replace('-', ' ').capitalize()
    run(['ffmpeg', '-y', '-v', 'error', '-i', raw, '-af', ln + ',aresample=44100'] + ac[:2] +
        ['-c:a', 'libmp3lame', '-b:a', br, '-id3v2_version', '3', '-metadata', f'title={title}',
         '-metadata', f'artist={authors}', '-metadata', f'comment=License: {lic}. Bardic web edition, see CREDITS.md', final])
    return dest, {'sources': cr, 'modified': kind == 'mix' or bool(filt) or dest in REPEAT or (zone == 'ambience' and duration(final) > duration(src_path(srcs[0])[0]) + 1),
                  'duration': round(duration(final), 1), 'size': os.path.getsize(final)}

if __name__ == '__main__':
    results = {}
    with ThreadPoolExecutor(8) as ex:
        for dest, info in ex.map(build, sorted(d for d in PLAN if len(sys.argv) < 3 or sys.argv[2] in d)):
            results[dest] = info
            print(f"{info['duration']:7.1f}s {info['size']/1024:7.0f}K  {dest}")
    cj = os.path.join(HERE, 'credits.json')
    old = json.load(open(cj)) if len(sys.argv) > 2 and os.path.exists(cj) else {}
    old.update(results); results = {d: old[d] for d in sorted(old) if d in PLAN}
    json.dump(results, open(cj, 'w'), indent=1, ensure_ascii=False)
    tot = {}
    for d, i in results.items(): tot[d.split('/')[0]] = tot.get(d.split('/')[0], 0) + i['size']
    print({k: f'{v/1048576:.1f} MB' for k, v in tot.items()})
