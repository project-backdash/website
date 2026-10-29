// <!-- check-allow: ranked -->
// <!-- check-allow: profiles -->
import { fetchRanked, characterName } from '/assets/js/ranked-data.mjs?v=2fa1825259';
import { gameFilters, gameQuery } from '/assets/js/ranked-filters.mjs?v=a47ec7b13c';
import { showLoading } from '/assets/js/ranked-loading.mjs?v=99f2b86e88';
import {
  el,
  select,
  characterOptions,
  table,
  number,
  percent,
  note,
  playerLink,
  dateLabel,
} from '/assets/js/ranked-ui.mjs?v=dcce91eb97';

export function profileFilters(app, characters, onChange) {
  let query = {
    ...gameQuery(app.params),
    character: app.params.get('playedCharacter') || '',
    result: app.params.get('result') || '',
    opponent: app.params.get('opponent') || '',
  };
  const bar = app.filters;
  bar.classList.add('ranked-profile-filters');
  bar.replaceChildren(
    select('Character', [['', 'All characters'], ...characterOptions(characters)], query.character, (value) => {
      query = { ...query, character: value };
      app.setParam('playedCharacter', value);
      onChange(query);
    }),
    gameFilters(
      app,
      (values) => {
        query = { character: query.character, ...values };
        onChange(query);
      },
      { match: true },
    ),
  );
  return () => query;
}

export function playedQuery(query) {
  return Object.fromEntries(
    ['character', 'region', 'build', 'from', 'to'].filter((key) => query[key]).map((key) => [key, query[key]]),
  );
}

export function profileAggregates(app, endpoint, getQuery) {
  const refreshers = [];
  for (const [kind, title] of [
    ['activity', 'Activity'],
    ['matchups', 'Matchups'],
    ['head-to-head', 'Head to head'],
  ]) {
    const panel = el('details', 'ranked-aggregate section');
    panel.id = 'profile-' + kind;
    const summary = el('summary');
    summary.append(el('h2', 'label-tab', title));
    panel.append(summary);
    const body = el('div'),
      output = el('div'),
      status = el('p', 'ranked-note');
    status.setAttribute('role', 'status');
    body.append(status, output);
    panel.append(body);
    app.content.append(panel);
    let loaded = false,
      pending;
    const load = async () => {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      showLoading(status);
      output.replaceChildren();
      try {
        const data = await fetchRanked(
          app.base,
          endpoint + '/' + kind,
          kind === 'matchups' ? 'player-matchups' : kind,
          { ...playedQuery(getQuery()), ...(kind === 'head-to-head' ? { opponent: getQuery().opponent } : {}) },
          controller.signal,
        );
        if (pending !== controller) return;
        loaded = true;
        status.textContent = `${number(data.totalGames)} games in the complete selection.`;
        if (!data.rows.length) {
          output.append(note('No agreed games for these filters yet.'));
          return;
        }
        if (kind === 'activity')
          output.append(
            table(
              'Daily games (UTC)',
              ['Date', 'Games', 'Wins', 'Losses', 'Draws'],
              data.rows.map((row) => [
                row.date,
                number(row.games),
                number(row.wins),
                number(row.losses),
                number(row.draws),
              ]),
              { numeric: [1, 2, 3, 4] },
            ),
            note('Only days with recorded games are listed. Other days have zero games.'),
          );
        if (kind === 'matchups')
          output.append(
            table(
              'Player character matchups',
              ['Character', 'Opponent character', 'Games', 'Win rate'],
              data.rows.map((row) => [
                characterName(row.character),
                characterName(row.opponentCharacter),
                number(row.games),
                percent(row.winRate),
              ]),
              { numeric: [2, 3] },
            ),
          );
        if (kind === 'head-to-head')
          output.append(
            table(
              'Opponent records',
              ['Opponent', 'Record', 'Win rate'],
              data.rows.map((row) => {
                const opponent = el('div');
                const last = el(
                  'small',
                  'ranked-sub',
                  new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
                    new Date(row.lastPlayedAt),
                  ),
                );
                last.title = 'Last played: ' + dateLabel(row.lastPlayedAt);
                opponent.append(playerLink(row.opponent), last);
                const record = el(
                  'span',
                  '',
                  `${number(row.wins)}W ${number(row.losses)}L${row.draws ? ` ${number(row.draws)}D` : ''}`,
                );
                record.append(el('small', 'ranked-sub', `${number(row.games)} games`));
                return [opponent, record, percent(row.winRate)];
              }),
              { numeric: [1, 2] },
            ),
          );
      } catch (error) {
        if (pending !== controller) return;
        status.textContent = error.status
          ? error.message
          : 'Stats are unavailable. Close and open this section to try again.';
        loaded = false;
      }
    };
    refreshers.push(() => {
      pending?.abort();
      pending = null;
      loaded = false;
      output.replaceChildren();
      if (panel.open) load();
    });
    panel.addEventListener('toggle', () => {
      if (panel.open && !loaded) load();
    });
  }
  return () => refreshers.forEach((refresh) => refresh());
}
