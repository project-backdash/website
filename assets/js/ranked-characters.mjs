// <!-- check-allow: ranked -->
import { characterName, RANK_BANDS, CHARACTERS } from '/assets/js/ranked-data.mjs?v=89a7890dfb';
import { el, table, number, percent, note, select, characterOptions } from '/assets/js/ranked-ui.mjs?v=c2eca76225';
import { gameFilters, gameQuery } from '/assets/js/ranked-filters.mjs?v=f183e44333';
import { summaryFacts, metricBars, viewChoices } from '/assets/js/ranked-metrics.mjs?v=55f1c9861f';
import { characterPopulation } from '/assets/js/ranked-character-population.mjs?v=5c73e9c8c2';

export function charactersView(app) {
  let band = app.band(),
    character = app.params.get('character') || '',
    query = gameQuery(app.params),
    sort = app.params.get('sort') || 'games',
    data;
  const render = () => {
    if (!data) return;
    app.content.replaceChildren();
    const rows = [...(data.rows || [data])]
      .filter((row) => !character || row.character === character)
      .sort((a, b) =>
        sort === 'name'
          ? characterName(a.character).localeCompare(characterName(b.character))
          : (b[sort] ?? -1) - (a[sort] ?? -1) || a.character.localeCompare(b.character),
      );
    if (!rows.length || (character && !data.games))
      return app.content.append(note('No Ranked games for these filters yet.'));
    const characterLink = (id) => {
      const link = el('a', '', characterName(id));
      const search = new URLSearchParams({ ...query, character: id });
      if (band !== 'all') search.set('rankBand', band);
      link.href = '/stats/characters/?' + search;
      return link;
    };
    const popular = rows.reduce((a, b) => (a.games >= b.games ? a : b));
    const strongest = rows.reduce((a, b) => ((a.winRate ?? -1) >= (b.winRate ?? -1) ? a : b));
    const decided = (data.matchups || []).filter((row) => row.winRate != null).sort((a, b) => b.winRate - a.winRate);
    app.content.append(
      summaryFacts(
        character
          ? [
              ['Games', number(data.games)],
              ['Players', number(data.players)],
              ['Win rate', percent(data.winRate), `${number(data.wins)}W ${number(data.losses)}L`],
              ['Pick rate', percent(data.pickRate)],
              ['Mains', percent(data.mainShare), `${number(data.mains)} ${data.mains === 1 ? 'player' : 'players'}`],
              ['Median rank', data.medianRank],
            ]
          : [
              ['Picks', number(data.totalPicks)],
              ['Characters played', number(rows.length)],
              ['Most picked', characterLink(popular.character), percent(popular.pickRate)],
              ['Highest win rate', characterLink(strongest.character), percent(strongest.winRate)],
            ],
      ),
    );
    const statsTable = table(
      character ? characterName(character) : 'Character stats',
      ['Character', 'Games', 'Pick rate', 'Win rate'],
      rows.map((row) => {
        const link = el('a', '', characterName(row.character));
        const search = new URLSearchParams({ ...query, character: row.character });
        if (band !== 'all') search.set('rankBand', band);
        link.href = '/stats/characters/?' + search.toString();
        return [link, number(row.games), percent(row.pickRate), percent(row.winRate)];
      }),
      { numeric: [1, 2, 3] },
    );
    if (!character) {
      const bars = (field) =>
        metricBars(
          field === 'pickRate' ? 'Character popularity' : 'Character win rates',
          [...rows]
            .sort((a, b) => (b[field] ?? -1) - (a[field] ?? -1))
            .map((row) => ({
              name: characterName(row.character),
              url: characterLink(row.character).href,
              value: row[field],
              label: percent(row[field]),
              detail: `${number(row.games)} games`,
            })),
        );
      app.content.append(
        viewChoices([
          ['Popularity', bars('pickRate')],
          ['Win rate', bars('winRate')],
          ['Table', statsTable],
        ]),
      );
    }
    app.content.append(note('Each side counts as one pick. Win rates exclude draws.'));
    if (character) {
      app.title.textContent = characterName(character);
      const back = el('a', '', 'All characters');
      back.href = '/stats/characters/';
      app.content.prepend(back);
      if (data.daily.length)
        app.content.append(
          table(
            'Daily rates (UTC)',
            ['Date', 'Games', 'Pick rate', 'Win rate'],
            data.daily.map((row) => [row.date, number(row.games), percent(row.pickRate), percent(row.winRate)]),
            { numeric: [1, 2, 3] },
          ),
        );
      if (data.matchups.length)
        app.content.append(
          el('h2', 'label-tab', 'Matchups'),
          summaryFacts(
            decided.length
              ? [
                  ['Best matchup', characterLink(decided[0].opponentCharacter), percent(decided[0].winRate)],
                  [
                    'Toughest matchup',
                    characterLink(decided.at(-1).opponentCharacter),
                    percent(decided.at(-1).winRate),
                  ],
                ]
              : [],
          ),
          table(
            'Character matchups',
            ['Opponent', 'Games', 'Win rate'],
            data.matchups.map((row) => [characterName(row.opponentCharacter), number(row.games), percent(row.winRate)]),
            { numeric: [1, 2] },
          ),
        );
      const nav = el('nav', 'ranked-nav');
      nav.setAttribute('aria-label', 'Character statistics');
      for (const [path, title] of [
        ['matchups', 'Matchups'],
        ['leaderboard', 'Leaderboard'],
      ]) {
        const link = el('a', '', title),
          search = new URLSearchParams({
            character,
            ...(path === 'matchups' ? query : query.region ? { region: query.region } : {}),
          });
        if (path === 'matchups' && band !== 'all') search.set('rankBand', band);
        link.href = `/stats/${path}/?${search}`;
        nav.append(link);
      }
      app.content.append(nav);
      app.content.append(
        note('Mains use the most-played character in this selection. Median rank uses current character badges.'),
      );
      app.content.append(note('Player rankings and rank distribution use current ratings.'));
      characterPopulation(app, character, query.region);
    }
  };
  const load = () => {
    data = null;
    app.title.textContent = character ? characterName(character) : 'Characters';
    app.load(
      character ? 'characters/' + encodeURIComponent(character) : 'characters',
      { rankBand: band, ...query },
      (answer) => {
        data = answer;
        render();
      },
      character ? 'character-detail' : 'characters',
    );
  };
  app.filters.append(
    select('Rank band', RANK_BANDS, band, (value) => {
      band = value;
      app.setParam('rankBand', value);
      load();
    }),
    select('Character', [['', 'All characters'], ...characterOptions(CHARACTERS)], character, (value) => {
      character = value;
      app.setParam('character', value);
      load();
    }),
    select(
      'Sort by',
      [
        ['games', 'Most played'],
        ['pickRate', 'Pick rate'],
        ['winRate', 'Win rate'],
        ['name', 'Name'],
      ],
      sort,
      (value) => {
        sort = value;
        app.setParam('sort', value);
        render();
      },
    ),
  );
  app.filters.append(
    gameFilters(app, (values) => {
      query = values;
      load();
    }),
  );
  load();
}
