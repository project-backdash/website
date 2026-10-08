/*
 * backdash.gg home: the animated hero (the hero-stick partial). The page works without this file.
 *
 * A top-down lever panel (a Japanese ball-top lever, drawn without its gate, and the four buttons nearest to
 * it, 1 2 over 3 4) plays the dash-cancel rhythm: back, neutral, back, down-back. Seen from directly above, the
 * ball hides the shaft in neutral; pushed, the ball moves off centre, a short piece of the shaft shows between
 * the mounting hole and the ball, and the dust washer at its base stays put on the panel. The
 * input log under the panel shows each input as the game reads it, as a PBD block arrow
 * (docs/brand/assets/explore/block-arrows/), newest at the right and lit in the lighter rose of the
 * launcher's lever palette (pages/home.css; never crimson: the logo's down-back is the page's one
 * crimson mark). No frame counts.
 *
 * The timing is not in this file: data-stick on .hero-stick holds it (idle, lead_in, loop and rest_on, in
 * frames at 60 fps; the same values as docs/brand/assets/explore/animated-stick/timing-v2/timeline-site.json).
 * The loop is a clean but human dash cancel: back 12 (the dash back), down-back 3 (the cancel), back 2,
 * neutral 3. The short back is real: on the way from down-back to neutral the down switch opens first, so
 * the game reads back for a moment, and the game's own input history shows it. Every position is held for
 * at least 2 frames because one-frame positions read as flicker on screen. The partial says how to change it.
 *
 * Behaviour
 *  - Starts when at least half of the drawing is on screen: the idle, the one-time lead-in (back, neutral,
 *    back), then the loop, over and over, for as long as it is on screen.
 *  - The Pause / Play button under the drawing stops it once the movement in progress has settled, and
 *    restarts it from there (WCAG 2.2.2: the motion runs longer than 5 s, so it can be paused).
 *  - Pauses by itself when the drawing is fully off screen or the tab is hidden, and goes on from the same
 *    frame when it is back (unless the visitor paused it).
 *  - Reduced motion: the rest pose (the lever on down-back, the log ending in the lit down-back) and no
 *    clock; the button says Play, and plays on request.
 *  - No script: the static SVG in the partial is that rest pose, and the button stays hidden.
 *
 * Motion: the inputs are digital, but the lever moves as a hand moves it. Every input change starts a
 * critically damped spring step toward the new direction (it leaves and arrives at rest and never
 * overshoots), and a quick back, down-back, back flick blends into one curve. The input log scrolls the same
 * way, and its newest arrow fades in where it lands.
 *
 * Clock: requestAnimationFrame timestamps, never a count of callbacks, give the time in frames (fractions
 * included), and a pose is a pure function of that time, so the motion is the same on 60, 120 or 144 Hz
 * screens and stays in time on a slow one. Frames are drawn only while something moves: a held input waits
 * for the next change without a clock.
 */
(function () {
  'use strict';

  var root = document.querySelector('.hero-stick');
  if (!root) return;
  var svg = root.querySelector('svg.stick');
  var btn = root.querySelector('.stick-toggle');
  var btnLabel = btn && btn.querySelector('.stick-toggle-label');
  if (!svg) return;

  var NS = svg.namespaceURI;  // the SVG namespace, taken from the page's own <svg>

  var VEC = { n: [0, 0], b: [-1, 0], f: [1, 0], u: [0, -1], d: [0, 1], db: [-1, 1], df: [1, 1], ub: [-1, -1], uf: [1, -1] };

  // The PBD block arrows, solid, in their 24-unit box (explore/block-arrows/arrows/*-solid.svg; site_sync.py
  // there writes this table). Square tails. Every diagonal is the straight arrow turned 45 degrees and scaled
  // x 1.12, its tail ending on the box's edges: one arrow, four ways.
  var BLOCK = {
    l: 'M0 12L12 0L13 0L13 8L24 8L24 16L13 16L13 24L12 24Z',
    u: 'M12 0L24 12L24 13L16 13L16 24L8 24L8 13L0 13L0 12Z',
    r: 'M24 12L12 24L11 24L11 16L0 16L0 8L11 8L11 0L12 0Z',
    d: 'M12 24L0 12L0 11L8 11L8 0L16 0L16 11L24 11L24 12Z',
    ul: 'M2 2L21 2L21.7917 2.7917L15.4583 9.125L24 17.6667L17.6667 24L9.125 15.4583L2.7917 21.7917L2 21Z',
    ur: 'M22 2L22 21L21.2083 21.7917L14.875 15.4583L6.3333 24L0 17.6667L8.5417 9.125L2.2083 2.7917L3 2Z',
    dr: 'M22 22L3 22L2.2083 21.2083L8.5417 14.875L0 6.3333L6.3333 0L14.875 8.5417L21.2083 2.2083L22 3Z',
    dl: 'M2 22L2 3L2.7917 2.2083L9.125 8.5417L17.6667 0L24 6.3333L15.4583 14.875L21.7917 21.2083L21 22Z',
    n: 'M8 9L10 8L15 8L16 8.5L16 15L14 16L9 16L8 15.5Z'
  };

  // Geometry in millimetres, seen from directly above (x right, y down; button 1 at the origin).
  // buttons: the four nearest the lever in the Japanese 8-button stagger (1 2 on the top row, 3 4 on the
  //   bottom row), 30 mm discs drawn as rings.
  // lever: x, y = the mounting hole (the lever's centre); r = the ball (32 mm, a little larger than the
  //   buttons); d = the straight throw of the ball (a diagonal goes to the square gate's corner: d on each
  //   axis, so sqrt(2) d in distance; the gate itself is not drawn); w = the line width of
  //   the washer's ring; washer = the dust washer's radius (a flat disc a little larger
  //   than the hole, drawn as a ring like the buttons, hidden under the ball in neutral and fixed on the panel
  //   when the lever moves); shaft = the shaft's width, drawn as a rounded bar from the mounting hole to
  //   the ball's centre; cut = the thin gap in the ground colour that sets the ball off the shaft and the
  //   washer (a flat drawing has one colour for all of them). With d - r = 5 mm a short piece of the shaft
  //   shows on a straight push and more of it on a diagonal. The lever sits 72 mm left of button 1 (Sega
  //   Astro City's panel has 66 mm; the extra 6 mm make the drawing span the viewBox evenly: the ball at full
  //   throw 4 mm in from the left edge, button 2's ring 1.4 mm in from the right).
  // log: y = the arrows' centre line, A = the arrow box, right = the newest box's right edge (the right edge
  //   of button 2's ring), pitch = box to box; older entries fade out between fade1 and fade0 (their box's
  //   left edge), so nothing crosses the viewBox's left edge.
  var G = {
    vb: [-113, -31, 163, 120],
    lever: { x: -72, y: 24.5, r: 16, d: 21, w: 1.2, washer: 11.5, shaft: 6.5, cut: 1.2 },
    buttons: [[0, 0], [33, -14], [-7, 37], [26, 24]],
    btnR: 15,
    btnW: 1.2,
    log: { y: 82, A: 12, right: 48, pitch: 18, fade0: -111, fade1: -93 }
  };

  // Motion. The inputs are digital, but the lever is drawn as a hand moves it: every input change starts a critically
  // damped spring step toward the new direction (it leaves and arrives at rest, and never overshoots), and the lever's
  // place is the sum of the steps of the recent changes, so a quick back, down-back, back flick blends into one curve. The
  // input log scrolls the same way; its newest arrow fades in where it lands once the one before has made room. A pose is
  // a pure function of the time in frames (fractions included), so any display rate draws the same motion, and a held
  // input draws nothing.
  var LEVER_RATE = 1.1;  // per frame: 84 % of a throw after 3 frames (50 ms)
  var LOG_RATE = 1;
  function spring(rate, tau) {
    return tau <= 0 ? 0 : 1 - (1 + rate * tau) * Math.exp(-rate * tau);
  }
  function settleFrames(rate) {  // within 0.2 % of the end: nothing moves on screen any more
    var tau = 0;
    while (spring(rate, tau) < 0.998) tau += 0.25;
    return tau;
  }
  var LEVER_SETTLE = settleFrames(LEVER_RATE);
  var SETTLE = Math.max(LEVER_SETTLE, settleFrames(LOG_RATE));
  var ENTER_SIZE = 0.7;  // the newest arrow grows from 70 % as it fades in
  var ENTER_AFTER = 0.55; // and shows once the log has moved 55 % of a pitch, clear of the arrow before it

  var TL, MIRROR, FRAME_MS, PRE, LOOP, REST, HISTORY, LINE, LIT, inst;

  function r3(v) {
    var x = Math.round(v * 1000) / 1000;
    return x === 0 ? 0 : x;  // no "-0"
  }

  function vec(k) {
    var v = VEC[k];
    if (!v) throw new Error('unknown input ' + k);
    return [v[0] * MIRROR, v[1]];
  }

  function screenDir(k) {
    var v = vec(k);
    return ((v[1] < 0 ? 'u' : v[1] > 0 ? 'd' : '') + (v[0] < 0 ? 'l' : v[0] > 0 ? 'r' : '')) || 'n';
  }

  /* ---- the timeline: one input per frame. PRE = the idle and the lead-in, played once; LOOP repeats ---- */
  function frames(segs) {
    var out = [];
    segs.forEach(function (s) {
      vec(s.input);
      if (!(s.frames > 0) || Math.floor(s.frames) !== s.frames) throw new Error('bad frame count');
      for (var i = 0; i < s.frames; i++) out.push(s.input);
    });
    return out;
  }

  function inputAt(g) {
    return g < PRE.length ? PRE[g] : LOOP[(g - PRE.length) % LOOP.length];
  }

  // The inputs up to frame f as the log shows them, newest first: same inputs next to each other are one
  // entry (the loop's closing and opening neutrals too). Each entry: { k: input, start: frame }.
  function history(f, n) {
    var out = [], g = f;
    while (out.length < n) {
      var k = inputAt(g), s = g;
      while (s > 0 && inputAt(s - 1) === k) s--;
      out.push({ k: k, start: s });
      if (s === 0) break;
      g = s - 1;
    }
    return out;
  }

  function nextChange(f) {
    var k = inputAt(f), g = f + 1, end = f + PRE.length + LOOP.length + 1;
    while (g < end && inputAt(g) === k) g++;
    return g;
  }

  // The rest pose: the first frame after an input change to rest_on (down-back) in the steady loop, far
  // enough in that every entry the log shows comes from the loop.
  function restFrame() {
    var want = TL.rest_on || 'db', T = LOOP.length, i;
    var cycles = Math.ceil(inst.slots.length / 2) + 1;
    for (i = 0; i < T; i++) {
      var g = PRE.length + cycles * T + i;
      if (inputAt(g) === want && inputAt(g - 1) !== want) return inputAt(g + 1) === want ? g + 1 : g;
    }
    throw new Error('rest_on is not in the loop');
  }

  /* ---- the pose at time t (in frames): what render draws. `settled` puts every motion at its end ---- */
  function pose(t, settled) {
    var lv = G.lever, lg = G.log;
    var h = history(Math.max(0, Math.floor(t)), HISTORY);
    function step(rate, start) { return settled ? 1 : spring(rate, t - start); }
    // The newest change that has settled gives the base; the later ones add their steps.
    var j = 0, i;
    while (!settled && j < h.length - 1 && t - h[j].start < LEVER_SETTLE) j++;
    var v = vec(h[j].k), x = v[0], y = v[1];
    for (i = j - 1; i >= 0; i--) {
      var a = vec(h[i].k), b = vec(h[i + 1].k), e = step(LEVER_RATE, h[i].start);
      x += (a[0] - b[0]) * e;
      y += (a[1] - b[1]) * e;
    }
    var out = {
      ball: [lv.x + x * lv.d, lv.y + y * lv.d],
      log: []
    };
    // Entry i stands where the newer entries' arrivals have pushed it, one pitch each.
    var push = 0, newest = step(LOG_RATE, h[0].start);
    for (i = 0; i < inst.slots.length && i < h.length; i++) {
      var arrive = i === 0 ? newest : step(LOG_RATE, h[i].start);
      var lx = lg.right - lg.A - push * lg.pitch;
      var visible = Math.max(0, (arrive - ENTER_AFTER) / (1 - ENTER_AFTER));
      push += arrive;
      out.log.push({
        k: h[i].k,
        x: lx,
        alpha: visible * Math.min(1, Math.max(0, (lx - lg.fade0) / (lg.fade1 - lg.fade0))),
        size: ENTER_SIZE + (1 - ENTER_SIZE) * arrive,
        lit: i === 0 ? 1 : i === 1 ? 1 - newest : 0  // the lit colour passes to the arrow arriving
      });
    }
    return out;
  }

  /* ---- the drawing: rebuilt from the geometry (the partial's static copy is only the no-script pose) ---- */
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  }

  // Writes only what changed, so a held pose costs no style or paint work.
  function put(node, name, value) {
    var seen = node.pbdSet || (node.pbdSet = {});
    if (seen[name] === value) return;
    seen[name] = value;
    if (name === 'color') node.style.color = value;
    else if (value === null) node.removeAttribute(name);
    else node.setAttribute(name, value);
  }

  function colour(value) {
    var m = /^#([0-9a-f]{6})$/i.exec(String(value || '').trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }

  function mix(u) {
    return 'rgb(' + [0, 1, 2].map(function (c) { return Math.round(LINE[c] + (LIT[c] - LINE[c]) * u); }).join(', ') + ')';
  }

  function mount() {
    var lv = G.lever, lg = G.log;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', G.vb.join(' '));
    G.buttons.forEach(function (b) {
      el('circle', { 'class': 'stick-ring', cx: b[0], cy: b[1], r: G.btnR, 'stroke-width': G.btnW }, svg);
    });
    // The lever from the panel up: the dust washer, the shaft (with its cut), the ball's cut, the ball. The shaft runs from
    // the mounting hole to the ball's centre, under the ball (in neutral the ball hides it).
    el('circle', { 'class': 'stick-washer', cx: lv.x, cy: lv.y, r: lv.washer, 'stroke-width': lv.w }, svg);
    var shaftCut = el('line', { 'class': 'stick-cut', x1: lv.x, y1: lv.y, x2: lv.x, y2: lv.y, 'stroke-width': lv.shaft + 2 * lv.cut }, svg);
    var shaft = el('line', { 'class': 'stick-shaft', x1: lv.x, y1: lv.y, x2: lv.x, y2: lv.y, 'stroke-width': lv.shaft }, svg);
    var ballCut = el('circle', { 'class': 'stick-cut', cx: lv.x, cy: lv.y, r: lv.r + lv.cut }, svg);
    var ball = el('circle', { 'class': 'stick-ball', cx: lv.x, cy: lv.y, r: lv.r }, svg);
    var log = el('g', { 'class': 'stick-log' }, svg);
    var slots = [];
    var n = Math.ceil((lg.right - lg.A - lg.fade0) / lg.pitch) + 2;
    for (var i = 0; i < n; i++) {
      var g = el('g', { 'class': 'stick-slot', display: 'none' }, log);
      slots.push({ g: g, path: el('path', { 'class': 'stick-block' }, g) });
    }
    return { shaftCut: shaftCut, shaft: shaft, ballCut: ballCut, ball: ball, slots: slots };
  }

  function render(t, settled) {
    var lg = G.log, p = pose(t, settled), bx = r3(p.ball[0]), by = r3(p.ball[1]);
    put(inst.ball, 'cx', bx); put(inst.ball, 'cy', by);
    put(inst.ballCut, 'cx', bx); put(inst.ballCut, 'cy', by);
    [inst.shaftCut, inst.shaft].forEach(function (ln) { put(ln, 'x2', bx); put(ln, 'y2', by); });
    inst.slots.forEach(function (sl, i) {
      var en = p.log[i];
      if (!en || en.alpha < 0.002) { put(sl.g, 'display', 'none'); return; }
      var s = en.size * lg.A, x = en.x + (lg.A - s) / 2, y = lg.y - s / 2;
      put(sl.g, 'display', null);
      put(sl.g, 'transform', 'translate(' + r3(x) + ' ' + r3(y) + ') scale(' + r3(s / 24) + ')');
      put(sl.g, 'opacity', r3(en.alpha));
      put(sl.g, 'class', i === 0 ? 'stick-slot is-now' : 'stick-slot');
      if (LINE && LIT) put(sl.g, 'color', mix(Math.round(en.lit * 100) / 100));
      put(sl.path, 'd', BLOCK[screenDir(en.k)]);
    });
  }

  try {
    TL = JSON.parse(root.getAttribute('data-stick'));
    MIRROR = TL.back_is === 'right' ? -1 : 1;
    FRAME_MS = 1000 / TL.fps;
    PRE = frames([TL.idle].concat(TL.lead_in));
    LOOP = frames(TL.loop);
    if (LOOP.every(function (k) { return k === LOOP[0]; })) throw new Error('the loop needs two inputs');
    inst = mount();
    HISTORY = inst.slots.length + 2;
    REST = restFrame();
    var style = window.getComputedStyle ? window.getComputedStyle(svg) : null;
    LINE = style && colour(style.getPropertyValue('--stick-line'));
    LIT = style && colour(style.getPropertyValue('--stick-lit'));
  } catch (err) {
    return;  // bad data: keep the static rest pose, and no button
  }

  /* ---- player ---- */
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  // ready (not started yet), playing, waiting (off screen or tab hidden: goes on by itself),
  // paused (the visitor paused it), rest (reduced motion: the rest pose, not started)
  var state = 'ready';
  var raf = 0, timer = 0, t0 = null, base = 0, shown = 0;
  var stopAt = null;                                  // a pause's still frame, while the motion before it plays out
  var inView = !('IntersectionObserver' in window);  // any part on screen
  var seen = inView;                                  // at least half on screen once (starts the first play)

  function setState(s) {
    state = s;
    root.setAttribute('data-state', s);
    if (btnLabel) btnLabel.textContent = s === 'paused' || s === 'rest' ? 'Play' : 'Pause';
  }

  function draw(t, settled) {
    render(t, settled);
    shown = t;
  }

  function stopClock() {
    if (raf) cancelAnimationFrame(raf);
    if (timer) clearTimeout(timer);
    raf = 0;
    timer = 0;
    t0 = null;
  }

  function canRun() {
    return inView && !document.hidden;
  }

  // Animation frames only while something moves; once the newest change has settled the clock sleeps until the next one.
  function tick(ts) {
    raf = 0;
    if (!canRun()) { hold('waiting'); return; }
    if (t0 === null) t0 = ts;
    var t = base + (ts - t0) / FRAME_MS;
    if (stopAt !== null && t >= stopAt) { finishPause(); return; }
    draw(t);
    var f = Math.floor(t), wait = (nextChange(f) - t) * FRAME_MS;
    if (stopAt === null && t - history(f, 1)[0].start >= SETTLE && wait > 2 * FRAME_MS) {
      timer = setTimeout(function () { timer = 0; raf = requestAnimationFrame(tick); }, wait - FRAME_MS);
    } else raf = requestAnimationFrame(tick);
  }

  function run(from) {                                 // go on from `from`, now or as soon as it can
    stopClock();
    stopAt = null;
    base = from;
    draw(from);
    if (canRun()) {
      setState('playing');
      raf = requestAnimationFrame(tick);
    } else setState('waiting');
  }

  function finishPause() {
    stopClock();
    draw(stopAt, true);
    base = stopAt;
    stopAt = null;
    setState('paused');
  }

  function hold(s) {                                   // stop on the pose that is showing
    if (stopAt !== null) { finishPause(); return; }   // a pause on its way ends on its still frame
    stopClock();
    base = shown;
    setState(s);
  }

  // A visitor's pause never freezes a pose in motion: the motion plays out to the next frame where nothing moves.
  function stillFrom(t) {
    var f = Math.floor(t);
    if (t - history(f, 1)[0].start >= SETTLE) return t;
    for (var g = Math.ceil(t), end = g + PRE.length + 2 * LOOP.length; g < end; g++) {
      if (g - history(g, 1)[0].start >= SETTLE) return g;
    }
    return Math.ceil(t);
  }

  function pause() {
    stopAt = stillFrom(shown);
    if (raf || timer) setState('paused');             // the clock runs on to stopAt (tick)
    else finishPause();
  }

  function update() {
    if (state === 'ready') {
      if (seen && canRun() && !reduce.matches) run(0);
    } else if (state === 'playing' || (state === 'paused' && stopAt !== null)) {
      if (!canRun()) hold('waiting');
    } else if (state === 'waiting') {
      if (reduce.matches) toRest();                    // reduced motion was asked for while it waited (its event may come later)
      else if (canRun()) run(base);
    }
  }

  function toRest() {
    stopClock();
    stopAt = null;
    draw(REST, true);
    base = REST;
    setState('rest');
  }

  if (reduce.matches) toRest();
  else {
    draw(0);                                           // the idle pose the play starts from
    setState('ready');
  }

  if (reduce.addEventListener) {
    reduce.addEventListener('change', function () {
      if (reduce.matches) {
        if (state !== 'paused' && state !== 'rest') toRest();
      } else if (state === 'rest') {
        run(REST);                                     // motion allowed again: go on from the rest pose
      }
    });
  }

  if (btn) {
    btn.addEventListener('click', function () {
      if (state === 'paused' && stopAt !== null) {    // pressed again before the motion settled: it just goes on
        stopAt = null;
        setState('playing');
      } else if (state === 'paused' || state === 'rest') run(base);  // the visitor pressed Play, so it plays even with reduced motion
      else pause();
    });
    btn.hidden = false;
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      var en = entries[entries.length - 1];
      inView = en.isIntersecting;
      if (en.intersectionRatio >= 0.5) seen = true;
      update();
    }, { threshold: [0, 0.5] }).observe(svg);
  }

  document.addEventListener('visibilitychange', update);
  update();
})();
