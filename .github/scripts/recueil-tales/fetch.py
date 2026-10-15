"""Fetch files from blobless clones into /home/claude/cache. Usage: fetch.py ALIAS:path ..."""
import os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
SRC = '/home/claude/src'; CACHE = '/home/claude/cache'
REPOS = {'W': 'wesnoth_wesnoth', 'Z': '0ad_0ad', 'F': 'flareteam_flare-game', 'S': 'arianne_stendhal',
 'FC': 'FreeCol_freecol', 'PI': 'pioneerspacesim_pioneer', 'TG': 'tgstation_tgstation', 'RE': 'redeclipse_sounds',
 'OC': 'openclonk_openclonk', 'UH': 'unknown-horizons_unknown-horizons', 'SPD': '00-Evan_shattered-pixel-dungeon',
 'ZK': 'ZeroK-RTS_Zero-K', 'TH': 'Revolutionary-Games_Thrive', 'MG': 'MegaGlest_megaglest-data', 'ES': 'endless-sky_endless-sky',
 'CB': 'colobot_colobot-music', 'CBD': 'colobot_colobot-data', 'MD': 'Anuken_Mindustry', 'OS': 'OpenSFX',
 'OSE': 'OpenSoundEffects', 'OM': 'OpenMusic', 'CD': 'Fris0uman_CDDA-Soundpacks', 'FO': 'freeorion_freeorion',
 'WY': 'Andrettin_Wyrmsun', 'HS': 'TeamHypersomnia_Hypersomnia', 'WZ': 'Warzone2100_warzone2100', 'ST': 'SuperTux_supertux',
 'AC': 'assaultcube_AC', 'FD': 'freedoom_freedoom', 'HW': 'hedgewars_hw'}
def local(ref):
    a, p = ref.split(':', 1)
    return os.path.join(CACHE, REPOS[a], p)
def fetch(ref):
    a, p = ref.split(':', 1)
    out = local(ref)
    if os.path.exists(out) and os.path.getsize(out) > 0: return ref, 'cached'
    os.makedirs(os.path.dirname(out), exist_ok=True)
    for attempt in range(3):
        r = subprocess.run(['git', '-C', os.path.join(SRC, REPOS[a]), 'cat-file', 'blob', 'HEAD:' + p], capture_output=True, timeout=600)
        if r.returncode == 0:
            data = r.stdout
            if data.startswith(b'version https://git-lfs'):
                d = REPOS[a]; owner, repo = (d.split('_', 1) if '_' in d else ('OpenTTD' if d=='OpenSFX' else 'OpenRCT2', d))
                br = subprocess.run(['git','-C',os.path.join(SRC,d),'rev-parse','--abbrev-ref','origin/HEAD'],capture_output=True,text=True).stdout.strip().split('/',1)[-1]
                import urllib.parse
                url = f'https://media.githubusercontent.com/media/{owner}/{repo}/{br}/' + urllib.parse.quote(p)
                rr = subprocess.run(['curl','-sfL','-o',out,url],timeout=900)
                return ref, 'ok' if rr.returncode == 0 else 'FAIL lfs ' + url
            open(out, 'wb').write(data); return ref, 'ok'
    return ref, 'FAIL ' + r.stderr.decode()[-200:]
if __name__ == '__main__':
    refs = [l.strip() for l in (sys.argv[1:] or sys.stdin) if l.strip()]
    with ThreadPoolExecutor(4) as ex:
        for ref, st in ex.map(fetch, refs):
            if st != 'cached' and st != 'ok' : print(ref, st)
    print('done', len(refs))
