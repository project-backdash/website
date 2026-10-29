// <!-- check-allow: ranked -->
import { el } from '/assets/js/ranked-ui.mjs?v=dcce91eb97';

export function summaryFacts(entries) {
  const grid = el('dl', 'ranked-metrics');
  for (const [label, value, detail] of entries) {
    if (value == null) continue;
    const fact = el('div');
    const dd = el('dd');
    dd.append(value instanceof Node ? value : String(value));
    fact.append(el('dt', '', label), dd);
    if (detail) fact.append(el('small', 'ranked-sub', detail));
    grid.append(fact);
  }
  return grid;
}

export function metricBars(title, rows) {
  const list = el('ol', 'ranked-bars');
  list.setAttribute('aria-label', title);
  const max = Math.max(...rows.map((row) => row.value ?? 0), 0);
  for (const row of rows) {
    const item = el('li'),
      label = el(row.url ? 'a' : 'span', 'ranked-bar-label', row.name);
    if (row.url) label.href = row.url;
    if (row.detail) label.append(el('small', 'ranked-sub', row.detail));
    const track = el('span', 'ranked-bar-track'),
      bar = el('span', 'ranked-bar-fill');
    bar.style.width = `${max ? ((row.value ?? 0) / max) * 100 : 0}%`;
    track.setAttribute('aria-hidden', 'true');
    track.append(bar);
    item.append(label, track, el('strong', 'num', row.label));
    list.append(item);
  }
  return list;
}

export function metricColumns(title, rows) {
  const wrap = el('div', 'analytics-columns-wrap');
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', title);
  const list = el('ol', 'analytics-columns');
  list.style.setProperty('--column-count', String(rows.length));
  const max = Math.max(...rows.map((row) => row.value ?? 0), 0);
  for (const row of rows) {
    const item = el('li');
    const link = el('a', 'analytics-column');
    link.href = row.url;
    link.setAttribute('aria-label', `${row.name}: ${row.label}, ${row.detail}`);
    link.title = `${row.name}: ${row.label} · ${row.detail}`;
    const barArea = el('span', 'analytics-column-area');
    const bar = el('span', 'analytics-column-fill');
    bar.style.height = `${max ? ((row.value ?? 0) / max) * 100 : 0}%`;
    barArea.append(bar);
    link.append(el('span', 'analytics-column-value', row.label), barArea, el('span', 'analytics-column-name', row.name));
    item.append(link);
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

export function viewChoices(views, { initial = 0, onChange = () => {} } = {}) {
  const wrapper = el('div'),
    nav = el('div', 'ranked-view-choices');
  nav.setAttribute('role', 'group');
  nav.setAttribute('aria-label', 'Display');
  const buttons = [];
  for (const [index, [label, panel]] of views.entries()) {
    const button = el('button', 'btn', label);
    button.type = 'button';
    const show = () => {
      views.forEach(([, node], i) => {
        node.hidden = index !== i;
        buttons[i].setAttribute('aria-pressed', String(index === i));
      });
      onChange(index);
    };
    button.addEventListener('click', show);
    buttons.push(button);
    nav.append(button);
    panel.hidden = index !== initial;
    button.setAttribute('aria-pressed', String(index === initial));
  }
  wrapper.append(nav, ...views.map(([, panel]) => panel));
  return wrapper;
}
