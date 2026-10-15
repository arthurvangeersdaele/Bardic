/* Bardic themes, shared by the web player, Bardic for iPhone and the Compagnie pages.
 *
 * Four everyday themes, plus six limited editions offered until 31 December 2026. Choosing a limited
 * edition before then collects it on this device ('bardic.themes'), and a collected theme stays for good.
 * From 1 January 2027, the limited editions nobody collected here are no longer offered.
 * The same rule lives in the Android app (settings/AppSettings.kt). Colours: play/style.css.
 */
(function (global) {
  'use strict';
  const KEY = 'bardic.themes';
  const END = new Date(2027, 0, 1); // local midnight, the night of 31 December 2026
  const THEMES = [
    { id: 'obsidian', label: 'Obsidian' },
    { id: 'parchment', label: 'Parchment' },
    { id: 'blood', label: 'Blood' },
    { id: 'divination', label: 'Divination' },
    { id: 'pumpkin', label: 'Pumpkin', special: true },
    { id: 'santa', label: 'Santa', special: true },
    { id: 'pride', label: 'Pride', special: true },
    { id: 'dragonfire', label: 'Dragonfire', special: true },
    { id: 'abyss', label: 'Abyss', special: true },
    { id: 'excalibur', label: 'Excalibur', special: true },
  ];

  function collected() {
    try { return (JSON.parse(localStorage.getItem(KEY) || '{}').collected) || []; } catch (e) { return []; }
  }
  const open = () => new Date() < END;
  const has = (id) => collected().includes(id);

  /** Marks a limited edition as kept on this device (only while it is offered). */
  function collect(id) {
    const t = THEMES.find((x) => x.id === id);
    if (!t || !t.special || has(id) || !open()) return;
    try { localStorage.setItem(KEY, JSON.stringify({ collected: collected().concat(id) })); } catch (e) { /* private mode */ }
  }

  /** The themes to show in Settings, with { special, collected }. */
  function list() {
    const o = open();
    return THEMES.filter((t) => !t.special || o || has(t.id)).map((t) => Object.assign({}, t, { collected: !!t.special && has(t.id) }));
  }

  /** The theme to apply: a limited edition no longer offered here falls back to Obsidian. */
  function resolve(id) {
    return list().some((t) => t.id === id) ? id : 'obsidian';
  }

  const NOTE_OPEN = 'Gold medal themes are limited editions. Choose one before 31 December 2026 and it stays yours on this device for good.';
  const NOTE_AFTER = 'Gold medal themes are the limited editions you collected in 2026.';
  function note() { return open() ? NOTE_OPEN : (list().some((t) => t.special) ? NOTE_AFTER : ''); }

  /** Paints the theme buttons into `box` (a .themes row), each with its swatch. `onPick(id)` saves the choice. */
  function render(box, current, onPick) {
    box.textContent = '';
    list().forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `theme${t.special ? ' special' : ''}`;
      b.setAttribute('role', 'radio');
      b.dataset.v = t.id;
      b.setAttribute('aria-checked', String(t.id === current));
      if (t.special) b.title = t.collected ? `${t.label}: limited edition, collected` : `${t.label}: limited edition until 31 December 2026`;
      const sw = document.createElement('div');
      sw.className = 'swatch';
      sw.dataset.theme = t.id;
      sw.dataset.mode = document.documentElement.dataset.mode || 'dark';
      sw.style.background = 'var(--bg)';
      ['--music', '--amb', '--evt'].forEach((c, n) => {
        const i = document.createElement('i');
        i.style.background = `var(${c})`;
        i.style.width = `${[70, 100, 45][n]}%`;
        sw.append(i);
      });
      if (t.special) {
        const m = document.createElement('span');
        m.className = 'medal';
        m.setAttribute('aria-hidden', 'true');
        sw.append(m);
      }
      const name = document.createElement('span');
      name.textContent = t.label;
      b.append(sw, name);
      b.addEventListener('click', () => { collect(t.id); onPick(t.id); });
      box.append(b);
    });
    let n = box.parentNode && box.parentNode.querySelector('.theme-note');
    const text = note();
    if (text) {
      if (!n) { n = document.createElement('p'); n.className = 'theme-note'; box.after(n); }
      n.textContent = text;
    } else if (n) n.remove();
    const on = box.querySelector('[aria-checked="true"]');
    if (on && on.scrollIntoView && box.scrollWidth > box.clientWidth) {
      box.scrollLeft = Math.max(0, on.offsetLeft - box.clientWidth / 2 + on.clientWidth / 2);
    }
  }

  // Collect the theme already in use (chosen before this file existed).
  try { const s = JSON.parse(localStorage.getItem('bardic.settings') || '{}'); if (s.theme) collect(s.theme); } catch (e) { /* none */ }

  global.BardicThemes = { THEMES, END, list, resolve, collect, render, note, open };
})(window);
