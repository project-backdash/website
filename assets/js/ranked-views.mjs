// <!-- check-allow: ranked -->
import { characterName, RANK_BANDS, CHARACTERS, fetchRanked } from '/assets/js/ranked-data.mjs?v=89a7890dfb';
import { gameFilters, gameQuery } from '/assets/js/ranked-filters.mjs?v=f183e44333';
import { showLoading } from '/assets/js/ranked-loading.mjs?v=99f2b86e88';
import { summaryFacts, metricBars } from '/assets/js/ranked-metrics.mjs?v=55f1c9861f';
import { el, table, number, percent, note, playerLink, select, characterOptions } from '/assets/js/ranked-ui.mjs?v=c2eca76225';

export function playersView(app) {
  const form = el('form', 'ranked-filters ranked-search-form');
  form.method = 'get';
  form.action = '/stats/players/';
  const label = el('label', 'ranked-field ranked-search', 'Player name or Name#tag');
  const input = el('input');
  input.name = 'q';
  input.type = 'search';
  input.maxLength = 45;
  input.required = true;
  input.autocomplete = 'off';
  input.value = app.params.get('q') || '';
  label.append(input);
  const button = el('button', 'btn-primary', 'Search');
  button.type = 'submit';
  const inline = el('span', 'ranked-search-inline');
  inline.setAttribute('aria-hidden', 'true');
  inline.hidden = true;
  form.append(label, button, inline);
  form.append(app.status);
  app.filters.append(form);
  let searchGeneration = 0;
  const search = async () => {
    const current = ++searchGeneration;
    showLoading(inline, '', true);
    inline.removeAttribute('role');
    inline.hidden = false;
    await app.load('players', { q: input.value.trim(), limit: 20 }, (data) => {
      if (!data.players.length) return app.content.append(note('No players found.'));
      const list = el('ul', 'ranked-results');
      for (const player of data.players) {
        const row = el('li');
        row.append(playerLink(player));
        list.append(row);
      }
      app.content.append(list);
    });
    if (current === searchGeneration) inline.hidden = true;
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const q = input.value.trim();
    if (!q || q.replace(/#\d{4}$/, '').length > 40)
      return (app.status.textContent = 'Enter a name up to 40 characters, with an optional #tag.');
    app.setParam('q', q);
    search();
  });
  if (input.value.trim()) search();
  else app.status.textContent = 'Find a player with a Ranked rating.';
}

export function matchupsView(app) {
  let band = app.band(),
    character = app.params.get('character') || '',
    query = gameQuery(app.params),
    data,
    initial = true;
  const characterFilter = select(
    'Your character',
    [['', 'All characters'], ...characterOptions(CHARACTERS)],
    character,
    (value) => {
      character = value;
      app.setParam('character', value);
      render();
    },
  );
  const render = () => {
    if (!data) return;
    app.content.replaceChildren();
    const rows = data.rows.filter((row) => !character || row.character === character);
    if (!rows.length) return app.content.append(note('No Ranked games for this matchup yet.'));
    const games = rows.reduce((sum, row) => sum + row.games, 0);
    app.content.append(
      summaryFacts([
        [character ? 'Games' : 'Character games', number(games)],
        ['Character', character ? characterName(character) : 'All characters'],
        ['Matchups', number(rows.length)],
      ]),
    );
    if (character)
      app.content.append(
        metricBars(
          `${characterName(character)} matchups`,
          [...rows]
            .sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1))
            .map((row) => ({
              name: characterName(row.opponentCharacter),
              url: '/stats/characters/?character=' + row.opponentCharacter,
              value: row.winRate,
              label: percent(row.winRate),
              detail: `${number(row.wins)}W ${number(row.losses)}L${row.draws ? ` ${number(row.draws)}D` : ''} · ${number(row.games)} games`,
            })),
        ),
      );
    else {
      const ids = [...new Set(data.rows.flatMap((row) => [row.character, row.opponentCharacter]))].sort((a, b) =>
        characterName(a).localeCompare(characterName(b)),
      );
      const cells = new Map(data.rows.map((row) => [row.character + ':' + row.opponentCharacter, row]));
      const matrix = table(
        'Matchup win rates · row against column',
        ['Character', ...ids.map(characterName)],
        ids.map((id) => [
          characterName(id),
          ...ids.map((other) => {
            const row = cells.get(id + ':' + other);
            const cell = el('span', 'ranked-matchup', row ? percent(row.winRate) : '—');
            if (row) {
              cell.append(el('small', '', `${number(row.games)} games`));
              cell.dataset.result = row.winRate === null ? 'unknown' : row.winRate >= 0.5 ? 'positive' : 'negative';
            }
            return cell;
          }),
        ]),
        { wide: true },
      );
      matrix.classList.add('ranked-matrix');
      app.content.append(matrix);
    }
    app.content.append(
      note('Win rates exclude draws. — means no decided games. Rank band uses the row player’s rank before the set.'),
    );
    if (!character) app.content.append(note('Choose your character for a compact opponent list.'));
  };
  const load = () => {
    data = null;
    app.load('matchups', { rankBand: band, ...query }, (answer) => {
      data = answer;
      if (initial && !character && matchMedia('(max-width: 599px)').matches && data.rows.length) {
        character = [...data.rows].sort((a, b) => b.games - a.games || a.character.localeCompare(b.character))[0]
          .character;
        characterFilter.querySelector('select').value = character;
        app.setParam('character', character);
      }
      initial = false;
      render();
    });
  };
  app.filters.append(
    select('Rank band', RANK_BANDS, band, (value) => {
      band = value;
      app.setParam('rankBand', value);
      load();
    }),
    characterFilter,
  );
  app.filters.append(
    gameFilters(app, (values) => {
      query = values;
      load();
    }),
  );
  load();
}

export function leaderboardView(app) {
  let character = app.params.get('character') || '',
    region = app.params.get('region') || '';
  let rows = [],
    cursor = null,
    total = null,
    generation = 0;
  const render = (data) => {
    rows = data.rows;
    cursor = data.nextCursor;
    total = data.total;
    if (!data.rows.length) return app.content.append(note('No Ranked players for these filters yet.'));
    const board = table(
      'Leaderboard · set results',
      ['#', 'Player / character', 'Rank', 'MMR', 'Wins', 'Losses', 'Region'],
      data.rows.map((row) => {
        const player = el('div');
        player.append(playerLink(row.player));
        if (row.player.avatarCharacter !== row.character)
          player.append(el('small', 'ranked-sub', `Ranked: ${characterName(row.character)}`));
        player.append(
          el(
            'small',
            'ranked-sub ranked-mobile',
            `${row.rank ?? 'Unranked'}${row.provisional ? ' · Provisional' : ''} · ${number(row.wins)}W ${number(row.losses)}L · ${row.region?.toUpperCase() || '—'}`,
          ),
        );
        const rank = el('span', '', row.rank ?? 'Unranked');
        if (row.provisional === true) rank.append(el('small', 'ranked-sub', 'Provisional'));
        return [
          number(row.position),
          player,
          rank,
          number(row.mmr),
          number(row.wins),
          number(row.losses),
          row.region?.toUpperCase() ?? '—',
        ];
      }),
      { numeric: [0, 3, 4, 5] },
    );
    board.classList.add('ranked-board');
    app.content.append(board);
    if (total != null)
      app.content.append(note(`${number(rows.length)} of ${number(total)} player / character entries`));
    if (cursor) {
      const more = el('button', 'btn', 'More players');
      more.type = 'button';
      more.addEventListener('click', async () => {
        more.disabled = true;
        showLoading(app.status);
        const current = generation;
        try {
          const answer = await fetchRanked(app.base, 'leaderboard', 'leaderboard', {
            character,
            region,
            limit: 100,
            cursor,
          });
          if (current !== generation) return;
          if (answer.updatedAt !== data.updatedAt) {
            load();
            return;
          }
          app.content.replaceChildren();
          render({ ...answer, rows: [...rows, ...answer.rows] });
          app.status.textContent = 'Loaded.';
        } catch (error) {
          if (current !== generation) return;
          if (error.status === 400) {
            load();
          } else app.status.textContent = error.message;
        } finally {
          more.disabled = false;
        }
      });
      app.content.append(more);
    }
  };
  const load = () => {
    generation++;
    return app.load('leaderboard', { character, region, limit: 100 }, render);
  };
  app.filters.append(
    select('Character', [['', 'All characters'], ...characterOptions(CHARACTERS)], character, (value) => {
      character = value;
      app.setParam('character', value);
      load();
    }),
    select(
      'Region',
      [
        ['', 'All regions'],
        ['na', 'North America'],
        ['sa', 'South America'],
        ['eu', 'Europe'],
        ['af', 'Africa'],
        ['asia', 'Asia'],
        ['oceania', 'Oceania'],
        ['other', 'Other'],
      ],
      region,
      (value) => {
        region = value;
        app.setParam('region', value);
        load();
      },
    ),
  );
  load();
}
