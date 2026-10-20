// <!-- check-allow: ranked -->
import { el } from '/assets/js/ranked-ui.mjs?v=c2eca76225';

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

export function viewChoices(views) {
  const wrapper = el('div'),
    nav = el('div', 'ranked-view-choices');
  nav.setAttribute('role', 'group');
  nav.setAttribute('aria-label', 'Display');
  const buttons = [];
  for (const [index, [label, panel]] of views.entries()) {
    const button = el('button', 'btn', label);
    button.type = 'button';
    const show = () =>
      views.forEach(([, node], i) => {
        node.hidden = index !== i;
        buttons[i].setAttribute('aria-pressed', String(index === i));
      });
    button.addEventListener('click', show);
    buttons.push(button);
    nav.append(button);
    panel.hidden = index !== 0;
    button.setAttribute('aria-pressed', String(index === 0));
  }
  wrapper.append(nav, ...views.map(([, panel]) => panel));
  return wrapper;
}
