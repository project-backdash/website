// <!-- check-allow: ranked -->
import { fetchRanked, characterName } from '/assets/js/ranked-data.mjs?v=89a7890dfb';
import { showLoading } from '/assets/js/ranked-loading.mjs?v=99f2b86e88';
import { metricBars } from '/assets/js/ranked-metrics.mjs?v=55f1c9861f';
import { section, el, table, number, percent, playerLink, note } from '/assets/js/ranked-ui.mjs?v=c2eca76225';

export function characterPopulation(app, character, region) {
  for (const [endpoint, title] of [
    ['leaderboard', 'Top players'],
    ['rank-distribution', 'Rank distribution'],
  ]) {
    const panel = section(title),
      status = el('p', 'ranked-status'),
      output = el('div');
    showLoading(status);
    panel.append(status, output);
    app.content.append(panel);
    fetchRanked(app.base, endpoint, endpoint, { character, region, limit: endpoint === 'leaderboard' ? 10 : null })
      .then((data) => {
        if (!panel.isConnected) return;
        status.remove();
        if (endpoint === 'leaderboard') {
          if (!data.rows.length) output.append(note('No Ranked players yet.'));
          else
            output.append(
              table(
                `${characterName(character)} players`,
                ['#', 'Player', 'Rank / MMR'],
                data.rows.map((row) => {
                  const rating = el('span', '', row.rank ?? 'Unranked');
                  if (row.mmr != null) rating.append(el('small', 'ranked-sub', number(row.mmr) + ' MMR'));
                  return [number(row.position), playerLink(row.player), rating];
                }),
                { numeric: [0, 2] },
              ),
            );
        } else if (!data.total) output.append(note('No ranked population yet.'));
        else
          output.append(
            metricBars(
              'Character rank distribution',
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
        const link = el('a', '', endpoint === 'leaderboard' ? 'Full leaderboard' : 'All rank details');
        link.href =
          '/stats/' +
          (endpoint === 'leaderboard' ? 'leaderboard' : 'ranks') +
          '/?' +
          new URLSearchParams({ character, ...(region ? { region } : {}) });
        output.append(link);
      })
      .catch((error) => {
        if (panel.isConnected)
          status.textContent = error.status ? error.message : 'Stats are unavailable. Try again shortly.';
      });
  }
}
