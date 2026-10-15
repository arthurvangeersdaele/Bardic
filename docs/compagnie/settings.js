/* Settings for the Compagnie pages: theme, appearance and bard name.
 * Same dialog and same saved settings ('bardic.settings') as the player, so a change here shows everywhere. */
(() => {
  'use strict';
  const KEY = 'bardic.settings';
  const THEMES = [['obsidian', 'Obsidian'], ['parchment', 'Parchment'], ['blood', 'Blood'], ['divination', 'Divination']];
  const light = matchMedia('(prefers-color-scheme: light)');

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  const write = (patch) => {
    try { localStorage.setItem(KEY, JSON.stringify(Object.assign(read(), patch))); } catch (e) { /* private mode */ }
    window.dispatchEvent(new CustomEvent('bardic:settings'));
  };
  const get = () => Object.assign({ theme: 'obsidian', mode: 'dark', bardName: '' }, read());

  function apply() {
    const s = get();
    const mode = s.mode === 'system' ? (light.matches ? 'light' : 'dark') : s.mode;
    const root = document.documentElement;
    root.dataset.theme = s.theme;
    root.dataset.mode = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bar').trim();
    document.querySelectorAll('.settings .swatch').forEach((w) => { w.dataset.mode = mode; });
  }
  light.addEventListener?.('change', () => get().mode === 'system' && apply());

  const gear = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  const close = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';

  const dlg = document.createElement('dialog');
  dlg.className = 'settings';
  dlg.setAttribute('aria-labelledby', 'settings-title');
  dlg.innerHTML = `
    <form method="dialog" class="set-head"><h2 id="settings-title">Settings</h2><button class="ico small" value="close" aria-label="Close settings">${close}</button></form>
    <section><h3>Theme</h3><div class="themes" role="radiogroup" aria-label="Theme"></div></section>
    <section><h3>Appearance</h3>
      <div class="seg" role="radiogroup" aria-label="Appearance">
        <button type="button" role="radio" data-v="dark">Dark</button><button type="button" role="radio" data-v="light">Light</button><button type="button" role="radio" data-v="system">System</button>
      </div>
    </section>
    <section><h3>Bard name</h3><div class="bard-account"></div></section>`;
  document.body.append(dlg);

  const themes = dlg.querySelector('.themes');
  THEMES.forEach(([id, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme';
    b.setAttribute('role', 'radio');
    b.dataset.v = id;
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.dataset.theme = id;
    sw.style.background = 'var(--bg)';
    ['--music', '--amb', '--evt'].forEach((c, n) => {
      const i = document.createElement('i');
      i.style.background = `var(${c})`;
      i.style.width = `${[70, 100, 45][n]}%`;
      sw.append(i);
    });
    const name = document.createElement('span');
    name.textContent = label;
    b.append(sw, name);
    b.onclick = () => { write({ theme: id }); sync(); };
    themes.append(b);
  });
  dlg.querySelectorAll('.seg button').forEach((b) => { b.onclick = () => { write({ mode: b.dataset.v }); sync(); }; });
  if (window.BardAccount) window.BardAccount.mount(dlg.querySelector('.bard-account'));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  function sync() {
    const s = get();
    themes.querySelectorAll('.theme').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === s.theme)));
    dlg.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === s.mode)));
    apply();
  }

  const btn = document.createElement('button');
  btn.className = 'ico';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Settings');
  btn.title = 'Settings';
  btn.innerHTML = gear;
  const open = () => { sync(); if (!dlg.open) dlg.showModal(); };
  btn.onclick = open;
  window.BardicSettings = { open };
  document.querySelector('.sbar')?.append(btn);

  window.addEventListener('storage', (e) => { if (e.key === KEY) sync(); });
  sync();
})();
