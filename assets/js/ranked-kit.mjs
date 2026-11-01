// <!-- check-allow: ranked -->
// <!-- check-allow: profiles -->
// Parts shared by the Ranked landing, its latest sets, the player pages and the bar's search: numbers and times in
// player terms, portraits and plates, the rank table, the "This is me" choice, set rows and the player search.
import { CHARACTERS, characterName, playerPath, setPath, fetchRanked } from '/assets/js/ranked-data.mjs?v=dde3981e98';
import { el } from '/assets/js/ranked-ui.mjs?v=8eae8314f1';

export { el };

export const REGIONS = [
  ['na', 'NA', 'North America'],
  ['sa', 'SA', 'South America'],
  ['eu', 'EU', 'Europe'],
  ['af', 'AF', 'Africa'],
  ['asia', 'AS', 'Asia'],
  ['oceania', 'OC', 'Oceania'],
];
export const regionCode = (id) => REGIONS.find(([key]) => key === id)?.[1] ?? '';
export const regionName = (id) => REGIONS.find(([key]) => key === id)?.[2] ?? '';

const grouped = new Intl.NumberFormat('en-US');
export const int = (value) => (Number.isSafeInteger(value) ? value : null);
export const fmt = (value) => (Number.isFinite(value) ? grouped.format(Math.round(value)) : '–');
// "+12", "−8" and a bare "0": the ± sign belongs to the rating's deviation.
export const signed = (value) =>
  Math.round(value) === 0 ? '0' : (value > 0 ? '+' : '−') + grouped.format(Math.abs(Math.round(value)));
export const pct = (won, lost) => (won + lost > 0 ? `${Math.round((100 * won) / (won + lost))}%` : '–');
export const record = (won, lost) => `${fmt(won)}–${fmt(lost)}`;

// Times read in the reader's own day: "20 s ago", "4 min ago", "2 h ago", "Yesterday", then "2 Nov".
const DAY = 86400000;
const midnight = (time) => new Date(time).setHours(0, 0, 0, 0);
const daysAgo = (time, now = Date.now()) => Math.round((midnight(now) - midnight(time)) / DAY);
export const shortDate = (value) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(value));
export const clock = (value) =>
  new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
export function ago(value, now = Date.now()) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  const days = daysAgo(time, now);
  if (days <= 0) return `${Math.floor(seconds / 3600)} h ago`;
  return days === 1 ? 'Yesterday' : shortDate(time);
}
export function dayLabel(value) {
  const days = daysAgo(Date.parse(value));
  if (days <= 0) return 'Today';
  if (days === 1) return `Yesterday, ${shortDate(value)}`;
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(value));
}
const time = (value) => (typeof value === 'number' ? value : Date.parse(value));
export const sameDay = (a, b) => midnight(time(a)) === midnight(time(b));

export const seasonLabel = (data) =>
  data?.seasonLabel ?? (data?.season === 'preseason-1' ? 'Ranked Preseason' : 'Beta Season');

export function face(character, size = 40, { label = '', className = '' } = {}) {
  const id = CHARACTERS.includes(character) ? character : null;
  const cls = `rk-face rk-f${size}${className ? ' ' + className : ''}`;
  if (!id) {
    const blank = el('span', cls);
    blank.setAttribute('aria-hidden', 'true');
    return blank;
  }
  const image = el('img');
  image.src = `/assets/portraits/${id}.png`;
  image.alt = label;
  if (label) image.title = label;
  image.width = size;
  image.height = size;
  image.decoding = 'async';
  // Rows and grids hold many portraits; only the player header's is wanted at once.
  if (size < 120) image.loading = 'lazy';
  image.className = cls;
  // A portrait that fails to load leaves the empty frame, never a broken image.
  image.addEventListener('error', () => {
    const blank = el('span', cls);
    blank.setAttribute('aria-hidden', 'true');
    image.replaceWith(blank);
  });
  return image;
}

export const isRankId = (id) => typeof id === 'string' && /^rank_(0\d|[12]\d|3[0-4])$/.test(id);
// What the player card can show of a character: a badge with its MMR, or the count of placement sets while it places.
// The player page offers Share by the same two tests.
export const isPlaced = (row) => isRankId(row?.rankId) && Number.isFinite(row?.mmr);
export const isPlacing = (row) =>
  !isRankId(row?.rankId) &&
  int(row?.placementSets) != null &&
  int(row?.placementTotal) > 0 &&
  row.placementSets < row.placementTotal;
export function plate(rankId, { label = '', className = '' } = {}) {
  if (!isRankId(rankId)) return null;
  const image = el('img', className);
  image.src = `/assets/rank-plates/${rankId}.png`;
  image.alt = label;
  image.width = 192;
  image.height = 96;
  image.decoding = 'async';
  image.loading = 'lazy';
  image.addEventListener('error', () => image.remove());
  return image;
}

// The rank table in force (badge lines, the "?" line, when the season began). An older stats service has none,
// and every part that needs it stays hidden.
let rankTablePromise = null;
export function rankTable(base) {
  rankTablePromise ??= fetchRanked(base, 'ranks', 'ranks').catch(() => null);
  return rankTablePromise;
}
export const settling = (rd, table) => Number.isFinite(rd) && rd > (table?.uncertainDeviation ?? 110);
export function unsure() {
  const mark = el('span', 'rk-unsure', '?');
  mark.title = 'Still settling';
  mark.setAttribute('aria-label', 'still settling');
  return mark;
}
// Badges follow MMR: the next badge starts at its own line, so the bar runs from this badge's line to the next one.
export function nextBadge(table, rankId, mmr) {
  if (!table || !isRankId(rankId) || !Number.isFinite(mmr)) return null;
  const index = Number(rankId.slice(5));
  const here = table.ranks[index];
  const next = table.ranks[index + 1];
  if (here?.from == null || next?.from == null) return null;
  return {
    name: next.rank,
    need: Math.max(1, next.from - mmr),
    share: Math.min(1, Math.max(0, (mmr - here.from) / (next.from - here.from))),
  };
}
export function bar(share) {
  const track = el('span', 'rk-bar');
  track.setAttribute('aria-hidden', 'true');
  const fill = el('i');
  fill.style.width = `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;
  track.append(fill);
  return track;
}
export function lamps(done, total) {
  const row = el('span', 'rk-lamps');
  row.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < total; index++) row.append(el('i', index < done ? 'on' : ''));
  return row;
}

// "This is me" lives in this browser only: there is no sign-in on the site.
const ME_KEY = 'pbd-me';
export function me() {
  try {
    const value = localStorage.getItem(ME_KEY);
    return value && /^.{1,40}#\d{4}$/u.test(value) ? value : null;
  } catch {
    return null;
  }
}
export function setMe(player) {
  try {
    if (player) localStorage.setItem(ME_KEY, `${player.name}#${player.tag}`);
    else localStorage.removeItem(ME_KEY);
  } catch {
    /* storage is off: the choice lasts for this page only */
  }
}
export const isMe = (player) => Boolean(player?.tag) && me() === `${player.name}#${player.tag}`;

export function you() {
  return el('span', 'rk-you', 'You');
}

const KEYS = [
  'M0 12L12 0L13 0L13 8L24 8L24 16L13 16L13 24L12 24Z',
  'M8 9L10 8L15 8L16 8.5L16 15L14 16L9 16L8 15.5Z',
  'M0 12L12 0L13 0L13 8L24 8L24 16L13 16L13 24L12 24Z',
  'M2 22L2 3L2.7917 2.2083L9.125 8.5417L17.6667 0L24 6.3333L15.4583 14.875L21.7917 21.2083L21 22Z',
];
// The loader's four keys alone, for a place that holds one value (Home's big number).
export function keys() {
  const input = el('span', 'rk-input');
  input.setAttribute('aria-hidden', 'true');
  for (const d of KEYS) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    svg.append(path);
    input.append(svg);
  }
  return input;
}
export function loading(text) {
  const box = el('div', 'rk-loading');
  box.setAttribute('role', 'status');
  box.append(keys(), el('span', '', text));
  return box;
}
export function empty(title, text, action) {
  const box = el('div', 'rk-empty');
  box.append(el('b', '', title));
  if (text) box.append(el('span', '', text));
  if (action) box.append(action);
  return box;
}
export function link(text, href, className = 'rk-link') {
  const node = el('a', className, text);
  node.href = href;
  return node;
}
export function section(title, window, extra) {
  const head = el('div', 'rk-sec');
  head.append(el('h2', 'rk-h', title));
  if (window) head.append(el('span', 'rk-window', window));
  if (extra) head.append(extra);
  return head;
}

// Games inside a set as letters, from the first player's side: W filled, L outlined, a dash for a drawn game.
export function gameLetters(set) {
  const box = el('span', 'rk-wl');
  const words = [];
  for (const game of set.gameList ?? []) {
    const kind = game.winner === null ? 'd' : game.winner === 0 ? 'w' : 'l';
    box.append(el('i', kind, kind === 'd' ? '–' : kind.toUpperCase()));
    words.push(kind === 'w' ? 'won' : kind === 'l' ? 'lost' : 'drawn');
  }
  if (words.length) box.setAttribute('aria-label', `Games: ${words.join(', ')}`);
  return box;
}
export const setScore = (set) =>
  set.players.every((side) => side.score != null) ? `${set.players[0].score}–${set.players[1].score}` : '–';
export const rounds = (set) =>
  (set.gameList ?? [])
    .filter((game) => game.rounds)
    .map((game) => game.rounds.join('–'))
    .join(' · ');

// One line of the latest sets: the winner, the score, the loser, both rating changes, and when.
export function feedRow(set) {
  const sides = set.players[1].won && !set.players[0].won ? [set.players[1], set.players[0]] : set.players;
  const href = setPath(sides[0].player, set.id);
  const row = el(href ? 'a' : 'div', 'rk-feed-row');
  if (href) row.href = href;
  const name = (side, className) => {
    const box = el('span', 'rk-nm ' + className);
    box.append(el('b', '', side.player.name), el('span', '', characterName(side.character)));
    return box;
  };
  const delta = (side, className) =>
    el('span', 'rk-ch ' + className, side.ratingChange ? signed(side.ratingChange.change) : '');
  const score = sides.every((side) => side.score != null) ? `${sides[0].score}–${sides[1].score}` : '–';
  const when = el('span', 'rk-t', ago(set.date));
  if (set.outcome === 'quit') when.append(el('span', '', ' · Forfeit'));
  row.append(
    face(sides[0].character, 40, { className: 'rk-wf' }),
    name(sides[0], 'rk-wn'),
    delta(sides[0], 'rk-win'),
    el('span', 'rk-sc', score),
    face(sides[1].character, 40, { className: 'rk-lf' }),
    name(sides[1], 'rk-ln'),
    delta(sides[1], 'rk-loss'),
    when,
  );
  row.setAttribute(
    'aria-label',
    `${sides[0].player.name} beat ${sides[1].player.name} ${score}, ${ago(set.date)}${set.outcome === 'quit' ? ', forfeit' : ''}`,
  );
  return row;
}

// Every placed player (one board page), to show a badge and MMR beside each search match, and a player's own
// set record and place on their page when the stats service does not send them with the profile.
let boardPromise = null;
function boardIndex(base) {
  boardPromise ??= fetchRanked(base, 'leaderboard', 'leaderboard', { limit: 100 })
    .then((data) => ({
      complete: !data.nextCursor,
      rows: new Map(data.rows.map((row) => [`${row.player.name}#${row.player.tag}`.toLowerCase(), row])),
    }))
    .catch(() => null);
  return boardPromise;
}

export async function boardRow(base, player) {
  const board = await boardIndex(base);
  return board?.rows.get(`${player.name}#${player.tag}`.toLowerCase()) ?? null;
}

const SEARCH_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6"/></svg>';
let searchCount = 0;

// A player search box: matches as you type (name, any case, from its start), Name#1234 straight to the profile,
// arrows and Enter to pick, Esc to close, and "/" anywhere on the page to start typing. `form` is the box's
// <form>, which still searches on the Players page without scripts.
export function playerSearch(form, { base, onPick = (path) => location.assign(path), slash = true } = {}) {
  const input = form.querySelector('input');
  const kbd = form.querySelector('.rk-kbd');
  const holder = input.closest('.rk-search') ?? form;
  const list = el('div', 'rk-search-list');
  list.id = `rk-search-list-${++searchCount}`;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  holder.append(list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  let timer,
    request,
    revision = 0,
    options = [],
    selected = -1;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    selected = -1;
  };
  const choose = (index) => {
    options.forEach((option, at) => option.setAttribute('aria-selected', String(at === index)));
    selected = index;
    if (options[index]) input.setAttribute('aria-activedescendant', options[index].id);
    else input.removeAttribute('aria-activedescendant');
  };
  const say = (text) => {
    options = [];
    list.replaceChildren(el('p', '', text));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const tagged = (value) => /^(.{1,40})#(\d{4})$/u.exec(value);
  const query = (value) => (tagged(value) ? value : value.split('#')[0].trim());

  async function search() {
    const value = input.value.trim();
    const q = query(value);
    const current = ++revision;
    request?.abort();
    if (!q || [...q].length > 45) return close();
    const controller = new AbortController();
    request = controller;
    try {
      const [answer, board] = await Promise.all([
        fetchRanked(base, 'players', 'players', { q, limit: 8 }, controller.signal),
        boardIndex(base),
      ]);
      if (current !== revision) return;
      if (!answer.players.length)
        return say(
          tagged(value)
            ? `No player called ${value}. Check the spelling, or search the name without the tag.`
            : `No player called ${value}. Check the spelling.`,
        );
      options = answer.players
        .map((player, index) => {
          const path = playerPath(player);
          if (!path) return null;
          const option = el('a');
          option.href = path;
          option.id = `${list.id}-${index}`;
          option.setAttribute('role', 'option');
          const name = el('span');
          name.append(el('b', '', player.name), ' ', el('span', 'rk-faint', `#${player.tag}`));
          const row = board?.rows.get(`${player.name}#${player.tag}`.toLowerCase());
          const note = row ? `${row.rank} · ${fmt(row.mmr)}` : board?.complete ? 'Placing' : '';
          option.append(face(player.avatarCharacter, 24), name, el('span', 'rk-faint', note));
          option.addEventListener('mousedown', (event) => event.preventDefault());
          return option;
        })
        .filter(Boolean);
      list.replaceChildren(...options);
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      choose(0);
    } catch (error) {
      if (current === revision && error?.name !== 'AbortError') say('Search is unavailable right now. Try again.');
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, 200);
  });
  input.addEventListener('focus', () => {
    if (kbd) kbd.textContent = 'Esc';
    if (input.value.trim() && list.childElementCount) {
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
  });
  input.addEventListener('blur', () => {
    if (kbd) kbd.textContent = '/';
    setTimeout(close, 120);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      choose((selected + step + options.length) % options.length);
    } else if (event.key === 'Escape') {
      if (!list.hidden) close();
      else input.blur();
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    const exact = tagged(value);
    if (options[selected] && !list.hidden) return onPick(options[selected].getAttribute('href'));
    if (exact) return onPick(playerPath({ name: exact[1], tag: exact[2] }));
    if (value) search();
  });
  if (slash)
    document.addEventListener('keydown', (event) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      event.preventDefault();
      form.dispatchEvent(new CustomEvent('rk-open'));
      input.focus();
    });
  return { input, close };
}

export function searchForm(placeholder, { big = true } = {}) {
  const form = el('form', 'rk-search');
  form.action = '/stats/players/';
  form.method = 'get';
  form.setAttribute('role', 'search');
  const box = el('label', 'rk-search-box');
  box.innerHTML = SEARCH_ICON;
  const input = el('input');
  input.type = 'search';
  input.name = 'q';
  input.maxLength = 45;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);
  box.append(input);
  if (big) {
    const kbd = el('span', 'rk-kbd', '/');
    kbd.setAttribute('aria-hidden', 'true');
    box.append(kbd);
  }
  form.append(box);
  return form;
}
