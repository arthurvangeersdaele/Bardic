import subprocess, sys, glob, os, json, numpy as np
from build import load, SR
def stats(f):
    a = load(f); m = np.abs(a).max(axis=1)
    d = len(a)/SR; peak = float(m.max())
    silent = float((m < 0.002).mean())
    # seam check for loops: jump between last and first samples
    seam = float(np.abs(a[-1]-a[0]).max())
    rms = float(np.sqrt((a**2).mean()))
    return d, peak, silent, seam, rms
for f in sorted(glob.glob(sys.argv[1] + '/sounds/**/*.mp3', recursive=True)):
    d, p, s, seam, rms = stats(f)
    flag = []
    if s > 0.35: flag.append('SILENT%d' % (s*100))
    if d < 0.4: flag.append('SHORT')
    if '/ambience/' in f and seam > 0.15: flag.append('SEAM')
    print(f'{d:6.1f}s pk{p:.2f} rms{rms:.3f} {" ".join(flag):12s} {f.split("/sounds/")[1]}')
