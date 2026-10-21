/* Bardic is now Troubadour: a bar on top of every page of the old site, linking to the same page on the new one. */
(function () {
  'use strict';
  // Inside the installed iPhone app, a message takes its place (see ios/app.js).
  if (document.documentElement.classList.contains('mode-app')) return;
  var NEW = 'https://arthurvangeersdaele.github.io/Troubadour/';
  var map = [['/compagnie/', '/troupe/'], ['/bardic-flow/', '/troubadour-ballade/'], ['/flow/', '/ballade/']];
  var path = location.pathname.replace(/^\/Bardic\//i, '/');
  map.forEach(function (m) { path = path.replace(m[0], m[1]); });
  var target = NEW + path.replace(/^\//, '');
  var bar = document.createElement('a');
  bar.href = target;
  bar.className = 'moved-bar';
  bar.innerHTML = '<b>Bardic is now Troubadour.</b> <span>Same app, same stories, a new name: everything continues on the Troubadour site.</span> <em>Go to Troubadour</em>';
  var css = document.createElement('style');
  css.textContent = '.moved-bar{position:sticky;top:0;z-index:1000;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px 12px;padding:10px 16px;background:#E0A84B;color:#15151B;font:15px/1.35 "Barlow Semi Condensed",system-ui,sans-serif;text-decoration:none;text-align:center}' +
    '.moved-bar b{font-weight:700}.moved-bar em{font-style:normal;font-weight:700;text-decoration:underline}';
  document.head.appendChild(css);
  document.body.insertBefore(bar, document.body.firstChild);
})();
