// <!-- check-allow: ranked -->
import { el, table, number, change, dateLabel, note } from '/assets/js/ranked-ui.mjs?v=dcce91eb97';
import { characterName } from '/assets/js/ranked-data.mjs?v=2fa1825259';

const ranks = [
  'Beginner',
  '9th Kyu',
  '8th Kyu',
  '7th Kyu',
  '6th Kyu',
  '5th Kyu',
  '4th Kyu',
  '3rd Kyu',
  '2nd Kyu',
  '1st Kyu',
  '1st Dan',
  '2nd Dan',
  '3rd Dan',
  '4th Dan',
  '5th Dan',
  '6th Dan',
  '7th Dan',
  'Shihan',
  'Expert',
  'Warrior',
  'Master',
  'Virtuoso',
  'Champion',
  'Lone Wolf',
  'Destroyer',
  'Berserker',
  'Sage',
  'Legend',
  'Fujin',
  'Raijin',
  'Deity',
  'Lord of War',
  'Dragon Lord',
  'Tekken Lord',
  'Dark Lord',
];
const rankName = (id) => (/^rank_\d{2}$/.test(id ?? '') ? (ranks[Number(id.slice(5))] ?? null) : null);

function ratingChart(points) {
  const rows = points
    .filter((p) => p.after != null)
    .slice()
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (!rows.length) return null;
  const figure = el('figure', 'rating-figure');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 640 260');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'MMR by date. Focus or tap a point for its rating.');
  svg.classList.add('ranked-chart');
  const node = (tag, attrs, text) => {
    const n = document.createElementNS(svg.namespaceURI, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    svg.append(n);
    return n;
  };
  const values = rows.map((p) => p.after),
    times = rows.map((p) => Date.parse(p.date));
  const min = Math.min(...values),
    max = Math.max(...values),
    pad = Math.max(10, (max - min) * 0.12);
  const low = Math.floor(min - pad),
    high = Math.ceil(max + pad),
    start = times[0],
    end = times.at(-1);
  const x = (t) => (start === end ? 346 : 64 + ((t - start) / (end - start)) * 552);
  const y = (v) => 208 - ((v - low) / (high - low)) * 182;
  for (const value of [low, Math.round((low + high) / 2), high]) {
    node('line', { x1: 64, x2: 616, y1: y(value), y2: y(value), class: 'rating-grid' });
    node('text', { x: 54, y: y(value) + 5, 'text-anchor': 'end' }, number(value));
  }
  node('text', { x: 64, y: 15 }, 'MMR');
  const day = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  for (const t of start === end ? [start] : [start, (start + end) / 2, end]) {
    const anchor = t === start && start !== end ? 'start' : t === end && start !== end ? 'end' : 'middle';
    node(
      'text',
      {
        x: x(t),
        y: 237,
        'text-anchor': anchor,
      },
      day.format(new Date(t)),
    );
    if (end - start < 86400000)
      node(
        'text',
        { x: x(t), y: 257, 'text-anchor': anchor },
        new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(
          new Date(t),
        ),
      );
  }
  node('polyline', {
    points: rows.map((p) => `${x(Date.parse(p.date))},${y(p.after)}`).join(' '),
    class: 'rating-line',
  });
  const output = el('figcaption', 'ranked-note');
  output.setAttribute('aria-live', 'polite');
  const show = (p) => {
    output.textContent = `${dateLabel(p.date)} · ${number(p.after)} MMR${p.change == null ? '' : ` (${change(p.change)})`}`;
  };
  for (const p of rows) {
    const dot = node('circle', {
      cx: x(Date.parse(p.date)),
      cy: y(p.after),
      r: 5,
      class: 'rating-point',
      tabindex: 0,
      role: 'button',
      'aria-label': `${dateLabel(p.date)} · ${number(p.after)} MMR`,
    });
    for (const event of ['focus', 'pointerenter', 'click']) dot.addEventListener(event, () => show(p));
    dot.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        show(p);
      }
    });
  }
  svg.addEventListener('pointerdown', (event) => {
    const at = ((event.clientX - svg.getBoundingClientRect().left) / svg.getBoundingClientRect().width) * 640;
    show(rows.reduce((a, b) => (Math.abs(x(Date.parse(a.date)) - at) <= Math.abs(x(Date.parse(b.date)) - at) ? a : b)));
  });
  show(rows.at(-1));
  figure.append(svg, output);
  return figure;
}

export function ratingSection(rows, target) {
  target.replaceChildren();
  if (!rows.length) return target.append(note('No settled rated sets yet.'));
  for (const character of new Set(rows.map((row) => row.character))) {
    const chart = ratingChart(rows.filter((row) => row.character === character));
    if (chart) target.append(el('h3', '', character == null ? 'Earlier decisions' : characterName(character)), chart);
  }
  const hasRank = rows.some((row) => rankName(row.rankBefore) || rankName(row.rankAfter));
  const details = el('details', 'ranked-rating-decisions');
  details.append(el('summary', '', 'Rating decisions'));
  details.append(
    table(
      'Newest first',
      ['Date', 'Character', 'MMR', 'Change', ...(hasRank ? ['Rank'] : [])],
      rows.map((row) => {
        const before = rankName(row.rankBefore),
          after = rankName(row.rankAfter);
        return [
          dateLabel(row.date),
          row.character == null ? '' : characterName(row.character),
          number(row.after),
          row.change == null ? '' : change(row.change),
          ...(hasRank
            ? [before && after ? (before === after ? after : `${before} → ${after}`) : after || before || '']
            : []),
        ];
      }),
      { numeric: [2, 3] },
    ),
  );
  target.append(details);
}
