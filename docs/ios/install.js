/* Bardic web app: the install page (an iPhone, an iPad or an Android tablet, in a browser tab).
 * Tells the steps for the device and browser in use and points the arrow at the right button. */
(() => {
  'use strict';
  if (!document.documentElement.classList.contains('mode-install')) return;

  const ua = navigator.userAgent;
  const $ = (s) => document.querySelector(s);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Snapchat|Line\//.test(ua) || (/ GSA\//.test(ua));
  const chrome = /CriOS/.test(ua);
  const firefox = /FxiOS/.test(ua);
  const edge = /EdgiOS/.test(ua);
  const safariVersion = (() => { const m = /Version\/(\d+)/.exec(ua); return m ? +m[1] : 0; })();
  const dots = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/></svg>';

  let title = 'Tap Share', text = 'At the bottom of Safari, where the arrow points.';
  let where = 'bottom-center', label = 'Share', btn = 'share';

  const dev = window.BARDIC_DEVICE || 'iPhone';
  $('#inst-dev').textContent = dev === 'tablet' ? 'Bardic for your tablet' : `Bardic for ${dev}`;

  if (dev === 'tablet') {
    // Android tablet: the browser menu installs the app; Chrome can also do it in one tap.
    title = 'Open the browser menu';
    text = 'In Chrome, the three dots button at the top right, where the arrow points.';
    where = 'top-right'; label = 'Menu'; btn = 'dots';
    $('#m-sheet-hl').textContent = 'Install app';
    $('#m-sheet-1').textContent = 'New tab';
    $('#m-sheet-2').textContent = 'Bookmarks';
    document.querySelector('.m-toggle').hidden = true;
    $('#step2-title').textContent = 'Tap Install app';
    $('#step2-text').textContent = 'Or Add to Home screen, depending on the browser.';
    $('#m-add-btn').textContent = 'Install';
    $('#step3-title').textContent = 'Tap Install';
    $('#step3-text').textContent = 'The Bardic icon appears on your Home Screen.';
    $('#inst-once').textContent = 'Only once: after that, Bardic opens from its icon like any app.';
    let prompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      prompt = e;
      $('#inst-quick').hidden = false;
    });
    $('#inst-go').addEventListener('click', async () => {
      if (!prompt) return;
      prompt.prompt();
      try { await prompt.userChoice; } catch (err) { /* dismissed */ }
      prompt = null;
      $('#inst-quick').hidden = true;
    });
  } else if (dev === 'iPad' && !inApp && !chrome && !firefox && !edge) {
    title = 'Tap Share, at the top right';
    text = 'In the Safari toolbar, next to the address, where the arrow points.';
    where = 'top-right';
  } else if (inApp) {
    $('#inst-inapp').hidden = false;
    document.documentElement.classList.add('in-app-browser');
    where = 'none';
  } else if (chrome) {
    title = 'Tap Share, next to the address';
    text = 'At the right of the address bar, at the top.';
    where = 'top-right';
  } else if (firefox || edge) {
    title = 'Open the menu, then tap Share';
    text = firefox ? 'The three lines button, bottom right.' : 'The three dots button, at the bottom.';
    where = 'bottom-right'; label = 'Menu'; btn = 'dots';
  } else if (safariVersion >= 26) {
    title = 'Tap the three dots, then Share';
    text = 'Bottom right of Safari, where the arrow points. Share already visible? Tap it.';
    where = 'bottom-right'; label = 'Here'; btn = 'dots';
  }

  $('#step1-title').textContent = title;
  $('#step1-text').textContent = text;
  const mb = $('#m-btn');
  if (btn === 'dots') { mb.classList.add('dots'); mb.innerHTML = dots; }
  $('#m-bar').classList.toggle('top', where === 'top-right');
  document.documentElement.classList.toggle('arrow-top', where === 'top-right');

  const arrow = $('#to-share');
  if (where === 'none') arrow.hidden = true;
  else { arrow.classList.add(`at-${where}`); $('#to-share-label').textContent = label; }

  const copy = $('#inst-copy');
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href.split('#')[0]); copy.textContent = 'Link copied, paste it in Safari'; }
    catch (e) { copy.textContent = location.href.split('#')[0]; }
  });
})();
