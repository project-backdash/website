// <!-- check-allow: ranked -->
import { fetchRanked } from '/assets/js/ranked-data.mjs?v=2fa1825259';
import { el, select } from '/assets/js/ranked-ui.mjs?v=dcce91eb97';

export const REGIONS = [
  ['', 'All regions'],
  ['na', 'North America'],
  ['sa', 'South America'],
  ['eu', 'Europe'],
  ['af', 'Africa'],
  ['asia', 'Asia'],
  ['oceania', 'Oceania'],
  ['other', 'Other'],
];
export const gameQuery = (params) =>
  Object.fromEntries(
    ['region', 'build', 'from', 'to'].filter((key) => params.get(key)).map((key) => [key, params.get(key)]),
  );

export function gameFilters(app, onApply, { match = false, opponent = false, regionContainer = null, onRegionChange = null } = {}) {
  const details = el('details', 'ranked-filter-panel');
  details.append(el('summary', '', 'More filters'));
  const form = el('form', 'ranked-filters');
  const query = gameQuery(app.params);
  const region = select('Game region', REGIONS, query.region || '', (value) => {
    query.region = value;
    onRegionChange?.(value);
  });
  (regionContainer || form).append(region);
  const builds = select(
    'Build',
    [['', 'All builds'], ...(query.build ? [[query.build, query.build]] : [])],
    query.build || '',
    (value) => {
      query.build = value;
    },
  );
  form.append(builds);
  for (const [key, title] of [
    ['from', 'From (UTC)'],
    ['to', 'To (UTC)'],
    ...(match || opponent ? [['opponent', 'Opponent name or Name#tag']] : []),
  ]) {
    const label = el('label', 'ranked-field', title),
      input = el('input');
    input.type = key === 'opponent' ? 'search' : 'date';
    input.setAttribute('aria-label', title);
    input.value = app.params.get(key) || '';
    input.name = key;
    if (key === 'opponent') input.maxLength = 45;
    query[key] = input.value;
    input.addEventListener('input', () => {
      query[key] = input.value;
    });
    label.append(input);
    form.append(label);
  }
  if (match) {
    query.result = app.params.get('result') || '';
    form.append(
      select(
        'Result',
        [
          ['', 'All results'],
          ['win', 'Win'],
          ['loss', 'Loss'],
          ['draw', 'Draw'],
        ],
        query.result,
        (value) => {
          query.result = value;
        },
      ),
    );
  }
  const apply = el('button', 'btn', 'Apply filters');
  apply.type = 'submit';
  form.append(apply);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (query.from && query.to && query.from > query.to) {
      app.status.textContent = 'Choose an end date after the start date.';
      return;
    }
    for (const [key, value] of Object.entries(query)) app.setParam(key, value);
    onApply(Object.fromEntries(Object.entries(query).filter(([, value]) => value)));
  });
  details.append(form);
  let fetched = false;
  details.addEventListener('toggle', async () => {
    if (!details.open || fetched) return;
    try {
      const data = await fetchRanked(app.base, 'filters', 'filters');
      const control = builds.querySelector('select'),
        selected = control.value;
      for (const build of data.builds)
        if (![...control.options].some((option) => option.value === build)) {
          const option = el('option', '', build);
          option.value = build;
          control.append(option);
        }
      control.value = selected;
      fetched = true;
    } catch {
      /* Existing selections remain usable when filter discovery is unavailable. */
    }
  });
  return details;
}
