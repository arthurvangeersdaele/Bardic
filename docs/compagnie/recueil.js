/* Recueil: the shared library of .bardic files, listed from ../recueil/index.json (built by a GitHub Action). */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const list = $('#tales');
  const chev = '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function size(bytes) {
    if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    const mb = bytes / 1048576;
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  }

  let tales = [];

  function render(filter) {
    list.textContent = '';
    const q = (filter || '').trim().toLowerCase();
    const shown = tales.filter((t) => !q || [t.title, t.bard, t.description, ...(t.chapters || [])].join(' ').toLowerCase().includes(q));
    if (!tales.length) {
      list.append(el('li', 'empty-rec', 'The Recueil is still blank, waiting for its first tale. Will it be yours?'));
      return;
    }
    if (!shown.length) {
      list.append(el('li', 'empty-rec', 'No tale answers to that name.'));
      return;
    }
    shown.forEach((t) => {
      const li = el('li', 'tale');
      const head = el('button');
      head.type = 'button';
      head.setAttribute('aria-expanded', 'false');
      const n = (t.chapters || []).length;
      head.append(el('span', 't', t.title), el('span', 'tc', `${n} chapter${n === 1 ? '' : 's'}`), el('span', 'ts', size(t.size)));
      head.insertAdjacentHTML('beforeend', chev);
      const inside = el('div', 'inside');
      const by = el('p', 'by');
      const sign = [t.bard ? `by ${t.bard}` : '', t.revision > 1 ? `revision ${t.revision}` : ''].filter(Boolean).join(', ');
      by.textContent = [sign, t.description || ''].filter(Boolean).join('. ');
      if (by.textContent) inside.append(by);
      const ol = el('ol');
      (t.chapters || []).forEach((c) => ol.append(el('li', '', c)));
      const acts = el('div', 'acts');
      const href = `../recueil/${encodeURIComponent(t.file)}`;
      const dl = el('a', 'btn primary', 'Download');
      dl.href = href;
      dl.setAttribute('download', t.file);
      const open = el('a', 'btn', 'Open in the builder');
      open.href = `builder.html?open=${encodeURIComponent(href)}`;
      acts.append(dl, open);
      inside.append(ol, acts);
      head.onclick = () => {
        const on = !li.hasAttribute('open');
        li.toggleAttribute('open', on);
        head.setAttribute('aria-expanded', String(on));
      };
      li.append(head, inside);
      list.append(li);
    });
  }

  fetch('../recueil/index.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { tales: [] }))
    .catch(() => ({ tales: [] }))
    .then((data) => {
      tales = (data.tales || []).slice().sort((a, b) => a.title.localeCompare(b.title));
      $('#seek').hidden = tales.length < 6;
      render();
    });
  $('#q').addEventListener('input', (e) => render(e.target.value));
})();
