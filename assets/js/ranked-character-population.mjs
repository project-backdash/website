// <!-- check-allow: ranked -->
// A character's page closes with who plays it: its top ten, drawn as Home's Top players (the Ranked board, filtered
// to the character, is a click away), and where its players stand, one bar per badge.
import { fetchRanked } from '/assets/js/ranked-data.mjs?v=dde3981e98';
import { showLoading } from '/assets/js/ranked-loading.mjs?v=78371fcc9f';
import { metricBars } from '/assets/js/ranked-metrics.mjs?v=1a1faaeb43';
import { plate } from '/assets/js/ranked-kit.mjs?v=f30d870cde';
import { drawTopPlayers } from '/assets/js/top-players.mjs?v=3bdf392edc';
import { el, count, percent, note } from '/assets/js/ranked-ui.mjs?v=8b024de9ed';

// A section's head: the tab, and a "more" link at its right.
function head(title, more, href) {
  const node = el('div', 'sec-head');
  const link = el('a', 'more-link', more);
  link.href = href;
  node.append(el('h2', 'label-tab sec-tab', title), link);
  return node;
}

export function characterPopulation(app, character, region) {
  const where = new URLSearchParams({ character, ...(region ? { region } : {}) });

  const top = el('section', 'sec');
  const list = el('ol', 'top-players panel');
  const waiting = el('li', 'top-msg');
  showLoading(waiting);
  list.append(waiting);
  top.append(head('Top players', 'Ranked board', '/ranked/?' + where), list);
  app.content.append(top);
  fetchRanked(app.base, 'leaderboard', 'leaderboard', { character, region, limit: 10 })
    .then((data) => {
      if (list.isConnected) drawTopPlayers(list, data.rows, 'No Ranked players yet.');
    })
    .catch((error) => {
      if (list.isConnected)
        drawTopPlayers(list, [], error.status ? error.message : 'Stats are unavailable. Try again shortly.');
    });

  const ranks = el('section', 'sec');
  const body = el('div', 'panel stats-panel');
  const status = el('p', 'ranked-status');
  showLoading(status);
  body.append(status);
  ranks.append(head('Rank distribution', 'All rank details', '/stats/ranks/?' + where), body);
  app.content.append(ranks);
  fetchRanked(app.base, 'rank-distribution', 'rank-distribution', { character, region })
    .then((data) => {
      if (!body.isConnected) return;
      status.remove();
      if (!data.total) return body.append(note('No ranked population yet.'));
      body.append(
        metricBars(
          'Character rank distribution',
          data.rows
            .filter((row) => row.players > 0)
            .map((row) => ({
              name: row.rank ?? 'Unranked',
              image: plate(row.rankId),
              value: row.players,
              label: percent(row.share),
              detail: count(row.players, 'player'),
            })),
        ),
      );
    })
    .catch((error) => {
      if (body.isConnected)
        status.textContent = error.status ? error.message : 'Stats are unavailable. Try again shortly.';
    });
}
