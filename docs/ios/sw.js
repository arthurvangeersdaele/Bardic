/* Bardic for iPhone: keeps the app itself on the phone so it opens without a connection.
 * Stories and sounds live in IndexedDB, not here. Bump VERSION to ship an update. */
const VERSION = '261016.1';
const SHELL = `bardic-ios-${VERSION}`;
const FONTS = 'bardic-ios-fonts';
const FILES = [
  './',
  'index.html',
  'app.js',
  'db.js',
  'install.js',
  'ios.css',
  '261014_bardic_ios.webmanifest',
  '261014_keep_awake.mp4',
  'icons/261014_bardic_ios_180.png',
  'icons/261014_bardic_ios_192.png',
  'icons/261014_bardic_ios_512.png',
  '../play/style.css',
  '../compagnie/compagnie.css',
  '../compagnie/bardic-format.js',
  '../auth/account.js',
  '../themes.js',
  '../icons/261013_bardic_icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bardic-ios-') && k !== SHELL && k !== FONTS).map((k) => caches.delete(k))))
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
  // Everything else (Recueil, discovery sounds) goes straight to the network: it is stored in IndexedDB once added.
});
