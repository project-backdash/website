// <!-- check-allow: ranked -->
import { characterName, playerPath } from '/assets/js/ranked-data.mjs?v=2fa1825259';
import { characterBadge } from '/assets/js/ranked-avatar.mjs?v=1cc811626f';

export const number = (value) =>
  value == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
export const percent = (value) =>
  value == null ? '—' : new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(value);
export const change = (value) => (value == null ? '—' : `${value > 0 ? '+' : ''}${number(value)}`);
export const dateLabel = (value) =>
  value == null
    ? 'Unknown'
    : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(
        new Date(value),
      ) + ' UTC';

export function el(tag, className = '', text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function playerLink(player) {
  if (!player) player = { name: 'Unknown player', tag: null, avatarCharacter: null };
  const path = playerPath(player);
  const node = el(path ? 'a' : 'span', 'ranked-player');
  const name = el('span', 'ranked-player-name', player.name);
  if (path) node.href = path;
  if (player.tag !== null) name.append(el('span', 'ranked-tag', `#${player.tag}`));
  node.append(name, characterBadge(player.avatarCharacter));
  return node;
}

export function note(text) {
  return el('p', 'ranked-note', text);
}

export function table(title, headings, rows, { numeric = [], wide = false } = {}) {
  const wrap = el('div', 'table-wrap');
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', title);
  const node = el('table', 'data' + (wide ? ' data-wide' : ''));
  node.append(el('caption', '', title));
  const head = el('thead'),
    tr = el('tr');
  for (const [index, heading] of headings.entries()) {
    const th = el('th', numeric.includes(index) ? 'num' : '', heading);
    th.scope = 'col';
    tr.append(th);
  }
  head.append(tr);
  node.append(head);
  const body = el('tbody');
  for (const cells of rows) {
    const row = el('tr');
    for (const [index, content] of cells.entries()) {
      const cell = el(index === 0 ? 'th' : 'td', numeric.includes(index) ? 'num' : '');
      if (index === 0) cell.scope = 'row';
      cell.append(content instanceof Node ? content : document.createTextNode(String(content ?? '—')));
      row.append(cell);
    }
    body.append(row);
  }
  node.append(body);
  wrap.append(node);
  return wrap;
}

export function select(label, values, selected, onChange) {
  const wrapper = el('label', 'ranked-field', label);
  const control = el('select');
  control.setAttribute('aria-label', label);
  for (const [value, title] of values) {
    const option = el('option', '', title);
    option.value = value;
    control.append(option);
  }
  control.value = selected;
  control.addEventListener('change', () => onChange(control.value));
  wrapper.append(control);
  return wrapper;
}

export function characterOptions(ids) {
  return [...new Set(ids)]
    .sort((a, b) => characterName(a).localeCompare(characterName(b)))
    .map((id) => [id, characterName(id)]);
}

export function statsNav(current) {
  const nav = el('nav', 'ranked-nav');
  nav.setAttribute('aria-label', 'Statistics');
  for (const [route, title] of [
    ['/stats/', 'Overview'],
    ['/stats/players/', 'Players'],
    ['/stats/characters/', 'Characters'],
    ['/stats/matchups/', 'Matchups'],
    ['/stats/leaderboard/', 'Leaderboard'],
    ['/stats/ranks/', 'Ranks'],
  ]) {
    const link = el('a', '', title);
    link.href = route;
    if (route === current) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  return nav;
}

export function section(title) {
  const node = el('section', 'section');
  node.append(el('h2', 'label-tab', title));
  return node;
}
