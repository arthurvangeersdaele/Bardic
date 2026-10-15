import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from fetch import REPOS
LISTS = '/home/claude/lists'
_cache = {}
def lst(alias):
    if alias not in _cache:
        f = os.path.join(LISTS, REPOS[alias] + '.txt')
        _cache[alias] = [l.rstrip('\n') for l in open(f)]
    return _cache[alias]
def resolve(ref):
    a, suf = ref.split(':', 1)
    c = [p for p in lst(a) if p == suf or p.endswith('/' + suf)]
    if len(c) > 1:
        # prefer non-lossless_sources / non-android / ogg
        c2 = [p for p in c if 'lossless_sources' not in p and 'www.' not in p and 'Android' not in p and 'AudioMono' not in p]
        if len(c2) >= 1: c = c2
    if len(c) > 1:
        c2 = [p for p in c if p.endswith('.ogg')] or c
        c = c2
    if len(c) != 1:
        raise KeyError(f'{ref}: {len(c)} matches {c[:4]}')
    return a + ':' + c[0]
def refs_of(recipe):
    if isinstance(recipe, str):
        return [] if recipe.startswith('BUILD:') else [recipe]
    if recipe[0] == 'mix':
        return [r[0] for r in recipe[1]]
    if recipe[0] == 'seq':
        return list(recipe[1])
    return [recipe[0]]
if __name__ == '__main__':
    from plan import STORIES
    bad, out = 0, set()
    for s in STORIES:
        for ch in s['chapters']:
            for z in ('music', 'ambience', 'events'):
                for snd in ch[z]:
                    for r in refs_of(snd[1]):
                        try: out.add(resolve(r))
                        except KeyError as e: print('MISS', s['slug'], ch['title'], snd[0], e); bad += 1
    open('needed.txt', 'w').write('\n'.join(sorted(out)))
    print(bad, 'missing,', len(out), 'files')
