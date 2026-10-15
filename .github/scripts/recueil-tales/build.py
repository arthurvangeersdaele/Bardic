"""Builds the sounds of the ten Bardic tales and forges the .bardic files.

python3 build.py [slug-filter]
Output: out/<slug>/sounds/... (MP3) and out/<slug>.bardic
"""
import json, os, re, subprocess, sys, uuid, zipfile, hashlib
import numpy as np
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plan import STORIES
from resolve import resolve, refs_of
from fetch import local

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out'); WORK = os.path.join(HERE, 'work')
os.makedirs(OUT, exist_ok=True); os.makedirs(WORK, exist_ok=True)
SR = 44100
MIN_AMB, MAX_AMB, MAX_MUSIC, MAX_EVENT = 45.0, 95.0, 330.0, 22.0
TARGET = {'music': -18, 'ambience': -23, 'events': -17}
BITRATE = {'music': '112k', 'ambience': '96k', 'events': '96k'}


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(' '.join(cmd)[:400] + '\n' + r.stderr[-1500:])
    return r


def src(ref):
    p = local(resolve(ref))
    if not os.path.exists(p):
        raise FileNotFoundError(p)
    return p


def load(path):
    """Decode any audio file to float32 stereo array at 44.1 kHz."""
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True)
    if r.returncode:
        raise RuntimeError(path + r.stderr.decode()[-500:])
    return np.frombuffer(r.stdout, dtype=np.float32).reshape(-1, 2).copy()


def save(a, path):
    a = np.ascontiguousarray(a.astype(np.float32))
    p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', path], input=a.tobytes(), capture_output=True)
    if p.returncode:
        raise RuntimeError(p.stderr.decode()[-500:])


def filt(a, af, tag):
    if not af:
        return a
    t1, t2 = os.path.join(WORK, tag + '.f1.wav'), os.path.join(WORK, tag + '.f2.wav')
    save(a, t1)
    run(['ffmpeg', '-v', 'error', '-y', '-i', t1, '-af', af, '-ac', '2', '-ar', str(SR), t2])
    return load(t2)


def trim_silence(a, thr=0.003):
    e = np.abs(a).max(axis=1)
    idx = np.where(e > thr)[0]
    if len(idx) == 0:
        return a
    s = max(0, idx[0] - int(0.01 * SR)); t = min(len(a), idx[-1] + int(0.08 * SR))
    return a[s:t]


def fade(a, fin=0.0, fout=0.0):
    a = a.copy()
    n = int(fin * SR)
    if n and len(a) > n:
        a[:n] *= np.linspace(0, 1, n)[:, None]
    n = int(fout * SR)
    if n and len(a) > n:
        a[-n:] *= np.linspace(1, 0, n)[:, None]
    return a


def place(dst, clip, at):
    i = int(at * SR)
    if i + len(clip) > len(dst):
        dst = np.concatenate([dst, np.zeros((i + len(clip) - len(dst), 2), np.float32)])
    dst[i:i + len(clip)] += clip
    return dst


def seamless(a, length, x=2.0):
    """Cut a loop of `length` seconds whose end runs into its start without a click."""
    L = int(length * SR); X = int(min(x, length / 6) * SR)
    if len(a) < L + X:
        L = len(a) - X
    seg = a[:L + X]
    out = seg[:L].copy()
    w = np.linspace(0, 1, X)[:, None]
    out[:X] = seg[:X] * w + seg[L:L + X] * (1 - w)
    return out


def extend(a, minlen):
    """Repeat a short ambience with crossfades until it lasts at least minlen seconds."""
    d = len(a) / SR
    X = int(min(1.5, d / 4) * SR)
    out = a.copy()
    while len(out) / SR < minlen + 2:
        w = np.linspace(0, 1, X)[:, None]
        tail = out[-X:] * (1 - w) + a[:X] * w
        out = np.concatenate([out[:-X], tail, a[X:]])
    return out


def train_on_rails():
    """Steam train rolling: rumble, puffs of steam in rhythm and rail joints."""
    dur = 40.0
    n = int(dur * SR)
    out = np.zeros((n, 2), np.float32)
    rumble = load(src('TG:machines/tram/tram_loop.ogg'))
    rumble = filt(rumble, 'asetrate=44100*0.75,aresample=44100,lowpass=f=700,volume=1.6', 'rail_rumble')
    while len(rumble) < n:
        rumble = np.concatenate([rumble, rumble])
    out += rumble[:n] * 0.9
    steam = trim_silence(load(src('OS:osfx_13.wav')))
    puff = fade(steam[:int(0.22 * SR)], 0.01, 0.12) * 0.55
    puff2 = filt(puff, 'highpass=f=400', 'rail_puff')
    t, k = 0.15, 0
    while t < dur - 0.5:   # chuff-chuff, chuff-chuff
        out = place(out, puff if k % 2 == 0 else puff2 * 0.8, t)
        t += 0.42; k += 1
    clack = trim_silence(load(src('S:sounds/clang-dull-1.ogg')))
    clack = filt(clack[:int(0.12 * SR)], 'highpass=f=250,lowpass=f=3500,volume=0.35', 'rail_clack')
    t = 0.6
    while t < dur - 0.5:   # ta-tak ... ta-tak (rail joints)
        out = place(out, clack, t); out = place(out, clack * 0.8, t + 0.16)
        t += 1.65
    return out[:n]


def render(recipe, opts, tag):
    if isinstance(recipe, str) and recipe.startswith('BUILD:'):
        return {'train_on_rails': train_on_rails}[recipe[6:]]()
    if isinstance(recipe, str):
        a = load(src(recipe))
    elif recipe[0] == 'mix':
        a = np.zeros((1, 2), np.float32)
        for ref, at, gain in recipe[1]:
            a = place(a, load(src(ref)) * gain, at)
        if recipe[2]:
            a = a[:int(recipe[2] * SR)]
    elif recipe[0] == 'seq':
        a = np.zeros((1, 2), np.float32); t = 0.0
        for ref in recipe[1]:
            c = trim_silence(load(src(ref)))
            a = place(a, c, t); t += max(recipe[2], 0.05)
    else:
        a = filt(load(src(recipe[0])), recipe[1], tag)
    if opts.get('filter'):
        a = filt(a, opts['filter'], tag + '_o')
    return a


def loudnorm(inp, outp, zone, bitrate, mono):
    """Integrated loudness to the zone target with a plain gain, then a soft limiter for the peaks (fast)."""
    target = TARGET[zone]
    meas = run(['ffmpeg', '-v', 'info', '-nostats', '-i', inp, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-']).stderr
    m = re.findall(r'I:\s+(-?[\d.]+|-inf) LUFS', meas)
    I = float(m[-1]) if m and m[-1] != '-inf' else -70.0
    gain = 0.0 if I <= -69 else max(-30.0, min(30.0, target - I))
    af = f'volume={gain:.2f}dB,alimiter=limit=0.79:attack=1:release=80:level=disabled'
    run(['ffmpeg', '-v', 'error', '-y', '-i', inp, '-af', af, '-ar', str(SR), '-ac', '1' if mono else '2',
         '-c:a', 'libmp3lame', '-b:a', ('64k' if mono and zone != 'music' else bitrate), '-id3v2_version', '0', outp])


def is_mono(a):
    return np.max(np.abs(a[:, 0] - a[:, 1])) < 1e-4


def build_sound(job):
    zone, name, recipe, opts, dest = job
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    final, dest = dest, dest + '.part.mp3'
    r = _build_sound(zone, name, recipe, opts, dest)
    os.replace(dest, final)
    return final


def _build_sound(zone, name, recipe, opts, dest):
    tag = re.sub(r'[^a-z0-9]+', '_', dest.split('/out/')[-1].lower())
    a = render(recipe, opts, tag)
    loop = opts.get('loop')
    if zone == 'music':
        a = trim_silence(a, 0.0008)
        if len(a) / SR > MAX_MUSIC:
            a = fade(a[:int(MAX_MUSIC * SR)], 0, 6)
    elif zone == 'ambience' and loop != 'random':
        d = len(a) / SR
        if d < MIN_AMB:
            a = extend(a, MIN_AMB)
        start = opts.get('start', 0)
        a = a[int(start * SR):]
        a = seamless(a, min(MAX_AMB, len(a) / SR - 2.5))
    else:
        a = trim_silence(a)
        if len(a) / SR > MAX_EVENT:
            a = fade(a[:int(MAX_EVENT * SR)], 0, 2.5)
        a = fade(a, 0.005, 0.03)
    wav = os.path.join(WORK, tag + '.wav')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    mono = is_mono(a)
    if len(a) / SR < 3.0:
        # loudnorm is unreliable on very short clips: level by RMS of the loud part, cap the peak at -1 dBFS
        e = np.abs(a).max(axis=1)
        loud = a[e > e.max() * 0.1] if e.max() > 0 else a
        rms_db = 20 * np.log10(max(float(np.sqrt((loud ** 2).mean())), 1e-6))
        gain = min(0.89 / max(float(e.max()), 1e-6), 10 ** ((-16 - rms_db) / 20))
        save(a * gain, wav)
        run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '1' if mono else '2', '-c:a', 'libmp3lame',
             '-b:a', '64k' if mono else BITRATE[zone], '-id3v2_version', '0', dest])
        return dest
    save(a, wav)
    loudnorm(wav, dest, 'events' if zone == 'events' else zone, BITRATE[zone], mono)
    return dest


def slugify(s):
    s = s.lower().replace("'", '')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def duration(f):
    return round(float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout.strip()), 1)


def jobs_for(story):
    jobs, entries = [], []
    for ci, ch in enumerate(story['chapters'], 1):
        ent = {'title': ch['title'], 'description': ch['description']}
        for zone in ('music', 'ambience', 'events'):
            lst = []
            for i, snd in enumerate(ch[zone], 1):
                name, recipe = snd[0], snd[1]
                opts = snd[2] if len(snd) > 2 else {}
                rel = f'sounds/{ci}/{zone}/{i:02d}-{slugify(name)}.mp3'
                dest = os.path.join(OUT, story['slug'], rel)
                jobs.append((zone, name, recipe, opts, dest))
                default = 'infinite' if zone in ('music', 'ambience') else 'once'
                lst.append({'name': name, 'file': rel, 'loop': opts.get('loop', default),
                            'volume': opts.get('vol', 0.75 if zone != 'ambience' else 0.7), '_dest': dest,
                            '_src': refs_of(recipe), '_recipe': recipe})
            ent[zone] = lst
        entries.append(ent)
    return jobs, entries


if __name__ == '__main__':
    flt = sys.argv[1] if len(sys.argv) > 1 else ''
    stories = [s for s in STORIES if flt in s['slug']]
    alljobs = []
    for s in stories:
        alljobs += jobs_for(s)[0]
    print(len(alljobs), 'sounds to build')
    errors = []
    def safe(j):
        try:
            return build_sound(j)
        except Exception as e:
            errors.append((j[4], str(e)[:600])); return None
    with ThreadPoolExecutor(2) as ex:
        for i, r in enumerate(ex.map(safe, alljobs), 1):
            if i % 25 == 0:
                print(i, 'built', flush=True)
    for d, e in errors:
        print('ERROR', d, e)
    print('done,', len(errors), 'errors')
