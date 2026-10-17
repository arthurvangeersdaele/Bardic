/* Bardic Flow: keeps the app itself on the device so it opens without a connection.
 * Flows and sounds live in IndexedDB, not here. Bump VERSION (and VERSION in app.js) to ship an update. */
const VERSION = '261017.12';
const SHELL = `bardic-flow-${VERSION}`;
const FONTS = 'bardic-flow-fonts';
const FILES = [
  './',
  'index.html',
  'app.js',
  'flow.css',
  'flow-install.css',
  '../ios/install.js',
  'flow-format.js',
  'flow-db.js',
  'flow-ui.js',
  'flow-player.js',
  'flow-editor.js',
  '261017_bardic_flow.webmanifest',
  'icons/261017_bardic_flow_icon.svg',
  'icons/261017_bardic_flow_180.png',
  'icons/261017_bardic_flow_192.png',
  'icons/261017_bardic_flow_512.png',
  '../ios/261014_keep_awake.mp4',
  '../play/style.css',
  '../compagnie/compagnie.css',
  '../compagnie/bardic-format.js',
  '../auth/account.js',
  '../themes.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bardic-flow-') && k !== SHELL && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const shellUrls = new Set(FILES.map((f) => new URL(f, self.registration.scope).href));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: once fetched, always from the phone.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // The app shell: fresh from the network when online (quick timeout), from the phone otherwise.
  const href = url.origin + url.pathname;
  if (req.mode === 'navigate' || shellUrls.has(href)) {
    e.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const key = req.mode === 'navigate' ? new URL('./', self.registration.scope).href : href;
      try {
        const res = await Promise.race([
          fetch(req, { cache: 'no-cache' }),
          new Promise((_, ko) => setTimeout(() => ko(new Error('slow')), 3500)),
        ]);
        if (res.ok) cache.put(key, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(key, { ignoreSearch: true });
        if (hit) return hit;
        throw err;
      }
    })());
  }
  // Everything else goes straight to the network.
});
