"""Copies the forged tales into the Bardic repo's Recueil and writes their credits."""
import os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plan import STORIES
from credits import LIC_URL

REPO = '/home/claude/bardic'
REC = os.path.join(REPO, 'docs', 'recueil')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
PREFIX = os.environ.get('BARDIC_PREFIX', '261015_')  # YYMMDD_ of the day the tales are forged


def fname(slug):
    return PREFIX + slug.replace('-', '_') + '.bardic'


HEADER = """# Recueil sound credits

The tales below were forged by Bardic for the Recueil of the Compagnie des bardes. Every sound comes from an open-source game or sound project, used under its original licence.

| Project | Licence | Source |
| --- | --- | --- |
| Battle for Wesnoth | GNU GPL v2+ or CC BY-SA 4.0, per file | [github.com/wesnoth/wesnoth](https://github.com/wesnoth/wesnoth) |
| 0 A.D. | CC BY-SA 3.0, Wildfire Games | [github.com/0ad/0ad](https://github.com/0ad/0ad) |
| Flare | CC BY-SA 3.0 | [github.com/flareteam/flare-game](https://github.com/flareteam/flare-game) |
| Stendhal | per file: CC0, CC BY, OGA-BY, BSD, public domain or GNU GPL | [github.com/arianne/stendhal](https://github.com/arianne/stendhal) |
| FreeCol | CC BY 4.0 (music by Alexander Zhelanov and Stian Grenborgen) | [github.com/FreeCol/freecol](https://github.com/FreeCol/freecol) |
| Pioneer Space Simulator | CC BY-SA 3.0 | [github.com/pioneerspacesim/pioneer](https://github.com/pioneerspacesim/pioneer) |
| /tg/station 13 | CC BY-SA 3.0 | [github.com/tgstation/tgstation](https://github.com/tgstation/tgstation) |
| Red Eclipse | per file: CC BY-SA, CC BY or CC0 | [github.com/redeclipse/sounds](https://github.com/redeclipse/sounds) |
| OpenClonk | CC BY 3.0 | [github.com/openclonk/openclonk](https://github.com/openclonk/openclonk) |
| Unknown Horizons | per file: GNU GPL v2+, CC BY 3.0 or public domain | [github.com/unknown-horizons/unknown-horizons](https://github.com/unknown-horizons/unknown-horizons) |
| Shattered Pixel Dungeon | GNU GPL v3 (music by Kristjan Haaristo) | [github.com/00-Evan/shattered-pixel-dungeon](https://github.com/00-Evan/shattered-pixel-dungeon) |
| Zero-K | CC0 (music by D.700) | [github.com/ZeroK-RTS/Zero-K](https://github.com/ZeroK-RTS/Zero-K) |
| MegaGlest | CC BY-SA 3.0 | [github.com/MegaGlest/megaglest-data](https://github.com/MegaGlest/megaglest-data) |
| Colobot: Gold Edition | GNU GPL v3 (music by Emxx52) | [github.com/colobot/colobot-music](https://github.com/colobot/colobot-music) |
| Mindustry | GNU GPL v3 | [github.com/Anuken/Mindustry](https://github.com/Anuken/Mindustry) |
| Endless Sky | public domain (sounds) | [github.com/endless-sky/endless-sky](https://github.com/endless-sky/endless-sky) |
| OpenSFX (OpenTTD) | per file: CC BY 3.0, CC BY-SA 3.0 or CC0 | [github.com/OpenTTD/OpenSFX](https://github.com/OpenTTD/OpenSFX) |
| OpenRCT2 OpenSoundEffects and OpenMusic | CC BY 4.0, public domain (ragtime) | [github.com/OpenRCT2](https://github.com/OpenRCT2) |
| Cataclysm: DDA CC-Sounds | per file: CC0, CC BY 3.0 or CC BY 4.0 (freesound.org recordings) | [github.com/Fris0uman/CDDA-Soundpacks](https://github.com/Fris0uman/CDDA-Soundpacks) |
| Hypersomnia | CC0 | [github.com/TeamHypersomnia/Hypersomnia](https://github.com/TeamHypersomnia/Hypersomnia) |

**Changes made for Bardic:** all files were converted to MP3 and volume-levelled, ambiances were cut into seamless loops. Files marked *edited* were also pitch-shifted, filtered, echoed, put in sequence or mixed from several sources. Each file, edited or not, stays under the licence of its source(s), as listed. File paths are the paths inside each `.bardic` file, under `sounds/`.

"""

if __name__ == '__main__':
    # Merge: keep every tale section already in CREDITS.md, replace or add the sections forged this time.
    import re
    path = os.path.join(REC, 'CREDITS.md')
    new_md = open(os.path.join(OUT, 'credits.md')).read()
    for s in STORIES:
        new_md = new_md.replace(f"Tale `{s['slug']}.bardic`", f"Tale `{fname(s['slug'])}`")
    def sections(md):
        parts = re.split(r'(?m)^(?=## )', md)
        return {p.splitlines()[0][3:].strip(): p.rstrip() + '\n' for p in parts if p.startswith('## ')}
    old = sections(open(path).read()) if os.path.exists(path) else {}
    old.update(sections(new_md))
    open(path, 'w').write(HEADER + '\n'.join(old.values()))
    forged = set(sections(new_md))
    for s in STORIES:
        src = os.path.join(OUT, s['slug'] + '.bardic')
        if s['title'] in forged and os.path.exists(src):
            shutil.copyfile(src, os.path.join(REC, fname(s['slug'])))
            print('copied', fname(s['slug']))
