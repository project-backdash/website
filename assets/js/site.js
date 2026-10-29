/*
 * backdash.gg: small enhancements. Every page works without this file.
 *  - Theme control in the footer (Auto / Dark / Light), remembered in localStorage.
 *    ?theme=light, ?theme=dark or ?theme=auto in the address applies a theme without
 *    saving it (handy for screenshots). The inline script in <head> applies the saved
 *    theme before the first paint, so there is no flash.
 *  - Drawer (the menu behind the hamburger, a <details> element that already opens and
 *    closes without JavaScript: the X in its header row and the scrim are its summary):
 *    opening moves focus into the panel, Tab stays inside it, the rest of the page is inert
 *    and does not scroll; Escape closes it and returns focus to the menu button, and
 *    choosing a link closes it.
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

  function initDrawer(drawer) {
    var summary = drawer.querySelector('summary');
    var panel = drawer.querySelector('.drawer-panel');
    if (!summary || !panel) return;
    var madeInert = [];

    // What Tab goes through while the drawer is open: the close button (the summary, drawn in
    // the panel's header row), then the panel's links.
    function focusables() {
      var list = [summary];
      var items = panel.querySelectorAll('a[href], button:not([disabled])');
      for (var i = 0; i < items.length; i++) list.push(items[i]);
      return list;
    }

    // Every focus() here passes preventScroll: the button sits in the sticky bar, inside the
    // page's scroll-padding-top, so a plain focus() scrolled the page (600 px down went to 142).
    function close(returnFocus) {
      if (!drawer.open) return;
      drawer.open = false;
      if (returnFocus) summary.focus({ preventScroll: true });
    }

    // Everything the scrim covers: the page's other top-level parts and the app bar's own lockup
    // and button. inert keeps them out of the Tab order and out of reach of screen readers
    // until the drawer closes. Only what this code made inert is released again.
    function setOutsideInert(on) {
      var i;
      if (!on) {
        for (i = 0; i < madeInert.length; i++) madeInert[i].removeAttribute('inert');
        madeInert = [];
        return;
      }
      var groups = [document.body.children, drawer.parentNode.children];
      for (var g = 0; g < groups.length; g++) {
        for (i = 0; i < groups[g].length; i++) {
          var el = groups[g][i];
          if (el === drawer || el.contains(drawer) || el.hasAttribute('inert') || /^(SCRIPT|TEMPLATE|STYLE|LINK)$/.test(el.tagName)) continue;
          el.setAttribute('inert', '');
          madeInert.push(el);
        }
      }
    }

    // The page under the scrim does not scroll. Hiding the scrollbar would widen the page, so the
    // body is padded by the scrollbar's width meanwhile (site.css, .drawer-locked).
    function lockScroll(on) {
      if (on) {
        var gutter = window.innerWidth - root.clientWidth;
        root.style.setProperty('--drawer-gutter', (gutter > 0 ? gutter : 0) + 'px');
        root.classList.add('drawer-locked');
      } else {
        root.classList.remove('drawer-locked');
        root.style.removeProperty('--drawer-gutter');
      }
    }

    function onKeydown(event) {
      if (!drawer.open) return;
      if (event.key === 'Escape' || event.key === 'Esc') {
        event.preventDefault();
        close(true);
        return;
      }
      if (event.key !== 'Tab') return;
      var items = focusables();
      var first = items[0];
      var last = items[items.length - 1];
      var active = document.activeElement;
      if (items.indexOf(active) === -1) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    drawer.addEventListener('toggle', function () {
      if (drawer.open) {
        lockScroll(true);
        setOutsideInert(true);
        document.addEventListener('keydown', onKeydown);
        // Focus moves into the panel: to the page you are on, else the first page in the list.
        // (After a click the link gets no focus ring; after Enter or Space it does.)
        var target = panel.querySelector('.drawer-nav a[aria-current="page"]') || panel.querySelector('.drawer-nav a[href]');
        if (target) target.focus({ preventScroll: true });
      } else {
        document.removeEventListener('keydown', onKeydown);
        setOutsideInert(false);
        lockScroll(false);
        // Back to the menu button, unless focus has already gone somewhere outside the drawer.
        var active = document.activeElement;
        if (!active || active === document.body || drawer.contains(active)) summary.focus({ preventScroll: true });
      }
    });

    // Choosing a link closes the drawer (a Ctrl, Shift or middle click opens a new tab or window,
    // so the drawer stays open for the next one).
    panel.addEventListener('click', function (event) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.button > 0) return;
      var link = event.target.closest ? event.target.closest('a[href]') : null;
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
