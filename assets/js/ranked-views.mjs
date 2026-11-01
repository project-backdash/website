// <!-- check-allow: ranked -->
import { characterName, RANK_BANDS, CHARACTERS } from '/assets/js/ranked-data.mjs?v=dde3981e98';
import { gameFilters, gameQuery } from '/assets/js/ranked-filters.mjs?v=1c45537d0e';
import { showLoading } from '/assets/js/ranked-loading.mjs?v=78371fcc9f';
import { summaryFacts, metricBars } from '/assets/js/ranked-metrics.mjs?v=1a1faaeb43';
import {
  el,
  table,
  number,
  count,
  percent,
  note,
  playerLink,
  select,
  characterOptions,
} from '/assets/js/ranked-ui.mjs?v=8b024de9ed';

export function playersView(app) {
  // The Ranked board's big search box; Enter searches (a form with one field submits on Enter).
  const form = el('form', 'rk-search ranked-search-form');
  form.method = 'get';
  form.action = '/stats/players/';
  form.setAttribute('role', 'search');
  const label = el('label', 'rk-search-box');
  label.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6"/></svg>';
  const input = el('input');
  input.name = 'q';
  input.type = 'search';
  input.maxLength = 45;
  input.required = true;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = 'Name, or Name#tag';
  input.setAttribute('aria-label', 'Player name or Name#tag');
  input.value = app.params.get('q') || '';
  const inline = el('span', 'ranked-search-inline');
  inline.setAttribute('aria-hidden', 'true');
  inline.hidden = true;
  label.append(input, inline);
  form.append(label);
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
      const list = el('ul', 'ranked-results panel');
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
  // "/" goes to this box, as on the board: the bar's search is hidden here, so the page has one.
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
      return;
    event.preventDefault();
    input.focus();
  });
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
              detail: `${number(row.wins)}W ${number(row.losses)}L${row.draws ? ` ${number(row.draws)}D` : ''} · ${count(row.games, 'game')}`,
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
              cell.append(el('small', '', count(row.games, 'game')));
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
