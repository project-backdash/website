// <!-- check-allow: ranked -->
// <!-- check-allow: profiles -->
// The Ranked landing (/ranked/): the season line and the player search, one quiet line for right now, the board
// of every placed player, where everyone is by badge, and the latest sets. Also the full list of latest sets
// (/ranked/sets/). Parts the stats service does not send yet stay hidden until it does.
import { CHARACTERS, characterName, playerPath, fetchRanked } from '/assets/js/ranked-data.mjs?v=dde3981e98';
import {
  el,
  REGIONS,
  regionCode,
  regionName,
  fmt,
  pct,
  record,
  ago,
  shortDate,
  seasonLabel,
  face,
  plate,
  rankTable,
  settling,
  unsure,
  isMe,
  you,
  loading,
  empty,
  link,
  feedRow,
  playerSearch,
  isRankId,
  bar,
} from '/assets/js/ranked-kit.mjs?v=00fa912a59';

const root = document.querySelector('[data-board]');
const base = root.dataset.rankedApi;
const params = new URLSearchParams(location.search);
// The badge list turns into one bar per badge once there are enough placed players to fill one.
const CHART_FROM = 100;

function setParam(key, value) {
  if (value) params.set(key, value);
  else params.delete(key);
  history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : ''));
}

// When /v2/online cannot be read (an outage, a refusal or a missing CORS answer) the line leaves those numbers out.
async function online() {
  try {
    const response = await fetch(new URL('/v2/online', base), {
      credentials: 'omit',
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return Number.isSafeInteger(data.players) && Number.isSafeInteger(data.setsPlaying) ? data : null;
  } catch {
    return null;
  }
}

function landing() {
  const table = rankTable(base);
  let region = REGIONS.some(([id]) => id === params.get('region')) ? params.get('region') : '';
  let character = CHARACTERS.includes(params.get('character')) ? params.get('character') : '';
  let updatedAt = null,
    anyRd = false,
    label = 'Beta Season',
    myBadge = null,
    ranksNow = null;

  const pill = root.querySelector('[data-season]');
  const started = root.querySelector('[data-started]');
  const live = root.querySelector('[data-live]');
  const foot = root.querySelector('[data-foot]');
  playerSearch(root.querySelector('[data-search]'), { base });

  // ---- The live line ----
  const liveParts = { online: null, placed: null, updated: el('span', 'rk-updated') };
  function drawLive() {
    const parts = [];
    if (liveParts.online) {
      const now = el('span');
      now.append(el('i', 'rk-dot'), el('b', '', fmt(liveParts.online.players)), ' online now');
      const sets = el('span');
      sets.append(
        el('b', '', fmt(liveParts.online.setsPlaying)),
        liveParts.online.setsPlaying === 1 ? ' set being played' : ' sets being played',
      );
      parts.push(now, sets);
    }
    if (liveParts.placed) {
      const counts = el('span');
      counts.append(
        el('b', '', fmt(liveParts.placed[0])),
        ' placed, ',
        el('b', '', fmt(liveParts.placed[1])),
        ' still placing',
      );
      parts.push(counts);
    }
    liveParts.updated.textContent = updatedAt ? `Updated ${ago(updatedAt)}` : '';
    parts.push(liveParts.updated);
    live.replaceChildren(...parts);
  }
  setInterval(() => {
    if (updatedAt) liveParts.updated.textContent = `Updated ${ago(updatedAt)}`;
  }, 10000);
  // Once it has failed without ever answering (the live service sends it without CORS for the site), asking again
  // every minute would only add a console error and spend the request budget.
  let onlineSeen = false;
  const onlineTimer = setInterval(() => !document.hidden && refreshOnline(), 60000);
  async function refreshOnline() {
    liveParts.online = await online();
    if (liveParts.online) onlineSeen = true;
    else if (!onlineSeen) clearInterval(onlineTimer);
    drawLive();
  }
  refreshOnline();

  // ---- The board ----
  const board = root.querySelector('[data-board-panel]');
  const top = el('div', 'rk-board-top');
  const chips = el('div', 'rk-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Region');
  for (const [id, name] of [['', 'All regions'], ...REGIONS.map(([key, , title]) => [key, title])]) {
    const chip = el('button', 'rk-chip', name);
    chip.type = 'button';
    chip.dataset.region = id;
    chip.addEventListener('click', () => {
      region = id;
      setParam('region', id);
      loadBoard();
    });
    chips.append(chip);
  }
  const charButton = el('button', 'rk-char-btn');
  charButton.type = 'button';
  charButton.setAttribute('aria-expanded', 'false');
  charButton.setAttribute('aria-controls', 'rk-pop');
  const pop = el('div', 'rk-pop rk-panel');
  pop.id = 'rk-pop';
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Character');
  top.append(chips, charButton, pop);
  const head = el('div', 'rk-bh rk-cols rk-cap');
  for (const [text, cls] of [
    ['#', 'rk-r'],
    ['Player', ''],
    ['Region', 'rk-reg'],
    ['Badge', 'rk-badge'],
    ['MMR', 'rk-r rk-mmrc'],
    ['W–L', 'rk-r rk-wlc'],
    ['Win', 'rk-r'],
  ])
    head.append(el('span', cls, text));
  const rows = el('div', 'rk-rows');
  const boardFoot = el('p', 'rk-board-foot');
  const more = el('div', 'rk-more');
  more.hidden = true;
  board.replaceChildren(top, head, rows, more, boardFoot);

  function drawFilters() {
    for (const chip of chips.children) chip.setAttribute('aria-pressed', String(chip.dataset.region === region));
    charButton.replaceChildren('Character ', el('b', '', character ? characterName(character) : 'All'));
    charButton.insertAdjacentHTML(
      'beforeend',
      '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    );
  }

  // The character grid: All first, then the select screen's order; fighters with no Ranked games are dimmed.
  let played = null;
  const popHead = el('div', 'rk-pop-head');
  const popCount = el('span', 'rk-faint');
  popHead.append(el('span', 'rk-cap', 'Character'), popCount);
  const grid = el('div', 'rk-pgrid');
  pop.append(popHead, grid);
  for (const id of ['', ...CHARACTERS]) {
    const button = el('button', id ? '' : 'rk-all', id ? '' : 'All');
    button.type = 'button';
    button.dataset.character = id;
    button.title = id ? characterName(id) : 'All characters';
    button.setAttribute('aria-label', button.title);
    if (id) button.append(face(id, 40));
    button.addEventListener('click', () => {
      character = id;
      setParam('character', id);
      closePop();
      loadBoard();
    });
    grid.append(button);
  }
  function drawPop(total) {
    for (const button of grid.children) {
      button.setAttribute('aria-pressed', String(button.dataset.character === character));
      button.classList.toggle(
        'is-none',
        Boolean(played && button.dataset.character && !played.has(button.dataset.character)),
      );
    }
    if (Number.isSafeInteger(total))
      popCount.textContent = `${character ? characterName(character) : 'All characters'}: ${fmt(total)} placed ${total === 1 ? 'player' : 'players'}`;
  }
  function closePop() {
    pop.hidden = true;
    charButton.setAttribute('aria-expanded', 'false');
  }
  charButton.addEventListener('click', () => {
    const open = pop.hidden;
    pop.hidden = !open;
    charButton.setAttribute('aria-expanded', String(open));
    if (!open) return;
    (grid.querySelector('[aria-pressed="true"]') ?? grid.firstChild).focus();
    if (!played)
      fetchRanked(base, 'characters', 'characters')
        .then((data) => {
          played = new Set(data.rows.filter((row) => row.games > 0).map((row) => row.character));
          drawPop();
        })
        .catch(() => {});
  });
  document.addEventListener('click', (event) => {
    if (!pop.hidden && !pop.contains(event.target) && !charButton.contains(event.target)) closePop();
  });
  pop.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePop();
      charButton.focus();
    }
  });

  function boardRow(row) {
    const href = playerPath(row.player);
    const line = el(href ? 'a' : 'div', 'rk-row rk-cols');
    if (href) line.href = href;
    line.dataset.pos = row.position;
    const mine = isMe(row.player);
    if (mine) line.classList.add('is-you');
    const who = el('span', 'rk-who');
    const names = el('span', 'rk-n');
    names.append(el('b', '', row.player.name));
    if (row.player.tag) names.append(el('span', 'rk-tag', `#${row.player.tag}`));
    names.append(el('span', 'rk-sub', [row.rank, regionCode(row.region)].filter(Boolean).join(' · ')));
    who.append(face(row.character, 40, { label: characterName(row.character) }), names);
    if (mine) who.append(you());
    const badge = el('span', 'rk-badge');
    const image = plate(row.rankId, { label: row.rank ?? '' });
    if (image) {
      image.title = row.rank ?? '';
      badge.append(image);
    }
    badge.append(el('span', 'rk-bn', row.rank ?? ''));
    const mmr = el('span', 'rk-mmr rk-mmrc rk-r', fmt(row.mmr));
    const sets = row.wins + row.losses;
    line.append(
      el('span', 'rk-pos', fmt(row.position)),
      who,
      el('span', 'rk-reg', regionCode(row.region)),
      badge,
      mmr,
      el('span', 'rk-wlc rk-r', record(row.wins, row.losses)),
      el('span', 'rk-wr rk-r', sets ? pct(row.wins, row.losses) : '–'),
    );
    return line;
  }

  let generation = 0,
    shown = [],
    cursor = null;
  async function loadBoard(append = false, quiet = false) {
    const current = ++generation;
    drawFilters();
    if (!append && !quiet) {
      rows.replaceChildren(loading('Loading the board'));
      more.hidden = true;
      boardFoot.textContent = '';
    }
    try {
      const data = await fetchRanked(base, 'leaderboard', 'leaderboard', {
        region,
        character,
        limit: 100,
        cursor: append ? cursor : null,
      });
      if (current !== generation) return;
      const placed = data.rows.filter((row) => isRankId(row.rankId));
      shown = append ? [...shown, ...placed] : placed;
      cursor = data.nextCursor;
      updatedAt = data.updatedAt;
      label = seasonLabel(data);
      pill.textContent = label;
      anyRd ||= shown.some((row) => Number.isFinite(row.rd));
      if (!region && !character && !append) myBadge = shown.find((row) => isMe(row.player))?.rankId ?? null;
      const total = Number.isSafeInteger(data.total) ? data.total : shown.length;
      drawPop(total);
      if (!shown.length) {
        const all = link(character ? 'Show all characters' : 'Show all regions', '#');
        all.addEventListener('click', (event) => {
          event.preventDefault();
          if (character) {
            character = '';
            setParam('character', '');
          } else {
            region = '';
            setParam('region', '');
          }
          loadBoard();
        });
        rows.replaceChildren(
          region || character
            ? empty(
                `No placed ${character ? characterName(character) + ' ' : ''}players${region ? ' in ' + regionName(region) : ''} yet.`,
                '',
                all,
              )
            : empty(
                'Nobody has placed yet.',
                'A first character places at its fifth ranked set. The first players show here as they do.',
              ),
        );
        head.hidden = true;
        boardFoot.textContent = '';
      } else {
        head.hidden = false;
        rows.replaceChildren(...shown.map(boardRow));
        markUnsure();
        const who = `${character ? characterName(character) + ' ' : ''}player${total === 1 ? '' : 's'}${region ? ' in ' + regionName(region) : ''}`;
        const scope = cursor
          ? `The top ${fmt(shown.length)} of ${fmt(total)} placed ${who}`
          : `All ${fmt(total)} placed ${who}`;
        boardFoot.textContent = `${scope}${character ? '' : ', best character each'}, by badge and then MMR. A first character places at its fifth set, any later one at its fourth. Win counts sets.`;
      }
      more.replaceChildren();
      more.hidden = !cursor;
      if (cursor) {
        const button = el('button', 'rk-btn', 'More players');
        button.type = 'button';
        button.addEventListener('click', () => {
          button.disabled = true;
          loadBoard(true);
        });
        more.append(button);
      }
      drawLive();
      drawFoot();
      drawDistribution();
    } catch (error) {
      if (current !== generation || quiet) return;
      if (append && error.status === 400) return loadBoard();
      const retry = el('button', 'rk-btn rk-retry', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', () => loadBoard(append));
      rows.replaceChildren(
        empty(
          'The board is unavailable right now.',
          error.status === 429 ? 'Too many requests. Try again in a minute.' : '',
          retry,
        ),
      );
    }
  }

  // ---- Where everyone is ----
  const distHead = root.querySelector('[data-dist-head]');
  const dist = root.querySelector('[data-dist]');
  let distData = null;
  async function loadDistribution(quiet = false) {
    try {
      distData = await fetchRanked(base, 'rank-distribution', 'rank-distribution', { population: 'highest' });
      const placing = distData.rows.find((row) => row.rankId == null)?.players ?? 0;
      liveParts.placed = [distData.total - placing, placing];
      drawLive();
      drawDistribution();
    } catch {
      if (quiet) return;
      distHead.hidden = true;
      dist.hidden = true;
    }
  }
  async function drawDistribution() {
    if (!distData) return;
    const ranks = await table;
    const counts = new Map(distData.rows.filter((row) => isRankId(row.rankId)).map((row) => [row.rankId, row]));
    const placing = distData.rows.find((row) => row.rankId == null)?.players ?? 0;
    const placed = [...counts.values()].reduce((sum, row) => sum + row.players, 0);
    distHead.hidden = dist.hidden = placed === 0;
    if (!placed) return;
    distHead.querySelector('.rk-window').textContent = `Placed players by badge, ${label}`;
    const lines = ranks?.ranks;
    const step = lines && lines[11].from - lines[10].from;
    const even =
      lines &&
      lines.slice(11, 33).every((row, index) => row.from != null && row.from - lines[10 + index].from === step);
    const noteText =
      `${fmt(placing)} more ${placing === 1 ? 'player is' : 'players are'} still placing.` +
      (even
        ? ` From ${lines[10].rank} up, each badge is ${step} MMR above the last; ${lines[33].rank} and ${lines[34].rank} have no MMR line.`
        : '');
    const name = (index) => lines?.[index]?.rank ?? counts.get(`rank_${String(index).padStart(2, '0')}`)?.rank ?? '';
    if (placed < CHART_FROM) {
      const list = el('div', 'rk-dl' + (lines ? '' : ' no-lines'));
      const present = [...counts.values()]
        .filter((row) => row.players > 0)
        .sort((a, b) => b.rankId.localeCompare(a.rankId));
      const most = Math.max(...present.map((row) => row.players));
      list.style.gridTemplateRows = `repeat(${Math.ceil(present.length / 2)}, auto)`;
      for (const row of present) {
        const index = Number(row.rankId.slice(5));
        const line = el('div', 'rk-dr' + (row.rankId === myBadge ? ' is-you' : ''));
        const title = el('span', '', row.rank ?? '');
        if (row.rankId === myBadge) title.append(' ', you());
        line.append(plate(row.rankId) ?? el('span'), title);
        if (lines)
          line.append(
            el(
              'span',
              'rk-from',
              index === 1 ? 'start' : lines[index].from != null ? `from ${fmt(lines[index].from)}` : '',
            ),
          );
        line.append(bar(row.players / most), el('span', 'rk-cnt', fmt(row.players)));
        list.append(line);
      }
      dist.className = 'rk-dist rk-panel';
      dist.replaceChildren(list, el('p', 'rk-note', noteText));
      return;
    }
    // One bar per badge, 9th Kyu to the highest badge with an MMR line, with the group edges named.
    dist.className = 'rk-distc rk-panel';
    const readout = el('div', 'rk-readout');
    readout.setAttribute('aria-live', 'polite');
    const bars = el('div', 'rk-bars');
    const most = Math.max(1, ...[...counts.values()].map((row) => row.players));
    const players = (index) => counts.get(`rank_${String(index).padStart(2, '0')}`)?.players ?? 0;
    const home = myBadge ? Number(myBadge.slice(5)) : null;
    const show = (index) => {
      const n = players(index);
      let above = 0;
      for (let at = index; at <= 34; at++) above += players(at);
      const cell = (cap, value) => {
        const box = el('div');
        box.append(el('div', 'rk-cap', cap), el('div', 'rk-v', value));
        return box;
      };
      readout.replaceChildren(
        plate(`rank_${String(index).padStart(2, '0')}`) ?? el('span'),
        cell('Badge', name(index)),
        ...(lines ? [cell('From', index === 1 ? 'the start' : `${fmt(lines[index].from)} MMR`)] : []),
        cell('Players', fmt(n)),
        cell('Top', n ? `${Math.round((100 * above) / placed)}%` : '–'),
        el('span', 'rk-faint', index === home ? 'Your badge' : ''),
      );
      for (const item of bars.querySelectorAll('i'))
        item.classList.toggle('on', Number(item.dataset.i) === index && index !== home);
    };
    for (let index = 1; index <= 32; index++) {
      if (index === 10 || index === 17) bars.append(el('span'));
      const item = el('i', index === home ? 'is-you' : '');
      item.dataset.i = index;
      item.style.height = `${Math.max(1.2, (players(index) / most) * 100)}%`;
      item.title = `${name(index)}: ${fmt(players(index))}`;
      bars.append(item);
    }
    bars.addEventListener('mousemove', (event) => event.target.dataset?.i && show(Number(event.target.dataset.i)));
    bars.addEventListener('mouseleave', () => show(home ?? 1));
    const groups = el('div', 'rk-groups');
    groups.setAttribute('aria-hidden', 'true');
    for (const [from, word, to] of [
      [1, 'Kyu', 9],
      [10, 'Dan', 16],
      [17, even ? `${step} MMR a badge` : '', 32],
    ]) {
      const group = el('div');
      group.append(el('b', '', name(from)), el('span', '', word), el('b', '', name(to)));
      groups.append(group);
    }
    show(home ?? 1);
    dist.replaceChildren(readout, bars, groups, el('p', 'rk-note', noteText));
  }

  // ---- Latest sets: shown once the stats service sends them ----
  const feedBox = root.querySelector('[data-feed]');
  const feed = feedBox.querySelector('.rk-feed');
  let feedTimer = null;
  async function loadFeed() {
    try {
      const data = await fetchRanked(base, 'recent-sets', 'recent-sets', { limit: 5 });
      feed.replaceChildren(...(data.rows.length ? data.rows.map(feedRow) : [empty('No rated sets yet.')]));
      feedBox.hidden = false;
    } catch (error) {
      feedBox.hidden = true;
      // A service without the route answers 404; asking again every minute would only spend the request budget.
      if (error.status === 404) clearInterval(feedTimer);
    }
  }

  async function drawFoot() {
    const ranks = await table;
    if (ranks?.startedAt) started.textContent = `Started ${shortDate(ranks.startedAt)}. `;
    const stats = link('Stats', '/stats/');
    foot.replaceChildren(
      `Ranked sets in ${label}${ranks?.startedAt ? `, from ${shortDate(ranks.startedAt)}` : ''}. The board updates every minute. `,
      anyRd ? '? means the rating is still settling. ' : '',
      'Characters and win rates are on ',
      stats,
      '.',
    );
  }

  // The "?" hangs in a slot of its own at the MMR's right, so the digits stay aligned in every row.
  function markUnsure() {
    let any = false;
    for (const [index, row] of shown.entries()) {
      const cell = rows.children[index]?.querySelector('.rk-mmr');
      if (!cell) continue;
      cell.querySelector('.rk-unsure')?.remove();
      if (settling(row.rd, ranksNow)) {
        cell.append(unsure());
        any = true;
      }
    }
    board.classList.toggle('rk-has-unsure', any);
  }

  loadBoard();
  loadDistribution();
  loadFeed();
  feedTimer = setInterval(() => !document.hidden && loadFeed(), 60000);
  // The board and the badge counts follow the service, which updates every minute. A refresh waits while the
  // reader is in the board (a focused row, the open grid) or has more than the first page open.
  setInterval(() => {
    if (document.hidden || !pop.hidden || shown.length > 100 || board.contains(document.activeElement)) return;
    loadBoard(false, true);
    loadDistribution(true);
  }, 60000);
  // The "?" line comes with the rank table; redraw the marks once it is known.
  table.then((ranks) => {
    if (!ranks) return;
    ranksNow = ranks;
    markUnsure();
  });
}

// /ranked/sets/: every rated set, latest first, a page at a time.
function latestSets() {
  const list = root.querySelector('[data-sets]');
  const more = root.querySelector('[data-more]');
  let cursor = null;
  async function load(append) {
    if (!append) list.replaceChildren(loading('Loading sets'));
    more.disabled = true;
    try {
      const data = await fetchRanked(base, 'recent-sets', 'recent-sets', { limit: 20, cursor: append ? cursor : null });
      const lines = data.rows.map(feedRow);
      if (append) list.append(...lines);
      else list.replaceChildren(...(lines.length ? lines : [empty('No rated sets yet.')]));
      cursor = data.nextCursor;
      more.hidden = !cursor;
      root.querySelector('[data-season]').textContent = seasonLabel(data);
    } catch (error) {
      if (append && error.status === 400) return load(false);
      more.hidden = true;
      list.replaceChildren(
        error.status === 404
          ? empty(
              'Latest sets are not on the site yet.',
              'The board and every player are on Ranked.',
              link('Go to Ranked', '/ranked/'),
            )
          : empty('Latest sets are unavailable right now.', 'Try again in a minute.'),
      );
    } finally {
      more.disabled = false;
    }
  }
  more.addEventListener('click', () => load(true));
  load(false);
}

if (root.dataset.board === 'sets') latestSets();
else landing();
