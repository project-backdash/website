// <!-- check-allow: ranked -->
// <!-- check-allow: profiles -->
import { characterName, profileEndpoint, fetchRanked } from '/assets/js/ranked-data.mjs?v=2fa1825259';
import { profileAggregates, profileFilters, playedQuery } from '/assets/js/ranked-profile-extra.mjs?v=4a1c93bafe';
import { profileSummary } from '/assets/js/ranked-profile-summary.mjs?v=da08f38759';
import { ratingSection } from '/assets/js/ranked-rating.mjs?v=55c042d0fb';
import { matchRow } from '/assets/js/ranked-game.mjs?v=2fe03cbea2';
import { showLoading } from '/assets/js/ranked-loading.mjs?v=99f2b86e88';
import { profileTabs } from '/assets/js/ranked-profile-tabs.mjs?v=d4ecbad60a';
import { el, table, number, percent, note, section } from '/assets/js/ranked-ui.mjs?v=dcce91eb97';

function paginate(app, parent, label, endpoint, kind, getCursor, receive, getQuery = () => ({})) {
  const button = el('button', 'btn ranked-more', label);
  button.type = 'button';
  button.hidden = !getCursor();
  button.addEventListener('click', async () => {
    button.disabled = true;
    showLoading(app.status);
    const cursor = getCursor(),
      query = getQuery();
    try {
      const result = await fetchRanked(app.base, endpoint, kind, { ...query, cursor, limit: 20 });
      if (cursor !== getCursor() || JSON.stringify(query) !== JSON.stringify(getQuery())) return;
      receive(result);
      button.hidden = !getCursor();
      app.status.textContent = 'Loaded.';
    } catch (error) {
      app.status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  parent.append(button);
  return button;
}

export function profileView(app, player) {
  const endpoint = profileEndpoint(player);
  app.load(
    endpoint,
    {},
    (data) => {
      app.title.textContent = `${data.player.name}#${data.player.tag}`;
      profileSummary(app.title, data);
      document.title = `${app.title.textContent} | Project Backdash`;
      const characters = section('Characters');
      characters.id = 'profile-characters';
      const characterRecords = el('div');
      characters.append(characterRecords);
      const drawCharacters = (rows) => {
        characterRecords.replaceChildren();
        if (!rows.length) characterRecords.append(note('No recorded characters for this selection.'));
        else
          characterRecords.append(
            table(
              'Played characters',
              ['Character', 'Rank / MMR', 'Games', 'Win rate'],
              rows.map((row) => [
                characterName(row.character),
                [
                  row.rank ?? 'Unranked',
                  row.mmr == null ? null : number(row.mmr),
                  row.provisional ? 'Provisional' : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
                number(row.games),
                (() => {
                  const record = el('span', '', percent(row.winRate));
                  record.append(el('small', 'ranked-sub', `${number(row.wins)}W ${number(row.losses)}L`));
                  return record;
                })(),
              ]),
              { numeric: [2, 3] },
            ),
          );
      };
      drawCharacters(data.characters);
      app.content.append(characters);
      const history = section('Rating history');
      history.id = 'profile-rating';
      const plot = el('div');
      history.append(plot);
      let points = data.ratingHistory,
        ratingCursor = data.ratingHistoryCursor;
      let selection = {},
        pending;
      const getSelection = () => selection;
      const ratingQuery = () =>
        Object.fromEntries(
          ['character', 'from', 'to'].filter((key) => selection[key]).map((key) => [key, selection[key]]),
        );
      const drawRating = () => ratingSection(points, plot);
      drawRating();
      const moreRatings = paginate(
        app,
        history,
        'More rating history',
        endpoint + '/rating-history',
        'rating-history',
        () => ratingCursor,
        (answer) => {
          points = [...points, ...answer.rows];
          ratingCursor = answer.nextCursor;
          drawRating();
        },
        ratingQuery,
      );
      app.content.append(history);
      const matches = section('Recent games');
      matches.id = 'profile-games';
      matches.append(note('MMR changes apply to the set and may repeat across its games.'));
      const list = el('ol', 'ranked-games');
      const drawGames = (rows) => {
        list.replaceChildren();
        if (!rows.length) list.append(el('li', 'ranked-note', 'No agreed Ranked games yet.'));
        for (const game of rows) list.append(matchRow(game, data.player));
      };
      drawGames(data.recentMatches);
      let matchesCursor = data.matchesCursor;
      const ids = new Set(data.recentMatches.map((game) => game.id));
      matches.append(list);
      const moreGames = paginate(
        app,
        matches,
        'More games',
        endpoint + '/matches',
        'matches',
        () => matchesCursor,
        (answer) => {
          for (const game of answer.rows)
            if (!ids.has(game.id)) {
              ids.add(game.id);
              list.append(matchRow(game, data.player));
            }
          matchesCursor = answer.nextCursor;
        },
        getSelection,
      );
      app.content.append(matches);
      const refreshAggregates = profileAggregates(app, endpoint, getSelection);
      const refresh = async (query) => {
        selection = { ...query };
        pending?.abort();
        const controller = new AbortController();
        pending = controller;
        refreshAggregates();
        matchesCursor = ratingCursor = null;
        moreGames.hidden = moreRatings.hidden = true;
        list.replaceChildren();
        plot.replaceChildren();
        characterRecords.replaceChildren();
        showLoading(app.status);
        app.content.setAttribute('aria-busy', 'true');
        try {
          const [games, ratings, records] = await Promise.all([
            fetchRanked(app.base, endpoint + '/matches', 'matches', { ...selection, limit: 20 }, controller.signal),
            fetchRanked(
              app.base,
              endpoint + '/rating-history',
              'rating-history',
              { ...ratingQuery(), limit: 20 },
              controller.signal,
            ),
            fetchRanked(app.base, endpoint + '/matchups', 'player-matchups', playedQuery(selection), controller.signal),
          ]);
          if (pending !== controller) return;
          points = ratings.rows;
          ratingCursor = ratings.nextCursor;
          matchesCursor = games.nextCursor;
          ids.clear();
          for (const game of games.rows) ids.add(game.id);
          drawGames(games.rows);
          drawRating();
          const byCharacter = new Map();
          for (const row of records.rows) {
            const previous = byCharacter.get(row.character) || {
              ...data.characters.find((item) => item.character === row.character),
              character: row.character,
              games: 0,
              wins: 0,
              losses: 0,
              draws: 0,
            };
            for (const key of ['games', 'wins', 'losses', 'draws']) previous[key] += row[key];
            previous.winRate =
              previous.wins + previous.losses ? previous.wins / (previous.wins + previous.losses) : null;
            byCharacter.set(row.character, previous);
          }
          drawCharacters(
            ['region', 'build', 'from', 'to'].some((key) => selection[key])
              ? [...byCharacter.values()]
              : data.characters.filter((row) => !selection.character || row.character === selection.character),
          );
          moreGames.hidden = !matchesCursor;
          moreRatings.hidden = !ratingCursor;
          app.status.textContent = 'Profile updated.';
        } catch (error) {
          if (pending === controller)
            app.status.textContent = error.status
              ? error.message
              : 'Stats are unavailable. Apply the filters to try again.';
        } finally {
          if (pending === controller) app.content.removeAttribute('aria-busy');
        }
      };
      const getFilters = profileFilters(
        app,
        data.characters.map((row) => row.character),
        refresh,
      );
      selection = { ...getFilters() };
      app.filters
        .querySelector('.ranked-filter-panel')
        .append(
          note(
            'Character and dates apply throughout. Region and build filter played games; result and opponent filter recent games.',
          ),
        );
      profileTabs(app.content);
      if (Object.values(selection).some(Boolean)) return refresh(selection);
    },
    'profile',
  );
}
