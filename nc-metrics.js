/* Netcomp metrics client v2. Loads only after consent; default = no measurement.
   No keystrokes/passwords/content capture; query strings stripped client+server side; one event per action;
   test events marked (?test=1 or localStorage nc-test=1). Click != message/call. */
(function () {
  'use strict';
  var CONSENT_KEY = 'nc-consent-v1';
  var ENDPOINT = window.NC_METRICS_ENDPOINT || null; // set at deploy time, e.g. https://netcomp-metrics.amir-netcomp.workers.dev/e
  var TEST = /[?&]test=1/.test(location.search) || lsGet('nc-test') === '1';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function consent() { return lsGet(CONSENT_KEY); }
  function isBot() { return navigator.webdriver === true || /HeadlessChrome|PhantomJS|bot|crawl|spider/i.test(navigator.userAgent); }
  function cleanPath() { return location.pathname; } // query/hash never sent (may carry PII)
  function currentView() { var m = document.getElementById('main'); return m ? (m.getAttribute('data-view') || 'home') : 'home'; }
  var campaign = (function () { var m = location.search.match(/[?&]utm_campaign=([^&]*)/); return m ? decodeURIComponent(m[1]) : null; })();
  var lastFire = {};
  function once(key, ms) { var t = Date.now(); if (lastFire[key] && t - lastFire[key] < ms) return false; lastFire[key] = t; return true; }
  function sectionOf(el) { var s = el.closest('section,[id]'); return s && s.id ? s.id : 'unknown'; }
  function modelOf(el) {
    var card = el.closest('.product-card,.prod,[data-model]');
    if (!card) return null;
    var m = card.querySelector('.model,[data-model],h3,h4');
    return m ? m.textContent.trim().slice(0, 80) : null;
  }
  // THE GATE: nothing leaves the browser without explicit prior consent.
  function send(name, params) {
    if (consent() !== 'accepted' || isBot() || !ENDPOINT) return;
    params = params || {};
    var body = { e: name, view: currentView(), page: cleanPath() };
    try { if (document.referrer) body.ref = new URL(document.referrer).origin; } catch (e) {} // origin only: no path/query/identity
    if (params.channel) { body.channel = params.channel; body.loc = params.loc; }
    if (params.model) body.model = params.model;
    if (params.cat) body.cat = params.cat;
    if (campaign) body.utm = campaign;
    if (TEST) body.test = true;
    try { navigator.sendBeacon(ENDPOINT, JSON.stringify(body)); } catch (e) {}
  }
  // initial page view once per page load (consent already granted), or right after accepting
  var pageViewSent = false;
  function emitPageView() { if (!pageViewSent) { pageViewSent = true; send('page_view'); } }
  // SPA view tracking: observe data-view changes (covers clicks, back/hash-driven changes the site performs)
  var lastView = currentView();
  function onMaybeViewChange() { var v = currentView(); if (v !== lastView) { lastView = v; send('view_change'); } }
  function watchView() {
    var main = document.getElementById('main');
    if (main && window.MutationObserver) new MutationObserver(onMaybeViewChange).observe(main, { attributes: true, attributeFilter: ['data-view'] });
    window.addEventListener('hashchange', onMaybeViewChange);
    window.addEventListener('popstate', onMaybeViewChange);
  }
  var lastElFire = (typeof WeakMap !== 'undefined') ? new WeakMap() : null; // per-element double-click guard: untagged elements never merge
  function onceEl(el, ms) {
    if (!lastElFire) return true;
    var t = Date.now(), p = lastElFire.get(el);
    if (p && t - p < ms) return false;
    lastElFire.set(el, t); return true;
  }
  document.addEventListener('click', function (e) {
    var wa = e.target.closest('a[href*="wa.me"]');
    if (wa && once('wa|' + sectionOf(wa) + '|' + (modelOf(wa) || ''), 800) && onceEl(wa, 800)) send('contact_click', { channel: 'whatsapp', loc: sectionOf(wa), model: modelOf(wa) });
    var tel = e.target.closest('a[href^="tel:"]');
    if (tel && once('tel|' + sectionOf(tel) + '|' + (modelOf(tel) || ''), 800) && onceEl(tel, 800)) send('contact_click', { channel: 'phone', loc: sectionOf(tel), model: modelOf(tel) });
    var mail = e.target.closest('a[href^="mailto:"]');
    if (mail && once('mail|' + sectionOf(mail) + '|' + (modelOf(mail) || ''), 800) && onceEl(mail, 800)) send('contact_click', { channel: 'email', loc: sectionOf(mail), model: modelOf(mail) });
    var f = e.target.closest('.filter');
    if (f && onceEl(f, 400)) send('catalog_filter', { cat: (f.getAttribute('data-cat') || '').slice(0, 40) });
    var pf = e.target.closest('.pcatf-b');
    if (pf && onceEl(pf, 400)) send('catalog_filter', { cat: (pf.getAttribute('data-pcat') || '').slice(0, 40) });
    // Quote buttons are NOT contact channels: they navigate to the contact view. Count as product interest with the card's model name.
    var pi = e.target.closest('.prod button[data-go="contact"]');
    if (pi && onceEl(pi, 800)) {
      var card = pi.closest('.prod');
      var h = card && card.querySelector('h3');
      send('product_interest', { model: h ? h.textContent.trim().slice(0, 80) : null });
    }
  }, true);
  // consent banner (RTL Hebrew), shown only when no stored choice; default = no measurement
  var bannerEl = null;
  function acceptConsent() { lsSet(CONSENT_KEY, 'accepted'); if (bannerEl) { bannerEl.remove(); bannerEl = null; } emitPageView(); }
  function declineConsent() { lsSet(CONSENT_KEY, 'declined'); if (bannerEl) { bannerEl.remove(); bannerEl = null; } }
  function showBanner() {
    var bar = document.createElement('div'); bannerEl = bar;
    bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', 'הסכמה למדידת שימוש');
    bar.style.cssText = 'position:fixed;inset-inline:0;bottom:0;z-index:9999;background:#0d1f14;color:#eef4ea;padding:14px 18px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-family:inherit;font-size:14px;border-top:1px solid #2c4a33;direction:rtl';
    var txt = document.createElement('span');
    txt.textContent = 'האתר מודד שימוש אנונימי (עמודים, מקור הגעה, סוג מכשיר ולחיצות על כפתורי קשר) לשיפור השירות. ללא הקלדות, תוכן אישי או כתובת IP מלאה.';
    txt.style.cssText = 'flex:1;min-width:240px';
    var mk = function (label, primary, fn) {
      var b = document.createElement('button'); b.textContent = label;
      b.style.cssText = 'padding:8px 16px;border-radius:8px;border:1px solid #6f9f5f;cursor:pointer;font-size:14px;' + (primary ? 'background:#8fd14f;color:#0d1f14;font-weight:700;border-color:#8fd14f' : 'background:transparent;color:#eef4ea');
      b.addEventListener('click', fn); return b;
    };
    bar.appendChild(txt);
    bar.appendChild(mk('מסכים', true, acceptConsent));
    bar.appendChild(mk('מעדיף שלא', false, declineConsent));
    document.body.appendChild(bar);
  }
  function init() {
    watchView();
    var c = consent();
    if (c === 'accepted') emitPageView();
    else if (c === null && document.body) showBanner();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.ncConsent = { state: consent, accept: acceptConsent, decline: declineConsent };
})();
