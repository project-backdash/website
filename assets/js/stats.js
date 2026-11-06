// Totals load once; live activity refreshes each minute while visible. Missing counts stay unknown, never zero.
// <!-- check-allow: ranked -->
import { showLoading } from '/assets/js/ranked-loading.mjs?v=78371fcc9f';
import { fetchRanked } from '/assets/js/ranked-data.mjs?v=dde3981e98';
import { face } from '/assets/js/ranked-kit.mjs?v=f30d870cde';
import { drawTopPlayers } from '/assets/js/top-players.mjs?v=3bdf392edc';
import { dailySeries } from '/assets/js/stats-days.mjs?v=48384e5925';

const TOTALS = [
  'accounts',
  'playersWhoPlayed',
  'gamesPlayed',
  'gamesLast24h',
  'rankedGames',
  'rankedPlayers',
  'hoursPlayed',
];
const ONLINE_EVERY_MS = 60000;
const MAX_CHARACTERS = 10;
const TOP_PLAYERS = 10;
const TIMEOUT_MS = 8000;
// A read of the totals the service's edge has not kept takes it about ten seconds.
const TOTALS_TIMEOUT_MS = 30000;

const number = new Intl.NumberFormat('en-US');
const dayName = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const stamp = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

const isCount = (v) => Number.isSafeInteger(v) && v >= 0;
const isName = (v) => typeof v === 'string' && v.trim() !== '' && v.length <= 40;
const isDay = (v) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

// The answer as the page uses it, or null when any part is not what the page expects. Each total is its count, or
// null when the service does not send it (gamesLast24h is null until its database function is updated). The top
// players come from the Ranked board instead of topMmr, so they are in the board's order, as on Home.
export function readStats(value) {
  if (!value || typeof value !== 'object' || value.version !== 1) return null;
  const { gamesPerDay, characters, updatedAt } = value;
  if (!value.totals || typeof value.totals !== 'object') return null;
  const totals = {};
  for (const key of TOTALS) {
    const v = value.totals[key];
    totals[key] = (key === 'hoursPlayed' ? Number.isFinite(v) && v >= 0 : isCount(v)) ? v : null;
  }
  if (!Array.isArray(gamesPerDay) || !gamesPerDay.every((d) => d && isDay(d.date) && isCount(d.games))) return null;
  if (!Array.isArray(characters) || !characters.every((c) => c && isName(c.name) && isCount(c.games))) return null;
  const updated = typeof updatedAt === 'string' ? new Date(updatedAt) : null;
  return {
    totals,
    days: dailySeries(gamesPerDay, updated && !Number.isNaN(updated.getTime()) ? updated : new Date()),
    characters: [...characters].sort((a, b) => b.games - a.games).slice(0, MAX_CHARACTERS),
    updated: updated && !Number.isNaN(updated.getTime()) ? updated : null,
  };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// One row per value: the character's portrait where the row is a character, the name, a bar as long as the value is
// against the largest, and the number.
function fillBars(list, rows, empty) {
  list.replaceChildren();
  if (!rows.length) {
    list.append(el('li', 'bars-empty', empty));
    return;
  }
  const most = Math.max(...rows.map((r) => r.value));
  for (const row of rows) {
    const item = el('li');
    const track = el('span', 'bar-track');
    const fill = el('span', 'bar-fill');
    fill.style.width = most > 0 ? `${(row.value / most) * 100}%` : '0';
    track.setAttribute('aria-hidden', 'true');
    track.append(fill);
    const name = el(row.url ? 'a' : 'span', 'bar-name', row.name);
    if (row.url) name.href = row.url;
    if (row.character) item.append(face(row.character, 40, { className: 'bar-face' }));
    item.append(name, track, el('span', 'bar-value', number.format(row.value)));
    list.append(item);
  }
}

const shown = (v) => (v == null ? '–' : number.format(v));

// Each total in its place, or "–" for one not known (all of them before the first answer).
export function renderTotals(root, totals) {
  for (const key of TOTALS) {
    const cell = root.querySelector(`[data-stat="${key}"]`);
    const v = totals?.[key] ?? null;
    if (cell) cell.textContent = shown(key === 'hoursPlayed' && v != null ? Math.round(v) : v);
  }
}

export function renderStats(root, stats) {
  renderTotals(root, stats.totals);
  const days = root.querySelector('[data-stats-days]');
  if (days) renderDays(days, stats.days);
  const coverage = root.querySelector('[data-days-coverage]');
  if (coverage) coverage.hidden = !stats.days.some(day => day.games == null);
  const characters = root.querySelector('[data-stats-characters]');
  if (characters)
    fillBars(
      characters,
      stats.characters.map((c) => {
        const character = c.name
          .toLowerCase()
          .replaceAll(/[^a-z0-9]+/g, '_')
          .replace(/_$/, '');
        return {
          name: c.name,
          value: c.games,
          character,
          url: '/stats/characters/?character=' + encodeURIComponent(character),
        };
      }),
      'No games yet.',
    );
  const updated = root.querySelector('[data-stats-updated]');
  if (updated) updated.textContent = stats.updated ? `Updated ${stamp.format(stats.updated)} UTC` : '';
  root.dataset.state = 'up';
  // Scroll after the chart becomes visible, keeping the newest date in view inside its own region.
  const scroller = days?.closest('.days-scroll');
  if (scroller) requestAnimationFrame(() => { scroller.scrollLeft = scroller.scrollWidth; });
}

export function renderDays(list, rows) {
  list.replaceChildren();
  const most = Math.max(1, ...rows.map(day => day.games ?? 0));
  for (const day of rows) {
    const item = el('li', day.today ? 'day-column is-today' : 'day-column');
    item.dataset.date = day.date;
    const label = dayName.format(new Date(`${day.date}T00:00:00Z`));
    item.setAttribute('aria-label', `${label}: ${day.games == null ? 'count unavailable' : number.format(day.games) + ' games'}${day.today ? ', today so far' : ''}`);
    const track = el('span', 'day-track');
    track.setAttribute('aria-hidden', 'true');
    const bar = el('span', 'day-bar');
    bar.style.height = `${((day.games ?? 0) / most) * 100}%`;
    if (day.games === 0) bar.classList.add('is-zero');
    bar.append(el('span', 'day-value', shown(day.games)));
    track.append(bar);
    const date = el('span', 'day-date', label);
    date.setAttribute('aria-hidden', 'true');
    if (day.today) date.append(el('span', 'day-today', 'Today so far'));
    item.append(track, date);
    list.append(item);
  }
}

// /v2/online as the page uses it: who is online, the open lobbies, who is searching and who is in a set being played,
// each a count or null. Players in a set are always two a set, so a service that predates playingPlayers still gives
// them. Null when the answer has no count of players at all.
export function readOnline(value) {
  if (!value || typeof value !== 'object' || !isCount(value.players)) return null;
  const count = (v) => (isCount(v) ? v : null);
  const sets = count(value.setsPlaying);
  return {
    players: value.players,
    lobbies: count(value.lobbies),
    searching: count(value.searching),
    playing: count(value.playingPlayers) ?? (sets == null ? null : 2 * sets),
    updated: typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt)) ? new Date(value.updatedAt) : null,
  };
}

export function renderOnline(root, online) {
  const text = {
    players: shown(online?.players),
    lobbies: shown(online?.lobbies),
    searching: shown(online?.searching),
    playing: shown(online?.playing),
  };
  for (const cell of root.querySelectorAll('[data-online]')) cell.textContent = text[cell.dataset.online] ?? '–';
  const updated = root.querySelector('[data-online-updated]');
  if (updated) updated.textContent = online ? `${online.updated ? 'Updated ' + stamp.format(online.updated) + ' UTC. ' : ''}Refreshes every minute.` : 'Live activity unavailable.';
}

const timeout = (ms = TIMEOUT_MS) => (typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined);

async function load(root) {
  const address = root.dataset.statsSrc;
  if (!address) return;
  root.dataset.state = 'loading';
  const loading = root.querySelector('.stats-loading');
  if (loading) showLoading(loading, 'Loading…', true);
  try {
    const response = await fetch(address, { mode: 'cors', credentials: 'omit', signal: timeout(TOTALS_TIMEOUT_MS) });
    if (!response.ok) throw new Error('unavailable');
    const stats = readStats(await response.json());
    if (!stats) throw new Error('unexpected answer');
    renderStats(root, stats);
  } catch {
    root.dataset.state = 'down';
  }
}

// One read at page load, then one a minute while the page is in view. A failed read keeps the last answer on screen;
// a page that has never read it stops asking.
let online = null;
let onlineSeen = false;
async function loadOnline(root) {
  let fresh = false;
  try {
    const response = await fetch(new URL('/v2/online', root.dataset.statsSrc), {
      mode: 'cors',
      credentials: 'omit',
      signal: timeout(),
    });
    if (response.ok) {
      const answer = readOnline(await response.json());
      if (answer) { online = answer; fresh = true; }
    }
  } catch {
    // Kept as it was; the tiles say "–" until a first answer.
  }
  onlineSeen ||= online != null;
  renderOnline(root, online);
  if (!fresh && online) {
    const updated = root.querySelector('[data-online-updated]');
    if (updated) updated.textContent = `${online.updated ? 'Last updated ' + stamp.format(online.updated) + ' UTC. ' : ''}Refresh delayed.`;
  }
  return onlineSeen;
}

// The top ten, from the board. A failed read says so in the list's place.
async function loadTop(root) {
  const list = root.querySelector('[data-stats-top]');
  if (!list || !root.dataset.rankedApi) return;
  try {
    const board = await fetchRanked(root.dataset.rankedApi, 'leaderboard', 'leaderboard', { limit: TOP_PLAYERS });
    drawTopPlayers(list, board.rows);
  } catch {
    drawTopPlayers(list, [], 'The board is not available right now.');
  }
}

const root = document.querySelector('[data-stats-src]');
if (root?.dataset.statsSrc) {
  renderTotals(root, null);
  renderOnline(root, null);
  load(root);
  loadTop(root);
  loadOnline(root).then((seen) => {
    if (seen) setInterval(() => document.hidden || loadOnline(root), ONLINE_EVERY_MS);
  });
}
