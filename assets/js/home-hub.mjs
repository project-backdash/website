// <!-- check-allow: ranked -->
// Home: the live numbers beside the download (the games of the last 24 hours, one square per recent Ranked set, and
// the headline counts: players, online now, lobbies open, Ranked games, searching / playing now), then the top ten,
// the latest sets and the characters, all from the public stats service. A count the service does not send (yet)
// reads "–", never 0. A part whose answer does not come keeps its place, says so and tries again. The bar's DOWNLOAD
// stays a quiet arrow while the big one is on screen, so a screen never shows two DOWNLOADs.
import { characterName, playerPath, setPath, fetchRanked } from '/assets/js/ranked-data.mjs?v=dde3981e98';
import {
  el,
  fmt,
  pct,
  signed,
  ago,
  face,
  keys,
  plate,
  record,
  regionCode,
  seasonLabel,
} from '/assets/js/ranked-kit.mjs?v=00fa912a59';
import { nameInto, fitNames } from '/assets/js/player-name.mjs?v=f4f589f1dc';

const root = document.querySelector('[data-hub]');
const base = root.dataset.rankedApi;
const DAY = 86400000;
const HOUR = 3600000;
// The big number is the service's count of games in the last 24 hours, every mode. Until a service sends it, the
// grid's own count of Ranked sets takes its place, read in at most six requests (300 sets; past that it says
// "300+"); with it, the grid draws the day's latest 100 sets at most, in two requests.
const PAGES = 6;
const PAGES_DRAWN = 2;
const PAGE = 50;
// Latest sets lists ten, as tall as the top ten beside it (phones show five).
const FEED = 10;
const q = (selector) => root.querySelector(selector);

// ---- The bar's DOWNLOAD: the same link as the big one, crimson once the big one has scrolled away under the bar.
const big = q('.hub-pitch .dl-button');
// A phone or tablet cannot run the Windows installer, so there both buttons open the download page (what a PC needs)
// rather than starting a download of the whole installer over mobile data. iPadOS says it is a Mac; a Mac with a
// touch screen is an iPad.
const browser = navigator.userAgent;
const handheld =
  /Android|iPhone|iPad|iPod/i.test(browser) || (/Macintosh/.test(browser) && navigator.maxTouchPoints > 1);
if (big && handheld) big.href = '/download/';
const barButton = document.querySelector('[data-bar-download]');
if (big && barButton) barButton.href = big.href;
if (big && barButton && 'IntersectionObserver' in window) {
  const bar = document.querySelector('.app-bar');
  new IntersectionObserver(([entry]) => barButton.classList.toggle('is-quiet', entry.isIntersecting), {
    rootMargin: `-${bar ? bar.offsetHeight : 56}px 0px 0px 0px`,
  }).observe(big);
} else barButton?.classList.remove('is-quiet');

// ---- Small parts ----
function message(list, text) {
  list.replaceChildren(el('li', 'hub-msg', text));
}
const set = (key, text) => {
  for (const node of root.querySelectorAll(`[data-n="${key}"]`)) node.textContent = text;
};

// A count as the service sends it, or null when it is missing, null or not a count.
const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);

// ---- Site totals (/v1/public/stats): players, Ranked games and the games of the last 24 hours ----
// The service recomputes them every five minutes, and a read its edge has not kept takes it about ten seconds, so
// this read waits longer than the others and nothing on screen waits for it. A failed read keeps the last numbers.
let totals = null;
let totalsDone = false;
let totalsTried;
const totalsFirst = new Promise((done) => (totalsTried = done));
async function drawTotals() {
  try {
    const response = await fetch(new URL('/v1/public/stats', base), {
      credentials: 'omit',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw Object.assign(new Error('totals'), { status: response.status });
    const data = await response.json();
    if (data?.totals && typeof data.totals === 'object') totals = data.totals;
  } finally {
    totalsDone = true;
    totalsTried();
    set('players', fmt(count(totals?.accounts)));
    set('ranked', fmt(count(totals?.rankedGames)));
    drawCount();
    drawStep();
  }
}

// ---- Who is online, the open lobbies and who is searching or playing (/v2/online) ----
let live = null;
async function online() {
  try {
    const response = await fetch(new URL('/v2/online', base), {
      credentials: 'omit',
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return count(data?.players) != null ? data : null;
  } catch {
    return null;
  }
}
// A page that has never read /v2/online stops asking after its first try; one that has keeps its last answer.
let onlineTried = false;
let onlineSeen = false;
async function drawOnline() {
  if (onlineTried && !onlineSeen) return;
  onlineTried = true;
  const answer = await online();
  if (answer) {
    live = answer;
    onlineSeen = true;
  }
  set('online', fmt(count(live?.players)));
  set('lobbies', fmt(count(live?.lobbies)));
  const regions = Object.entries(live?.regions ?? {})
    .filter(([, n]) => count(n) > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${regionCode(id) || id.toUpperCase()} ${fmt(n)}`);
  set('regions', regions.slice(0, 2).join(' · ') || 'players');
  // Players in a set are always two a set, so a service that predates playingPlayers still gives them.
  const sets = count(live?.setsPlaying);
  const playing = count(live?.playingPlayers) ?? (sets == null ? null : 2 * sets);
  const searching = count(live?.searching);
  set('queue', live ? `${fmt(searching)} / ${fmt(playing)}` : '–');
  const modes = live?.searchingByMode;
  set(
    'queue-sub',
    searching != null && count(modes?.ranked) != null && count(modes?.quick) != null
      ? `searching: Ranked ${fmt(modes.ranked)} · Quick ${fmt(modes.quick)}`
      : 'players',
  );
  drawStep();
  drawGrid();
}

// ---- The last 24 hours of sets: the big number and the grid ----
// The grid draws the latest sets as their pages come in. The count is the service's (every mode) or, without it,
// the grid's own once every page of the day is in; until one is known the loader holds its place.
let day = [];
let capped = false;
let gridShown = false;
let dayState = 'reading'; // 'read' once every page of the day is in; 'failed' when a page did not come
const grid = q('[data-grid]');
const readout = q('[data-readout]');
const countNode = q('[data-count]');
const countLabel = q('[data-count-label]');
const legend = readout.textContent;

function showCount(text, label) {
  countLabel.textContent = label;
  if (text != null) countNode.textContent = text;
  else if (!countNode.querySelector('.rk-input'))
    countNode.replaceChildren(keys(), el('span', 'visually-hidden', 'Loading'));
}
function drawCount() {
  const games = count(totals?.gamesLast24h);
  if (games != null) return showCount(fmt(games), 'Games in the last 24 hours, every mode');
  if (!totalsDone) return showCount(null, 'Last 24 hours');
  const label = 'Ranked sets in the last 24 hours';
  if (dayState === 'read') return showCount(fmt(day.length) + (capped ? '+' : ''), label);
  showCount(dayState === 'failed' ? '–' : null, label);
}

function drawFirst(data) {
  drawFeed(data.rows.slice(0, FEED));
  for (const pill of root.querySelectorAll('[data-season]')) pill.textContent = seasonLabel(data);
}

// The first two pages draw as they come (Latest sets is the first page's) without waiting for the totals; only then
// does the read wait for them, since they decide whether the count needs the rest of the day. The count changes
// only once every page is in, so a request that fails part way never leaves a part-count on screen; "+" means only
// that the day has more sets than the pages read hold. A day read again whole (after a gap) keeps the old grid and
// count until the new day is in.
async function readDay() {
  const since = Date.now() - DAY;
  const again = dayState === 'read';
  if (!again) dayState = 'reading';
  drawCount();
  const rows = [];
  let cursor = null;
  let whole = false;
  let pages = PAGES_DRAWN;
  for (let page = 0; page < pages && !whole; page++) {
    const data = await fetchRanked(base, 'recent-sets', 'recent-sets', { limit: PAGE, cursor });
    if (page === 0) drawFirst(data);
    const fresh = data.rows.filter((row) => Date.parse(row.date) >= since);
    rows.push(...fresh);
    cursor = data.nextCursor;
    whole = fresh.length < data.rows.length || !cursor;
    if (!again) {
      day = [...rows];
      gridShown = true;
      drawGrid();
    }
    if (page === PAGES_DRAWN - 1 && !whole) {
      await totalsFirst;
      if (count(totals?.gamesLast24h) == null) pages = PAGES;
    }
  }
  day = rows;
  capped = !whole;
  dayState = 'read';
  gridShown = true;
  drawGrid();
  drawCount();
}
async function loadDay() {
  try {
    await readDay();
  } catch (error) {
    dayState = 'failed';
    drawCount();
    // Squares already drawn stay: they are still the latest sets.
    if (!gridShown) {
      readout.classList.remove('is-set');
      readout.replaceChildren(el('span', '', 'The sets are not available right now'));
    }
    if (!q('[data-feed] .hub-set')) message(q('[data-feed]'), 'The latest sets are not available right now.');
    throw error;
  }
}

// Newer sets from the first page join the front; sets older than a day leave the back. A day never read whole (or
// with a gap, after the tab was hidden a while) is read again whole.
async function refreshDay() {
  if (dayState !== 'read') return loadDay();
  const data = await fetchRanked(base, 'recent-sets', 'recent-sets', { limit: PAGE });
  drawFirst(data);
  const known = new Set(day.map((row) => row.id));
  if (day.length && !data.rows.some((row) => known.has(row.id))) return loadDay();
  const since = Date.now() - DAY;
  const most = (count(totals?.gamesLast24h) == null ? PAGES : PAGES_DRAWN) * PAGE;
  day = [...data.rows.filter((row) => !known.has(row.id)), ...day].filter((row) => Date.parse(row.date) >= since);
  if (day.length > most) {
    day = day.slice(0, most);
    capped = true;
  }
  drawGrid();
  drawCount();
}

// The largest square (5 to 24 px apart) at which every set fits the grid's box, which never changes size.
function fit(width, height, count) {
  for (let pitch = 24; pitch > 5; pitch--) {
    const gap = Math.max(2, Math.round(pitch / 4));
    if (Math.floor((width + gap) / pitch) * Math.floor((height + gap) / pitch) >= count) return { pitch, gap };
  }
  return { pitch: 5, gap: 2 };
}

let squares = [];
function drawGrid() {
  if (!gridShown) return;
  const playing = Math.min(count(live?.setsPlaying) ?? 0, 50);
  squares = [...Array(playing).fill(null), ...day];
  const { width, height } = grid.getBoundingClientRect();
  const { pitch, gap } = fit(width, height, squares.length);
  grid.style.setProperty('--sq', `${pitch - gap}px`);
  grid.style.setProperty('--gap', `${gap}px`);
  const now = Date.now();
  const cells = document.createDocumentFragment();
  squares.forEach((row, index) => {
    const cell = el('i');
    cell.dataset.i = index;
    if (!row) cell.className = 'g-live';
    else {
      const age = now - Date.parse(row.date);
      cell.className =
        (age < HOUR ? 'g1' : age < 3 * HOUR ? 'g2' : age < 8 * HOUR ? 'g3' : 'g4') +
        (row.outcome === 'quit' ? ' g-q' : '');
    }
    cells.append(cell);
  });
  grid.replaceChildren(cells);
  explain();
}
// The legend says what the grid is, the latest Ranked sets, since the big number over it may count every mode.
function explain() {
  if (!gridShown) return;
  const playing = squares.length - day.length;
  readout.classList.remove('is-set');
  readout.replaceChildren(
    el(
      'span',
      '',
      !squares.length ? 'No Ranked sets in the last 24 hours' : playing ? 'Latest Ranked sets · crimson: live' : legend,
    ),
  );
}

const sides = (row) => (row.players[1].won && !row.players[0].won ? [row.players[1], row.players[0]] : row.players);
// The set under the pointer, in two parts: who and with what (cut short when long), then when (always shown).
function describe(row) {
  readout.classList.add('is-set');
  if (!row) return readout.replaceChildren(el('span', '', 'Being played right now'));
  const [winner, loser] = sides(row);
  const score = winner.score != null && loser.score != null ? `${winner.score}–${loser.score}` : 'beat';
  readout.replaceChildren(
    el(
      'span',
      '',
      `${winner.player.name} ${score} ${loser.player.name} · ${characterName(winner.character)} vs ${characterName(loser.character)}`,
    ),
    el('span', '', ` · ${ago(row.date)}${row.outcome === 'quit' ? ' · forfeit' : ''}`),
  );
}
// Pointing at a square names its set; clicking one opens it. The same sets are links in Latest sets and on
// /ranked/sets/, so the grid itself stays out of the keyboard order and the accessibility tree.
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  grid.addEventListener('pointerover', (event) => {
    const index = event.target.dataset?.i;
    if (index != null) describe(squares[index]);
  });
  grid.addEventListener('pointerleave', explain);
  grid.addEventListener('click', (event) => {
    const row = squares[event.target.dataset?.i];
    const href = row && setPath(sides(row)[0].player, row.id);
    if (href) location.assign(href);
  });
}
new ResizeObserver(() => drawGrid()).observe(grid);

// ---- Step 3's live value: who is online, else everyone in Ranked this season ----
function drawStep() {
  const node = q('[data-step-live]');
  const ranked = count(totals?.rankedPlayers);
  if (live) node.replaceChildren(fmt(live.players), el('small', '', 'online now'));
  else if (ranked != null) node.replaceChildren(fmt(ranked), el('small', '', 'in Ranked'));
}

// ---- The top ten ----
async function drawTop() {
  try {
    drawBoard((await fetchRanked(base, 'leaderboard', 'leaderboard', { limit: 10 })).rows);
  } catch (error) {
    if (!q('[data-board] .hub-row')) message(q('[data-board]'), 'The board is not available right now.');
    throw error;
  }
}

// A player's name wraps at its natural breaks and steps down a size when a part is too wide for its column (see
// player-name.mjs); the lists fit their names again whenever they change width.
const nameOf = (name) => nameInto(el('b'), name);
const refit = new ResizeObserver((entries) => {
  for (const entry of entries) fitNames(entry.target.querySelectorAll('.pbd-name'));
});
refit.observe(q('[data-board]'));
refit.observe(q('[data-feed]'));

// ---- Top players: one row per player, each a link to the player's page; #1's place is gold ----
function drawBoard(rows) {
  const list = q('[data-board]');
  if (!rows.length) return message(list, 'Nobody has placed yet.');
  const cap = el('li', 'hub-row hub-cap');
  cap.setAttribute('aria-hidden', 'true');
  for (const [text, cls] of [
    ['#', 'hub-r'],
    ['', ''],
    ['Player', ''],
    ['Badge', 'hub-c-badge'],
    ['MMR', 'hub-r'],
    ['Sets', 'hub-r hub-c-rec'],
    ['Won', 'hub-r hub-c-rate'],
  ])
    cap.append(el('span', cls, text));
  const items = rows.map((row) => {
    const href = playerPath(row.player);
    const line = el(href ? 'a' : 'div', 'hub-row');
    if (href) line.href = href;
    const who = el('span', 'hub-who');
    const region = regionCode(row.region ?? row.player.region);
    who.append(
      nameOf(row.player.name),
      el('span', '', [row.player.tag && `#${row.player.tag}`, region].filter(Boolean).join(' · ')),
    );
    const badge = el('span', 'hub-badge hub-c-badge');
    const image = plate(row.rankId);
    if (image) badge.append(image);
    badge.append(el('span', '', row.rank ?? ''));
    line.append(
      el('span', 'hub-place', fmt(row.position)),
      face(row.character, 40, { label: characterName(row.character) }),
      who,
      badge,
      el('span', 'hub-mmr', fmt(row.mmr)),
      el('span', 'hub-sub hub-c-rec', record(row.wins, row.losses)),
      el('span', 'hub-sub hub-c-rate', pct(row.wins, row.losses)),
    );
    line.setAttribute(
      'aria-label',
      `${row.position}. ${row.player.name}, ${row.rank ?? 'unranked'}, ${fmt(row.mmr)} MMR, ${record(row.wins, row.losses)} in sets`,
    );
    const item = el('li');
    item.append(line);
    return item;
  });
  list.replaceChildren(cap, ...items);
  fitNames(list.querySelectorAll('.pbd-name'));
}

// ---- Latest sets: winner, score, loser, both rating changes and when; each row opens its set ----
function drawFeed(rows) {
  const list = q('[data-feed]');
  if (!rows.length) return message(list, 'No Ranked sets yet.');
  list.replaceChildren(
    ...rows.map((row) => {
      const [winner, loser] = sides(row);
      const href = setPath(winner.player, row.id);
      const line = el(href ? 'a' : 'div', 'hub-set');
      if (href) line.href = href;
      // The character, then the rating change, which keeps to itself on the next line when the two do not fit one.
      const side = (entry, className) => {
        const box = el('span', 'hub-side ' + className);
        const detail = el('span', '', characterName(entry.character));
        const change = entry.ratingChange?.change;
        if (Number.isFinite(change)) {
          const shift = el('span', 'hub-shift');
          shift.append(
            el('span', 'hub-dot', '· '),
            el('span', change > 0 ? 'hub-up' : change < 0 ? 'hub-down' : '', signed(change)),
          );
          detail.append(' ', shift);
        }
        box.append(nameOf(entry.player.name), detail);
        return box;
      };
      const score = winner.score != null && loser.score != null ? `${winner.score}–${loser.score}` : '–';
      line.append(
        face(winner.character, 40, { className: 'hub-f32' }),
        side(winner, 'hub-won'),
        el('span', 'hub-score', score),
        face(loser.character, 40, { className: 'hub-f32 hub-lost' }),
        side(loser, 'hub-lost-side'),
        el('span', 'hub-when', ago(row.date) + (row.outcome === 'quit' ? ' · Forfeit' : '')),
      );
      line.setAttribute(
        'aria-label',
        `${winner.player.name} beat ${loser.player.name} ${score}, ${ago(row.date)}${row.outcome === 'quit' ? ', forfeit' : ''}`,
      );
      const item = el('li');
      item.append(line);
      return item;
    }),
  );
  fitNames(list.querySelectorAll('.pbd-name'));
}

// ---- Characters: share of picks, and the best win rates from 30 games. Bars stay neutral; the numbers say it. ----
async function drawCharacters() {
  const picks = q('[data-picks]');
  const rates = q('[data-rates]');
  let data;
  try {
    data = await fetchRanked(base, 'characters', 'characters');
  } catch (error) {
    if (!picks.querySelector('.hub-char')) message(picks, 'Not available right now.');
    if (!rates.querySelector('.hub-char')) message(rates, 'Not available right now.');
    throw error;
  }
  const row = (entry, bar, value, note, half) => {
    const item = el('li', 'hub-char');
    const name = el('span', 'hub-char-name', characterName(entry.character));
    name.append(el('span', '', note));
    const track = el('span', 'hub-track' + (half ? ' hub-half' : ''));
    track.setAttribute('aria-hidden', 'true');
    const fill = el('i');
    fill.style.width = `${(Math.min(1, Math.max(0, bar)) * 100).toFixed(1)}%`;
    track.append(fill);
    item.append(face(entry.character, 40, { className: 'hub-f32' }), name, track, el('span', 'hub-pct', value));
    return item;
  };
  const played = [...data.rows].sort((a, b) => b.games - a.games).slice(0, 8);
  const top = played[0]?.pickRate || 1;
  if (played.length)
    picks.replaceChildren(
      ...played.map((entry) =>
        row(entry, entry.pickRate / top, `${(entry.pickRate * 100).toFixed(1)}%`, `${fmt(entry.games)} games`),
      ),
    );
  else message(picks, 'No Ranked games yet.');
  q('[data-picks-foot]').textContent = Number.isSafeInteger(data.totalPicks)
    ? `Share of ${fmt(data.totalPicks)} picks in ${seasonLabel(data)}`
    : '';
  const rated = data.rows
    .filter((entry) => entry.games >= 30 && entry.winRate != null)
    .sort((a, b) => b.winRate - a.winRate);
  if (rated.length)
    rates.replaceChildren(
      ...rated
        .slice(0, 8)
        .map((entry) =>
          row(
            entry,
            entry.winRate,
            `${Math.round(entry.winRate * 100)}%`,
            `${fmt(entry.wins)} won, ${fmt(entry.losses)} lost`,
            true,
          ),
        ),
    );
  else message(rates, 'No character has 30 games yet.');
  q('[data-rates-foot]').textContent =
    `Characters with 30 games or more, ${fmt(rated.length)} so far. The mark is 50%.`;
}

// ---- Load, then keep it current while the tab is in view ----
// Each part keeps its own time: online and the sets every minute; the totals (recomputed every five minutes), the
// board and the characters every five. A part that failed tries again sooner: a minute after the service said too
// many requests (it asks for a minute), 20 s after anything else.
const jobs = [
  { run: drawTotals, every: 300000 },
  { run: drawOnline, every: 60000 },
  { run: refreshDay, every: 60000 },
  { run: drawTop, every: 300000 },
  { run: drawCharacters, every: 300000 },
].map((job) => ({ ...job, next: 0, busy: false }));
async function run(job) {
  job.busy = true;
  try {
    await job.run();
    job.next = Date.now() + job.every;
  } catch (error) {
    job.next = Date.now() + (error?.status === 429 ? 60000 : 20000);
  }
  job.busy = false;
}
function due() {
  if (document.hidden) return;
  const now = Date.now();
  for (const job of jobs) if (!job.busy && now >= job.next) run(job);
}
due();
setInterval(due, 5000);
