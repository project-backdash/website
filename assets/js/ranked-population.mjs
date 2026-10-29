// <!-- check-allow: ranked -->
import { CHARACTERS } from '/assets/js/ranked-data.mjs?v=2fa1825259';
import { REGIONS } from '/assets/js/ranked-filters.mjs?v=a47ec7b13c';
import { el, select, characterOptions, table, number, percent, note } from '/assets/js/ranked-ui.mjs?v=dcce91eb97';
import { summaryFacts, metricBars } from '/assets/js/ranked-metrics.mjs?v=e6c90153d0';

export function populationView(app) {
  let character = app.params.get('character') || '',
    region = app.params.get('region') || '',
    population = app.params.get('population') === 'characters' ? 'characters' : 'highest';
  const load = () =>
    app.load('rank-distribution', { character, region, population }, (data) => {
      app.content.append(
        note(
          `${number(data.total)} ${data.unit === 'players' ? 'players' : 'player / character entries'} · Provisional ratings included.`,
        ),
      );
      if (!data.total) return app.content.append(note('No ranked population for these filters yet.'));
      const largest = data.rows.reduce((a, b) => (a.players >= b.players ? a : b));
      app.content.append(
        summaryFacts([
          ['Population', number(data.total)],
          ['Most common rank', largest.rank ?? 'Unranked', percent(largest.share)],
        ]),
      );
      app.content.append(
        metricBars(
          'Rank distribution',
          data.rows
            .filter((row) => row.players > 0)
            .map((row) => ({
              name: row.rank ?? 'Unranked',
              value: row.players,
              label: percent(row.share),
              detail: `${number(row.players)} players`,
            })),
        ),
      );
      const allRanks = el('details', 'ranked-rating-decisions');
      allRanks.append(el('summary', '', 'All ranks'));
      allRanks.append(
        table(
          'Current rank distribution',
          ['Rank', 'Count', 'Share'],
          data.rows.map((row) => [row.rank ?? 'Unranked', number(row.players), percent(row.share)]),
          { numeric: [1, 2] },
        ),
      );
      app.content.append(allRanks);
      const quantiles = data.rows.filter((row) => row.mmr);
      const ranges = el('details', 'ranked-rating-decisions');
      ranges.append(el('summary', '', 'MMR by rank'));
      ranges.append(
        table(
          'MMR by rank',
          ['Rank', 'Min', '10%', '25%', 'Median', '75%', '90%', 'Max'],
          quantiles.map((row) => [
            row.rank ?? 'Unranked',
            ...['min', 'p10', 'p25', 'p50', 'p75', 'p90', 'max'].map((key) => number(row.mmr[key])),
          ]),
          { numeric: [1, 2, 3, 4, 5, 6, 7], wide: true },
        ),
        note(
          'These are current ratings across the complete selected population. Each player counts once at their highest matching character unless All characters per player is selected.',
        ),
      );
      app.content.append(ranges);
    });
  app.filters.append(
    select('Character', [['', 'All characters'], ...characterOptions(CHARACTERS)], character, (value) => {
      character = value;
      app.setParam('character', value);
      load();
    }),
    select('Region', REGIONS, region, (value) => {
      region = value;
      app.setParam('region', value);
      load();
    }),
    select(
      'Count',
      [
        ['highest', 'Highest character per player'],
        ['characters', 'All characters per player'],
      ],
      population,
      (value) => {
        population = value;
        app.setParam('population', value);
        load();
      },
    ),
  );
  load();
}
