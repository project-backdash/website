// <!-- check-allow: ranked -->
import { characterName, RANK_BANDS, CHARACTERS, fetchRanked } from '/assets/js/ranked-data.mjs?v=2fa1825259';
import { el, table, number, percent, note, select, characterOptions } from '/assets/js/ranked-ui.mjs?v=dcce91eb97';
import { gameFilters, gameQuery } from '/assets/js/ranked-filters.mjs?v=a47ec7b13c';
import { summaryFacts, metricBars, metricColumns, viewChoices } from '/assets/js/ranked-metrics.mjs?v=e6c90153d0';
import { characterPopulation } from '/assets/js/ranked-character-population.mjs?v=5325e061a4';

export function charactersView(app) {
  let band = app.band(),
    character = app.params.get('character') || '',
    query = gameQuery(app.params),
    sort = app.params.get('sort') || 'games',
    data,
    activeView = Math.max(0, ['popularity', 'win-rate', 'table', 'characters'].indexOf(app.params.get('view')));
  app.title.parentElement.classList.add('analytics-hero');
  app.title.parentElement.prepend(el('p', 'analytics-eyebrow', 'PROJECT BACKDASH  /  RANKED'));
  app.title.parentElement.querySelector('.lead').textContent = 'Pick rates, win rates and rank distribution.';
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
    const rated = rows.filter((row) => row.winRate != null);
    const strongest = rated.length ? rated.reduce((a, b) => (a.winRate >= b.winRate ? a : b)) : null;
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
              ['Highest win rate', strongest ? characterLink(strongest.character) : '—', strongest ? `${percent(strongest.winRate)} · ${number(strongest.games)} games` : 'No decided games'],
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
      const chart = (field) => {
        const title = field === 'pickRate' ? 'Character popularity' : 'Character win rates';
        const chartRows = [...rows]
            .map((row) => ({
              name: characterName(row.character),
              url: characterLink(row.character).href,
              value: row[field],
              label: percent(row[field]),
              detail: `${number(row.games)} games`,
            }));
        const panel = el('div', 'analytics-chart-content');
        const mobile = metricBars(title, chartRows);
        mobile.classList.add('analytics-mobile-bars');
        panel.append(metricColumns(title, chartRows), mobile);
        return panel;
      };
      const cards = el('ul', 'analytics-characters');
      for (const row of rows) {
        const item = el('li');
        const link = characterLink(row.character);
        link.className = 'analytics-character';
        const symbol = el('span', 'analytics-character-symbol', characterName(row.character).charAt(0));
        symbol.setAttribute('aria-hidden', 'true');
        const info = el('span', 'analytics-character-info');
        info.append(el('strong', '', characterName(row.character)), el('small', '', `${number(row.games)} games`));
        link.replaceChildren(symbol, info, el('span', 'analytics-character-rate', percent(row.winRate)));
        item.append(link);
        cards.append(item);
      }
      const panel = el('section', 'analytics-panel');
      panel.append(el('h2', '', 'Character statistics'), note('Pick rate is each character’s share of all picks. Win rate excludes draws. Bars are scaled to the largest value.'));
      panel.append(viewChoices([
          ['Popularity', chart('pickRate')],
          ['Win rate', chart('winRate')],
          ['Table', statsTable],
          ['Characters', cards],
        ], { initial: activeView, onChange: (index) => {
          activeView = index;
          app.setParam('view', ['popularity', 'win-rate', 'table', 'characters'][index]);
        } }));
      app.content.append(panel);
      const distribution = el('section', 'analytics-panel analytics-distribution');
      distribution.append(el('h2', '', 'Rank distribution'), note('Current ratings by region. Rank band, build and date filters apply to games above.'));
      const output = el('div', 'analytics-distribution-output', 'Loading…');
      distribution.append(output);
      app.content.append(distribution);
      fetchRanked(app.base, 'rank-distribution', 'rank-distribution', { region: query.region, population: 'highest' })
        .then((rankData) => {
          if (!distribution.isConnected) return;
          output.replaceChildren();
          if (!rankData.total) return output.append(note('No rank data for this region yet.'));
          output.append(note(`${number(rankData.total)} players · highest rating per player · bars scaled to the largest rank`), metricBars('Rank distribution', rankData.rows.filter((row) => row.players > 0).map((row) => ({ name: row.rank ?? 'Unranked', value: row.players, label: percent(row.share), detail: `${number(row.players)} ${row.players === 1 ? 'player' : 'players'}` }))));
          const link = el('a', '', 'Explore all ranks');
          link.href = '/stats/ranks/' + (query.region ? '?' + new URLSearchParams({ region: query.region }) : '');
          output.append(link);
        })
        .catch(() => { if (distribution.isConnected) output.textContent = 'Rank data is unavailable right now.'; });
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
    }, { regionContainer: app.filters, onRegionChange: (value) => {
      if (value) query.region = value; else delete query.region;
      app.setParam('region', value);
      load();
    } }),
  );
  load();
}
