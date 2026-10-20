// The Stats page: reads the public totals once at page load and fills the page in.
// The address comes from the page (data-stats-src), so this script names no other site. A missing, late or
// malformed answer leaves data-state="down", and the page shows its warming-up note instead of empty boxes.
// <!-- check-allow: ranked -->
import { showLoading } from '/assets/js/ranked-loading.mjs?v=99f2b86e88';

const TOTALS = ['accounts', 'playersWhoPlayed', 'gamesPlayed', 'rankedGames', 'rankedPlayers', 'hoursPlayed'];
const MAX_DAYS = 30;
const MAX_CHARACTERS = 10;
const MAX_PLAYERS = 20;
const TIMEOUT_MS = 8000;

const number = new Intl.NumberFormat('en-US');
const dayName = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const stamp = new Intl.DateTimeFormat('en-US', {
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

// The answer as the page uses it, or null when any part is not what the page expects.
export function readStats(value) {
  if (!value || typeof value !== 'object' || value.version !== 1) return null;
  const { totals, gamesPerDay, characters, topMmr, updatedAt } = value;
  if (!totals || typeof totals !== 'object') return null;
  for (const key of TOTALS) {
    const v = totals[key];
    if (key === 'hoursPlayed' ? !(Number.isFinite(v) && v >= 0) : !isCount(v)) return null;
  }
  if (!Array.isArray(gamesPerDay) || !gamesPerDay.every((d) => d && isDay(d.date) && isCount(d.games))) return null;
  if (!Array.isArray(characters) || !characters.every((c) => c && isName(c.name) && isCount(c.games))) return null;
  if (
    !Array.isArray(topMmr) ||
    !topMmr.every((p) => p && isName(p.player) && isName(p.character) && isName(p.rank) && Number.isFinite(p.mmr))
  )
    return null;
  const updated = typeof updatedAt === 'string' ? new Date(updatedAt) : null;
  return {
    totals,
    days: [...gamesPerDay].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, MAX_DAYS),
    characters: [...characters].sort((a, b) => b.games - a.games).slice(0, MAX_CHARACTERS),
    players: [...topMmr].sort((a, b) => b.mmr - a.mmr).slice(0, MAX_PLAYERS),
    updated: updated && !Number.isNaN(updated.getTime()) ? updated : null,
  };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// One row per value: the name, a bar as long as the value is against the largest, and the number.
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
    item.append(name, track, el('span', 'bar-value', number.format(row.value)));
    list.append(item);
  }
}

export function renderStats(root, stats) {
  for (const key of TOTALS) {
    const cell = root.querySelector(`[data-stat="${key}"]`);
    if (cell)
      cell.textContent = number.format(key === 'hoursPlayed' ? Math.round(stats.totals[key]) : stats.totals[key]);
  }
  const days = root.querySelector('[data-stats-days]');
  if (days)
    fillBars(
      days,
      stats.days.map((d) => ({ name: dayName.format(new Date(`${d.date}T00:00:00Z`)), value: d.games })),
      'No games yet.',
    );
  const characters = root.querySelector('[data-stats-characters]');
  if (characters)
    fillBars(
      characters,
      stats.characters.map((c) => ({
        name: c.name,
        value: c.games,
        url:
          '/stats/characters/?character=' +
          encodeURIComponent(
            c.name
              .toLowerCase()
              .replaceAll(/[^a-z0-9]+/g, '_')
              .replace(/_$/, ''),
          ),
      })),
      'No games yet.',
    );
  const top = root.querySelector('[data-stats-top]');
  if (top) {
    top.replaceChildren();
    if (!stats.players.length) {
      const row = el('tr');
      const cell = el('td', 'cell-note', 'Nobody has an MMR yet.');
      cell.colSpan = 5;
      row.append(cell);
      top.append(row);
    }
    stats.players.forEach((p, index) => {
      const row = el('tr');
      // On a phone the Character column folds under the player's name, so the MMR column stays in view.
      const player = el('th');
      const link = el('a', '', p.player);
      link.href = '/stats/players/?q=' + encodeURIComponent(p.player);
      player.append(link);
      player.scope = 'row';
      player.append(el('span', 'top-char', p.character));
      row.append(
        el('td', 'num', String(index + 1)),
        player,
        el('td', 'col-char', p.character),
        el('td', '', p.rank),
        el('td', 'num', number.format(Math.round(p.mmr))),
      );
      top.append(row);
    });
  }
  const updated = root.querySelector('[data-stats-updated]');
  if (updated) updated.textContent = stats.updated ? `Updated ${stamp.format(stats.updated)} UTC.` : '';
  root.dataset.state = 'up';
  const daySection = root.querySelector('#days-title')?.closest('section');
  if (daySection) root.append(daySection);
}

async function load(root) {
  const address = root.dataset.statsSrc;
  if (!address) return;
  root.dataset.state = 'loading';
  const loading = root.querySelector('.stats-loading');
  if (loading) showLoading(loading);
  try {
    const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
    const response = await fetch(address, { mode: 'cors', credentials: 'omit', signal });
    if (!response.ok) throw new Error('unavailable');
    const stats = readStats(await response.json());
    if (!stats) throw new Error('unexpected answer');
    renderStats(root, stats);
  } catch {
    root.dataset.state = 'down';
  }
}

const root = document.querySelector('[data-stats-src]');
if (root) load(root);
