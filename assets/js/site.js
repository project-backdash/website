/*
 * backdash.gg: small enhancements. Every page works without this file.
 *  - Theme control in the footer (Auto / Dark / Light), remembered in localStorage.
 *    ?theme=light, ?theme=dark or ?theme=auto in the address applies a theme without
 *    saving it (handy for screenshots). The inline script in <head> applies the saved
 *    theme before the first paint, so there is no flash.
 *  - Drawer (the menu behind the hamburger, a <details> element that already opens and
 *    closes without JavaScript): Escape closes it and returns focus to the button, Tab
 *    stays inside it while it is open, choosing a link or clicking outside closes it.
 */
(function () {
  'use strict';

  var KEY = 'pbd-theme';
  var root = document.documentElement;

  /* Theme ---------------------------------------------------------------- */

  function readStored() {
    try {
      var v = window.localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'auto';
    } catch (e) {
      return 'auto';
    }
  }

  function writeStored(value) {
    try {
      if (value === 'auto') window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, value);
    } catch (e) {
      /* storage blocked: the choice lasts for this page only */
    }
  }

  function urlTheme() {
    var m = /[?&]theme=(light|dark|auto)(?:&|$)/.exec(window.location.search);
    return m ? m[1] : null;
  }

  function applyTheme(value) {
    if (value === 'light' || value === 'dark') root.setAttribute('data-theme', value);
    else root.removeAttribute('data-theme');
  }

  var initial = urlTheme() || readStored();
  applyTheme(initial);

  function initThemeControl() {
    var controls = document.querySelectorAll('[data-theme-control]');
    for (var i = 0; i < controls.length; i++) {
      var radios = controls[i].querySelectorAll('input[type="radio"]');
      for (var j = 0; j < radios.length; j++) {
        radios[j].checked = radios[j].value === initial;
        radios[j].addEventListener('change', function (event) {
          var value = event.target.value;
          writeStored(value);
          applyTheme(value);
        });
      }
      controls[i].hidden = false;
    }
  }

  /* Drawer --------------------------------------------------------------- */

  function focusables(drawer) {
    var summary = drawer.querySelector('summary');
    var links = drawer.querySelectorAll('.drawer-panel a[href], .drawer-panel button:not([disabled])');
    var list = [summary];
    for (var i = 0; i < links.length; i++) list.push(links[i]);
    return list;
  }

  function initDrawer(drawer) {
    var summary = drawer.querySelector('summary');
    if (!summary) return;

    function close(returnFocus) {
      if (!drawer.open) return;
      drawer.open = false;
      if (returnFocus) summary.focus();
    }

    function onKeydown(event) {
      if (!drawer.open) return;
      if (event.key === 'Escape' || event.key === 'Esc') {
        event.preventDefault();
        close(true);
        return;
      }
      if (event.key !== 'Tab') return;
      var items = focusables(drawer);
      var first = items[0];
      var last = items[items.length - 1];
      var active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (items.indexOf(active) === -1) {
        event.preventDefault();
        first.focus();
      }
    }

    function onDocumentClick(event) {
      if (!drawer.open) return;
      if (!drawer.contains(event.target)) close(false);
    }

    drawer.addEventListener('toggle', function () {
      if (drawer.open) {
        document.addEventListener('keydown', onKeydown);
        document.addEventListener('click', onDocumentClick);
      } else {
        document.removeEventListener('keydown', onKeydown);
        document.removeEventListener('click', onDocumentClick);
      }
    });

    drawer.addEventListener('click', function (event) {
      var link = event.target.closest ? event.target.closest('.drawer-panel a') : null;
      if (link) close(false);
    });

    // A sidebar replaces the drawer on wide screens: close it if the window grows.
    if (window.matchMedia) {
      var wide = window.matchMedia('(min-width: 1024px)');
      var onChange = function () {
        if (wide.matches && document.querySelector('.sidebar')) close(false);
      };
      if (wide.addEventListener) wide.addEventListener('change', onChange);
      else if (wide.addListener) wide.addListener(onChange);
    }
  }

  function init() {
    initThemeControl();
    var drawers = document.querySelectorAll('details[data-drawer]');
    for (var i = 0; i < drawers.length; i++) initDrawer(drawers[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* @preview-switcher: begin
 * Preview switcher: preview builds only. build.mjs cuts everything from this comment to the end
 * marker out of public builds; the markup it drives is src/_partials/preview-logo.html.
 *  - Swaps the logo mark in the app bar and the footer, and the tab icon, between the variants
 *    in the <template data-logo> elements. H, the logo (the mark partial), is the default; another
 *    choice is remembered in localStorage (pbd-logo).
 *  - ?logo=H, C, N, S, L2 or T in the address applies a variant without saving it (handy for
 *    screenshots; the picker then starts folded). ?switcher=off hides the picker. The codes used
 *    before every variant was drawn with block arrows still work: HB is H, L2B is L2.
 *  - The picker fades out while a primary button or Home's animated hero is under it, unless it is
 *    in use (focus or a press inside it).
 */
(function () {
  'use strict';

  var KEY = 'pbd-logo';
  var OPEN_KEY = 'pbd-logo-switcher';
  var DEFAULT = 'H';
  var FORMER = { HB: 'H', L2B: 'L2' };  // earlier codes of the same marks, still in bookmarks and remembered choices
  var root = document.documentElement;

  function read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (e) {
      /* storage blocked: the choice lasts for this page only */
    }
  }

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]);
    } catch (e) {
      return m[1];
    }
  }

  function init() {
    var box = document.querySelector('[data-logo-switcher]');
    var templates = document.querySelectorAll('template[data-logo]');
    // site.css keeps the lockups hidden until data-logo is set: set it on every way out.
    if (!box || !templates.length || !('content' in templates[0])) {
      root.setAttribute('data-logo', DEFAULT);
      return;
    }

    var variants = {};
    for (var i = 0; i < templates.length; i++) {
      var t = templates[i];
      var svg = t.content.querySelector('svg');
      if (!svg) continue;
      variants[t.getAttribute('data-logo').toUpperCase()] = {
        name: t.getAttribute('data-logo-name') || '',
        favicon: t.getAttribute('data-logo-favicon') || '',
        svg: svg,
      };
    }
    function known(code) {
      code = String(code || '').toUpperCase();
      if (FORMER[code]) code = FORMER[code];
      return variants[code] ? code : null;
    }
    if (!variants[DEFAULT]) return;

    var toggle = box.querySelector('.logo-switcher-toggle');
    var panel = box.querySelector('.logo-switcher-panel');
    var nameLine = box.querySelector('[data-logo-name]');
    var currentLabel = box.querySelector('[data-logo-current]');
    var options = box.querySelectorAll('[data-logo-choice]');
    var current = DEFAULT;

    /* Tab icon: the page's own <link rel="icon"> elements are kept and put back for "". */
    var head = document.head;
    var ownIcons = [];
    var shownIcons = [];
    var links = document.querySelectorAll('link[rel~="icon"]');
    for (var j = 0; j < links.length; j++) {
      ownIcons.push(links[j].cloneNode(false));
      shownIcons.push(links[j]);
    }

    function setFavicon(href) {
      // New elements rather than a changed href: every browser then fetches the icon again.
      for (var k = 0; k < shownIcons.length; k++) {
        if (shownIcons[k].parentNode) shownIcons[k].parentNode.removeChild(shownIcons[k]);
      }
      shownIcons = [];
      if (href) {
        var link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/svg+xml';
        link.href = href;
        shownIcons.push(link);
      } else {
        for (var n = 0; n < ownIcons.length; n++) shownIcons.push(ownIcons[n].cloneNode(false));
      }
      for (var m = 0; m < shownIcons.length; m++) head.appendChild(shownIcons[m]);
    }

    // The name line: code, a small one-colour copy of the mark, name.
    function showName(code) {
      if (!nameLine || !variants[code]) return;
      nameLine.textContent = '';
      var strong = document.createElement('b');
      strong.textContent = code;
      nameLine.appendChild(strong);
      nameLine.appendChild(document.importNode(variants[code].svg, true));
      nameLine.appendChild(document.createTextNode(variants[code].name));
    }

    function apply(code) {
      var v = variants[code];
      var marks = document.querySelectorAll('.app-bar .lockup .mark, .site-footer .lockup .mark');
      for (var k = 0; k < marks.length; k++) {
        marks[k].parentNode.replaceChild(document.importNode(v.svg, true), marks[k]);
      }
      if (code !== current || v.favicon) setFavicon(v.favicon);
      current = code;
      root.setAttribute('data-logo', code);
      if (currentLabel) currentLabel.textContent = code;
      for (var n = 0; n < options.length; n++) {
        options[n].setAttribute('aria-pressed', options[n].getAttribute('data-logo-choice') === code ? 'true' : 'false');
      }
      showName(code);
    }

    /* Out of the way of the primary button (phones: the full-width download block) and of Home's
       hero, its copy and the animated drawing (on a 320 x 640 phone the folded box starts over the
       hero copy), unless the box is in use: focus inside it, or a press inside it that no press
       elsewhere has followed yet (touch browsers that do not focus a tapped button). The drawing's
       rect is taken 48 px deeper, because its Pause / Play button hangs below it.
       Separately, the box steps fully aside (is-clear) whenever the element with keyboard focus is
       under it, on every page, so the focus ring is never hidden (WCAG 2.4.11). A tabindex="-1"
       target (the skip link's <main>) shows no ring and does not count. */
    var avoid = document.querySelectorAll('.btn-primary, .hero-stick, .hero-copy');
    var engaged = false;
    var queued = false;
    function near(b, r, below) {
      return b.width > 0 && b.bottom + below > r.top - 8 && b.top < r.bottom + 8 && b.right > r.left - 8 && b.left < r.right + 8;
    }
    function checkYield() {
      queued = false;
      if (box.hidden) return;
      var r = box.getBoundingClientRect();
      var over = false;
      for (var k = 0; k < avoid.length && !over; k++) {
        over = near(avoid[k].getBoundingClientRect(), r, avoid[k].classList.contains('hero-stick') ? 48 : 0);
      }
      box.classList.toggle('is-yielding', over && !engaged && !box.contains(document.activeElement));
      var f = document.activeElement;
      var ring = f && f !== document.body && f !== document.documentElement && !box.contains(f) &&
        f.getAttribute('tabindex') !== '-1';
      box.classList.toggle('is-clear', !!ring && near(f.getBoundingClientRect(), r, 0));
    }
    function queueYield() {
      if (queued) return;
      queued = true;
      (window.requestAnimationFrame || window.setTimeout)(checkYield);
    }

    function setOpen(open, remember) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.hidden = !open;
      box.classList.toggle('is-open', open);
      if (remember) write(OPEN_KEY, open ? 'open' : 'closed');
      queueYield();
    }

    toggle.addEventListener('click', function () {
      setOpen(panel.hidden, true);
    });

    function onChoose(event) {
      var code = known(event.currentTarget.getAttribute('data-logo-choice'));
      if (!code) return;
      apply(code);
      write(KEY, code === DEFAULT ? null : code);
    }
    // The name line shows the variant under the pointer or the focus, then the current one again.
    function onPoint(event) {
      showName(event.currentTarget.getAttribute('data-logo-choice'));
    }
    function onLeave() {
      showName(current);
    }
    for (var o = 0; o < options.length; o++) {
      options[o].addEventListener('click', onChoose);
      options[o].addEventListener('mouseenter', onPoint);
      options[o].addEventListener('focus', onPoint);
      options[o].addEventListener('mouseleave', onLeave);
      options[o].addEventListener('blur', onLeave);
    }

    box.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' || event.key === 'Esc') {
        if (!panel.hidden) {
          event.preventDefault();
          setOpen(false, true);
          toggle.focus();
        }
        return;
      }
      var at = Array.prototype.indexOf.call(options, document.activeElement);
      if (at === -1) return;
      var to = -1;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') to = (at + 1) % options.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') to = (at - 1 + options.length) % options.length;
      else if (event.key === 'Home') to = 0;
      else if (event.key === 'End') to = options.length - 1;
      if (to !== -1) {
        event.preventDefault();
        options[to].focus();
      }
    });

    window.addEventListener('scroll', queueYield, { passive: true });
    window.addEventListener('resize', queueYield);
    document.addEventListener('focusin', queueYield);
    document.addEventListener('focusout', queueYield);
    document.addEventListener('pointerdown', function (event) {
      engaged = box.contains(event.target);
      queueYield();
    }, true);

    var fromUrl = known(param('logo'));
    apply(fromUrl || known(read(KEY)) || DEFAULT);

    if (String(param('switcher')).toLowerCase() === 'off') return;
    var openPref = read(OPEN_KEY);
    // Open by default only from 1280 px wide: the open box (about 300 x 240 px) covered the text of
    // Home's third feature at 1024 x 768. Narrower screens start folded.
    var wide = window.matchMedia ? window.matchMedia('(min-width: 1280px)').matches : true;
    box.hidden = false;
    root.classList.add('has-logo-switcher');
    setOpen(fromUrl ? false : openPref ? openPref === 'open' : wide, false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
/* @preview-switcher: end */

/* @preview-switcher: begin
 * Preview font toggle (preview builds only; cut from public builds with the block above). The site's
 * display face is PBD Display, our own (docs/brand/assets/explore/type/). Buttons [data-font-choice] in
 * src/_partials/preview-logo.html switch it back to Saira, the old one, for comparison, by setting
 * data-font="saira" on <html>, and swap the header/footer wordmark for its Saira outlines
 * (<template data-wordmark="Saira">). Saira is remembered in localStorage (pbd-font); ?font=saira or
 * ?font=pbd applies without saving.
 */
(function () {
  'use strict';
  var KEY = 'pbd-font';
  var root = document.documentElement;

  function read() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write(v) {
    try {
      if (v === null) window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, v);
    } catch (e) { /* storage blocked */ }
  }
  function fromUrl() {
    var m = /[?&]font=(pbd|saira)(?:[&#]|$)/i.exec(window.location.search);
    return m ? m[1].toLowerCase() : null;
  }

  function init() {
    var buttons = document.querySelectorAll('[data-font-choice]');
    var tpl = document.querySelector('template[data-wordmark="Saira"]');
    if (!buttons.length) return;
    var originals = [];
    var marks = document.querySelectorAll('.lockup svg.wordmark');
    for (var i = 0; i < marks.length; i++) originals.push({ el: marks[i] });

    function apply(choice) {
      var saira = choice === 'saira';
      if (saira) root.setAttribute('data-font', 'saira');
      else root.removeAttribute('data-font');
      for (var j = 0; j < originals.length; j++) {
        var o = originals[j];
        var shown = o.shown || o.el;
        var next = o.el;
        if (saira && tpl && 'content' in tpl) {
          if (!o.alt) o.alt = tpl.content.querySelector('svg').cloneNode(true);
          next = o.alt;
        }
        if (shown !== next && shown.parentNode) shown.parentNode.replaceChild(next, shown);
        o.shown = next;
      }
      for (var k = 0; k < buttons.length; k++) {
        buttons[k].setAttribute('aria-pressed', buttons[k].getAttribute('data-font-choice') === choice ? 'true' : 'false');
      }
    }

    for (var b = 0; b < buttons.length; b++) {
      buttons[b].addEventListener('click', function (ev) {
        var choice = ev.currentTarget.getAttribute('data-font-choice') === 'saira' ? 'saira' : 'pbd';
        write(choice === 'saira' ? 'saira' : null);
        apply(choice);
      });
    }
    apply(fromUrl() || (read() === 'saira' ? 'saira' : 'pbd'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
/* @preview-switcher: end */

/* @preview-switcher: begin
 * Preview accent-colour toggle (preview builds only). Buttons [data-accent-choice] in preview-logo.html set
 * data-accent on <html>: "crimson" (PBD crimson #E3304F, the site's accent, set by no attribute),
 * "vermilion" (#FF4F1A, the earlier accent), "red" (arcade red, a warm true red of our own) or "deep" (a deep
 * blood red with a white label). site.css overrides the --verm-* tokens for the last three, so the logo tile,
 * primary buttons and other lit accents follow. Remembered in localStorage (pbd-accent; choosing Crimson forgets
 * it, and a remembered value that is no longer offered is dropped); ?accent= applies without saving. Static images
 * (favicon, og.png, the icons) stay PBD crimson.
 */
(function () {
  'use strict';
  var KEY = 'pbd-accent';
  var root = document.documentElement;
  function read() { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) {
    try { if (v === null) window.localStorage.removeItem(KEY); else window.localStorage.setItem(KEY, v); } catch (e) {}
  }
  function valid(v) { return v === 'crimson' || v === 'vermilion' || v === 'red' || v === 'deep' ? v : null; }
  function init() {
    var buttons = document.querySelectorAll('[data-accent-choice]');
    if (!buttons.length) return;
    function apply(choice) {
      if (choice === 'crimson') root.removeAttribute('data-accent');
      else root.setAttribute('data-accent', choice);
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute('aria-pressed', buttons[i].getAttribute('data-accent-choice') === choice ? 'true' : 'false');
      }
    }
    for (var b = 0; b < buttons.length; b++) {
      buttons[b].addEventListener('click', function (ev) {
        var choice = ev.currentTarget.getAttribute('data-accent-choice');
        write(choice === 'crimson' ? null : choice);
        apply(choice);
      });
    }
    var stored = read();
    if (stored !== null && !valid(stored)) write(null);
    var m = /[?&]accent=([a-z0-9]+)/i.exec(window.location.search);
    apply(valid(m && m[1].toLowerCase()) || valid(stored) || 'crimson');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
/* @preview-switcher: end */
