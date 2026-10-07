/*
 * backdash.gg home: the animated hero (the hero-stick partial). The page works without this file.
 *
 * A top-down lever panel (a Japanese ball-top lever, drawn without its gate, and the four buttons nearest to
 * it, 1 2 over 3 4) plays the dash-cancel rhythm: back, neutral, back, down-back. Seen from directly above, the
 * ball hides the shaft in neutral; pushed, the ball moves off centre, a short piece of the shaft shows between
 * the mounting hole and the ball, and the dust washer at its base slides a fifth of the ball's travel. The
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
 *  - The Pause / Play button under the drawing stops and restarts it on the frame that is showing
 *    (WCAG 2.2.2: the motion runs longer than 5 s, so it can be paused).
 *  - Pauses by itself when the drawing is fully off screen or the tab is hidden, and goes on from the same
 *    frame when it is back (unless the visitor paused it).
 *  - Reduced motion: the rest pose (the lever on down-back, the log ending in the lit down-back) and no
 *    clock; the button says Play, and plays on request.
 *  - No script: the static SVG in the partial is that rest pose, and the button stays hidden.
 *
 * Clock: requestAnimationFrame, frame = start frame + round(elapsed / 16.667 ms). The frame number comes
 * from the timestamps, never from counting callbacks, so the timing is right on 60, 120 or 144 Hz screens
 * and stays in time on a slow one. A frame is a pure function of its number, and the drawing changes only
 * when the number changes.
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
  var SMEAR_ALPHA = 0.16;  // the one-frame smear drawn on the frame an input changes
  var SHIFT0 = 0.6;        // share of the one-entry log shift done on the frame a new input appears (the rest on the next)

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
  //   than the hole, drawn as a ring like the buttons, hidden under the ball in neutral), slide = its travel
  //   as a share of the ball's; shaft = the shaft's width, drawn as a rounded bar from the mounting hole to
  //   the ball's centre; cut = the thin gap in the ground colour that sets the ball off the shaft and the
  //   washer (a flat drawing has one colour for all of them). With d - r = 5 mm a short piece of the shaft
  //   shows on a straight push and more of it on a diagonal. The lever sits 72 mm left of button 1 (Sega
  //   Astro City's panel has 66 mm; the extra 6 mm make the drawing span the viewBox evenly: the ball at full
  //   throw 4 mm in from the left edge, button 2's ring 1.4 mm in from the right).
  // log: y = the arrows' centre line, A = the arrow box, right = the newest box's right edge (the right edge
  //   of button 2's ring), pitch = box to box; older entries fade out between fade1 and fade0 (their box's
  //   left edge), so nothing crosses the viewBox's left edge, even mid-shift.
  var G = {
    vb: [-113, -31, 163, 120],
    lever: { x: -72, y: 24.5, r: 16, d: 21, w: 1.2, washer: 11.5, slide: 0.2, shaft: 6.5, cut: 1.2 },
    buttons: [[0, 0], [33, -14], [-7, 37], [26, 24]],
    btnR: 15,
    btnW: 1.2,
    log: { y: 82, A: 12, right: 48, pitch: 18, fade0: -111, fade1: -93 }
  };

  var TL, MIRROR, FRAME_MS, PRE, LOOP, REST, inst;

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

  /* ---- the drawing: rebuilt from the geometry (the partial's static copy is only the no-script pose) ---- */
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  }

  // Hidden parts use display, not visibility: a child with visibility=visible would show through a hidden parent.
  function show(node, on) {
    if (on) node.removeAttribute('display'); else node.setAttribute('display', 'none');
  }

  function mount() {
    var lv = G.lever, lg = G.log;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', G.vb.join(' '));
    G.buttons.forEach(function (b) {
      el('circle', { 'class': 'stick-ring', cx: b[0], cy: b[1], r: G.btnR, 'stroke-width': G.btnW }, svg);
    });
    // The lever from the panel up: the dust washer, the shaft (with its cut), the ball's cut, the ball's
    // one-frame smear (over the cut, so the blur has no dark rim), the ball. The shaft runs from the mounting
    // hole to the ball's centre, under the ball.
    var washer = el('circle', { 'class': 'stick-washer', cx: lv.x, cy: lv.y, r: lv.washer, 'stroke-width': lv.w }, svg);
    var shaftCut = el('line', { 'class': 'stick-cut', x1: lv.x, y1: lv.y, 'stroke-width': lv.shaft + 2 * lv.cut, display: 'none' }, svg);
    var shaft = el('line', { 'class': 'stick-shaft', x1: lv.x, y1: lv.y, 'stroke-width': lv.shaft, display: 'none' }, svg);
    var ballCut = el('circle', { 'class': 'stick-cut', cx: lv.x, cy: lv.y, r: lv.r + lv.cut }, svg);
    var smear = el('line', { 'class': 'stick-smear', 'stroke-width': 2 * lv.r, 'stroke-opacity': SMEAR_ALPHA, display: 'none' }, svg);
    var ball = el('circle', { 'class': 'stick-ball', cx: lv.x, cy: lv.y, r: lv.r }, svg);
    var log = el('g', { 'class': 'stick-log' }, svg);
    var slots = [];
    var n = Math.ceil((lg.right - lg.A - lg.fade0) / lg.pitch) + 2;
    for (var i = 0; i < n; i++) {
      var g = el('g', { 'class': 'stick-slot', display: 'none' }, log);
      slots.push({ g: g, path: el('path', { 'class': 'stick-block' }, g), key: null });
    }
    return { washer: washer, shaftCut: shaftCut, shaft: shaft, smear: smear, ballCut: ballCut, ball: ball, slots: slots, last: -1 };
  }

  /* ---- one frame is a pure function of its number ---- */
  function render(f) {
    var lv = G.lever, lg = G.log;
    var h = history(f, inst.slots.length + 1), cur = h[0], prev = h[1];
    var s = f - cur.start;
    function pos(k, t) { var v = vec(k); return [lv.x + v[0] * lv.d * t, lv.y + v[1] * lv.d * t]; }
    var b = pos(cur.k, 1), w = pos(cur.k, lv.slide), off = cur.k !== 'n';
    inst.ball.setAttribute('cx', r3(b[0]));
    inst.ball.setAttribute('cy', r3(b[1]));
    inst.ballCut.setAttribute('cx', r3(b[0]));
    inst.ballCut.setAttribute('cy', r3(b[1]));
    inst.washer.setAttribute('cx', r3(w[0]));
    inst.washer.setAttribute('cy', r3(w[1]));
    [inst.shaftCut, inst.shaft].forEach(function (ln) {  // in neutral the shaft is straight up, under the ball
      if (off) {
        ln.setAttribute('x2', r3(b[0]));
        ln.setAttribute('y2', r3(b[1]));
      }
      show(ln, off);
    });
    if (s === 0 && prev) {                              // the lever is digital: no in-between, one smear frame
      var p = pos(prev.k, 1);
      inst.smear.setAttribute('x1', r3(p[0])); inst.smear.setAttribute('y1', r3(p[1]));
      inst.smear.setAttribute('x2', r3(b[0])); inst.smear.setAttribute('y2', r3(b[1]));
      show(inst.smear, true);
    } else show(inst.smear, false);
    var e = s === 0 && prev ? SHIFT0 : 1;
    var xNow = lg.right - lg.A;
    inst.slots.forEach(function (sl, i) {
      var en = h[i];
      var x = xNow - (i - 1 + e) * lg.pitch;           // the log moves as one piece; the new entry comes in from the right
      var a = Math.min(1, Math.max(0, (x - lg.fade0) / (lg.fade1 - lg.fade0)));
      if (!en || a <= 0) { show(sl.g, false); return; }
      show(sl.g, true);
      sl.g.setAttribute('transform', 'translate(' + r3(x) + ' ' + r3(lg.y - lg.A / 2) + ') scale(' + r3(lg.A / 24) + ')');
      sl.g.setAttribute('opacity', r3(a));
      sl.g.setAttribute('class', i === 0 ? 'stick-slot is-now' : 'stick-slot');
      if (sl.key !== en.k) {
        sl.path.setAttribute('d', BLOCK[screenDir(en.k)]);
        sl.key = en.k;
      }
    });
    inst.last = f;
  }

  try {
    TL = JSON.parse(root.getAttribute('data-stick'));
    MIRROR = TL.back_is === 'right' ? -1 : 1;
    FRAME_MS = 1000 / TL.fps;
    PRE = frames([TL.idle].concat(TL.lead_in));
    LOOP = frames(TL.loop);
    if (LOOP.every(function (k) { return k === LOOP[0]; })) throw new Error('the loop needs two inputs');
    inst = mount();
    REST = restFrame();
  } catch (err) {
    return;  // bad data: keep the static rest pose, and no button
  }

  /* ---- player ---- */
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  // ready (not started yet), playing, waiting (off screen or tab hidden: goes on by itself),
  // paused (the visitor paused it), rest (reduced motion: the rest pose, not started)
  var state = 'ready';
  var raf = 0, t0 = null, base = 0;
  var inView = !('IntersectionObserver' in window);  // any part on screen
  var seen = inView;                                  // at least half on screen once (starts the first play)

  function setState(s) {
    state = s;
    root.setAttribute('data-state', s);
    if (btnLabel) btnLabel.textContent = s === 'paused' || s === 'rest' ? 'Play' : 'Pause';
  }

  function stopClock() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    t0 = null;
  }

  function tick(ts) {
    raf = 0;
    if (t0 === null) t0 = ts;
    var f = base + Math.round((ts - t0) / FRAME_MS);
    if (f !== inst.last) render(f);
    raf = requestAnimationFrame(tick);
  }

  function canRun() {
    return inView && !document.hidden;
  }

  function run(from) {                                 // go on from frame `from`, now or as soon as it can
    stopClock();
    base = from;
    if (inst.last !== from) render(from);
    if (canRun()) {
      setState('playing');
      raf = requestAnimationFrame(tick);
    } else setState('waiting');
  }

  function hold(s) {                                   // stop on the frame that is showing
    stopClock();
    var f = Math.max(0, inst.last);
    if (s === 'paused') {                              // a visitor's pause never freezes the in-between frame
      var h = history(f, 2);                           // (the smear and the half-done shift): take the next one
      if (f === h[0].start && h[1]) render(++f);
    }
    base = f;
    setState(s);
  }

  function update() {
    if (state === 'ready') {
      if (seen && !document.hidden && !reduce.matches) run(0);
    } else if (state === 'playing') {
      if (!canRun()) hold('waiting');
    } else if (state === 'waiting') {
      if (canRun()) run(base);
    }
  }

  function toRest() {
    stopClock();
    render(REST);
    base = REST;
    setState('rest');
  }

  if (reduce.matches) toRest();
  else {
    render(0);                                         // the idle pose the play starts from
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
      if (state === 'paused' || state === 'rest') run(base);   // the visitor pressed Play, so it plays even with reduced motion
      else hold('paused');
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
