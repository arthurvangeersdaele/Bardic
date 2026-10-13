import json
c=json.load(open('credits.json'))
st={s['id']:s for s in json.load(open('/home/claude/bardic/docs/play/stories.json'))['stories']}
LIC={'GNU GPL v2+':'https://www.gnu.org/licenses/old-licenses/gpl-2.0.html','GNU GPL':'https://www.gnu.org/licenses/gpl-3.0.html','CC BY-SA 3.0':'https://creativecommons.org/licenses/by-sa/3.0/','CC BY-SA 4.0':'https://creativecommons.org/licenses/by-sa/4.0/','CC0':'https://creativecommons.org/publicdomain/zero/1.0/','CC BY 3.0':'https://creativecommons.org/licenses/by/3.0/','CC BY 4.0':'https://creativecommons.org/licenses/by/4.0/','Public domain':'','public domain':''}
out=['# Sound credits','',
'Every sound in the Bardic web edition comes from open-source games, used under their original licences.','',
'| Project | Licence | Source |','| --- | --- | --- |',
'| Battle for Wesnoth | GNU GPL v2+ or CC BY-SA 4.0, per file | [github.com/wesnoth/wesnoth](https://github.com/wesnoth/wesnoth), [per-file authors](https://github.com/wesnoth/wesnoth/blob/master/copyrights.csv) |',
'| 0 A.D. | CC BY-SA 3.0, © Wildfire Games | [github.com/0ad/0ad](https://github.com/0ad/0ad), [wildfiregames.com](https://www.wildfiregames.com/) |',
'| Flare (fantasycore) | CC BY-SA 3.0 | [github.com/flareteam/flare-game](https://github.com/flareteam/flare-game) |',
'| Stendhal | per file: CC0, CC BY, public domain or GNU GPL | [github.com/arianne/stendhal](https://github.com/arianne/stendhal), [per-file sources](https://github.com/arianne/stendhal/tree/master/doc/sources) |','',
'**Changes made for Bardic:** all files were converted to MP3 and volume-levelled. Files marked *edited* were also cut, looped with crossfades, pitch-shifted, filtered or mixed from several sources (recipes in [`.github/scripts/web-sounds/`](https://github.com/arthurvangeersdaele/bardic/tree/main/.github/scripts/web-sounds)). Each file, edited or not, stays under the licence of its source(s), as listed.','']
def lic(s):
    u=LIC.get(s['license'],'')
    return f"[{s['license']}]({u})" if u else s['license']
def sec(title, items):
    out.append(f'## {title}'); out.append('')
    out.append('| File | From | Author | Licence |'); out.append('| --- | --- | --- | --- |')
    for d,i in items:
        srcs=i['sources']
        frm='<br>'.join(f"{s['project']}: [{s['file']}]({s['url']})" + (f" ([original]({s['origin']}))" if s.get('origin') else '') for s in srcs)
        au='<br>'.join(dict.fromkeys(s['author'] for s in srcs))
        li='<br>'.join(dict.fromkeys(lic(s) for s in srcs))
        out.append(f"| `{d.split('/',1)[1]}`{' *edited*' if i['modified'] else ''} | {frm} | {au} | {li} |")
    out.append('')
for sid,s in st.items():
    sec(s['title'], [(d,i) for d,i in c.items() if d.startswith(sid+'/')])
sec('Soundbox', [(d,i) for d,i in c.items() if d.startswith('soundbox/')])
open('/home/claude/bardic/docs/play/sounds/CREDITS.md','w').write('\n'.join(out))
