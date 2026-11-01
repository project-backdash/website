// <!-- check-allow: ranked -->
// <!-- check-allow: profiles -->
// A player's page, drawn from 404.html at /player/Name-1234: the header (badge, MMR, record, peak, today), then
// Overview, Sets, Matchups and Head to head, each with its own address, and set pages at /player/Name-1234/set/<id>.
// Parts the stats service does not send yet stay hidden until it does.
import {
  characterName,
  playerPath,
  setPath,
  profileEndpoint,
  parsePlayerRoute,
  fetchRanked,
} from '/assets/js/ranked-data.mjs?v=928834e0ba';
import {
  el,
  regionName,
  fmt,
  signed,
  pct,
  record,
  ago,
  shortDate,
  clock,
  dayLabel,
  sameDay,
  seasonLabel,
  face,
  plate,
  rankTable,
  settling,
  unsure,
  nextBadge,
  bar,
  lamps,
  isMe,
  setMe,
  loading,
  empty,
  link,
  section,
  gameLetters,
  setScore,
  rounds,
  isRankId,
  int,
  playerSearch,
  searchForm,
  boardRow,
} from '/assets/js/ranked-kit.mjs?v=a7b28d1a10';

const CHEVRON =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const LINK_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6.5 9.5l3-3M5 8L3.6 9.4a2.3 2.3 0 0 0 3.3 3.3L8.2 11.3M11 8l1.4-1.4a2.3 2.3 0 0 0-3.3-3.3L7.8 4.7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
const FEW_GAMES = 10;

const lower = (text) => (text === 'Yesterday' ? 'yesterday' : text);
const placed = (row) => isRankId(row?.rankId);

// The page frame: 404.html has no sidebar (a missing page has no place in the page list), so a player page adds
// the one kept in its template and marks Ranked as the current page. The page's own inline script has usually
// done this already, before the first paint, so the 404 text never shows.
function frame(main) {
  if (!main.parentElement?.classList.contains('page')) {
    const template = document.querySelector('template[data-player-frame]');
    const page = el('div', 'page');
    main.replaceWith(page);
    if (template) page.append(template.content.cloneNode(true));
    page.append(main);
    main.className = 'page-main';
  }
  for (const item of document.querySelectorAll('.nav-list a, .footer-nav a'))
    if (item.getAttribute('href') === '/ranked/') item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  const root = el('div', 'rk rk-player');
  main.replaceChildren(root);
  return root;
}

// The header's set record, place and region. Until the stats service sends them with the profile they come from
// the player's board row, which counts sets for the character the board lists them by, so the page and the board
// always agree.
function ownFacts(profile, row) {
  const rating = profile.rating;
  const same = row && row.character === rating?.character ? row : null;
  return {
    board: row,
    wins: int(rating?.setWins) ?? int(same?.wins),
    losses: int(rating?.setLosses) ?? int(same?.losses),
    position: int(rating?.position) ?? int(row?.position),
    region: profile.player.region ?? row?.region ?? null,
  };
}
// A character's set record: the profile's, else the board row's when the board lists the player by it.
function setRecord(ctx, row) {
  if (int(row.setWins) != null && int(row.setLosses) != null)
    return { wins: row.setWins, losses: row.setLosses, sets: int(row.ratedSets) };
  const board = ctx.own.board;
  if (board?.character === row.character && int(board.wins) != null && int(board.losses) != null)
    return { wins: board.wins, losses: board.losses, sets: int(board.ratedSets) };
  return null;
}

export function playerPage(main, route, base) {
  const root = frame(main);
  const ctx = { base, route, root, profile: null, table: null, setsByDate: new Map(), cache: new Map() };
  const name = `${route.player.name}#${route.player.tag}`;
  document.title = `${name} | Project Backdash`;
  if (route.view === 'set') return setPage(ctx);

  async function start() {
    root.replaceChildren(loading(`Loading ${route.player.name}`));
    // Read beside the profile, so waiting for it costs no extra round trip.
    const row = boardRow(base, route.player);
    try {
      const [profile, table] = await Promise.all([
        fetchRanked(base, profileEndpoint(route.player), 'profile'),
        rankTable(base),
      ]);
      ctx.profile = profile;
      ctx.table = table;
      ctx.own = ownFacts(profile, await row);
      ctx.path = playerPath(profile.player);
      ctx.hasSets = Array.isArray(profile.recentSets);
      for (const set of profile.recentSets ?? []) ctx.setsByDate.set(set.date, set);
      document.title = `${profile.player.name}#${profile.player.tag} | Project Backdash`;
      draw();
    } catch (error) {
      const search = link('Search players', `/stats/players/?q=${encodeURIComponent(route.player.name)}`);
      // The service answers 400 for a tag no player can have (such as 0000): for the reader that is no player too.
      if (error.status === 404 || error.status === 400) {
        const box = el('section', 'rk-panel rk-tab-panel');
        box.append(el('h1', 'rk-missing', `No player called ${name}.`));
        const text = el('p', 'rk-missing-note');
        text.append('They may have changed their name, or not played a rated set yet. ', search);
        box.append(text);
        return root.replaceChildren(box);
      }
      const retry = el('button', 'rk-btn rk-retry', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', start);
      const box = el('section', 'rk-panel');
      box.append(
        empty(
          'Stats are unavailable right now.',
          error.status === 429 ? 'Too many requests. Try again in a minute.' : '',
          retry,
        ),
      );
      const title = el('h1', 'label-tab', name);
      root.replaceChildren(title, box);
    }
  }

  const view = el('div');
  const tabs = el('nav', 'rk-tabs');
  tabs.setAttribute('aria-label', 'Player');
  function draw() {
    root.replaceChildren(hero(ctx), tabs, view);
    drawTabs();
    drawView();
  }
  function drawTabs() {
    const items = [
      ['overview', 'Overview', ctx.path],
      ['matchups', 'Matchups', `${ctx.path}/matchups`],
      ['vs', 'Head to head', `${ctx.path}/vs`],
    ];
    if (ctx.hasSets) items.splice(1, 0, ['sets', 'Sets', `${ctx.path}/sets`]);
    tabs.replaceChildren(
      ...items.map(([id, title, href]) => {
        const tab = link(title, href, '');
        if (id === ctx.route.view) tab.setAttribute('aria-current', 'page');
        return tab;
      }),
    );
    // On a phone the tabs scroll in one row; keep the current one in view.
    requestAnimationFrame(() => {
      const current = tabs.querySelector('[aria-current]');
      if (current && current.offsetLeft + current.offsetWidth > tabs.scrollLeft + tabs.clientWidth)
        tabs.scrollLeft = current.offsetLeft + current.offsetWidth - tabs.clientWidth + 16;
      else if (current && current.offsetLeft < tabs.scrollLeft) tabs.scrollLeft = current.offsetLeft - 16;
    });
  }
  function drawView() {
    const views = { overview, sets: setsTab, matchups: matchupsTab, vs: headToHeadTab };
    const show = ctx.route.view === 'sets' && !ctx.hasSets ? overview : (views[ctx.route.view] ?? overview);
    view.replaceChildren();
    show(ctx, view);
  }
  // Tabs and in-page links change the address without reloading the player.
  ctx.go = (href) => {
    const next = parsePlayerRoute(new URL(href, location.origin).pathname);
    if (
      !next ||
      next.view === 'set' ||
      next.player.tag !== route.player.tag ||
      next.player.name.toLowerCase() !== route.player.name.toLowerCase()
    )
      return location.assign(href);
    history.pushState(null, '', href);
    ctx.route = next;
    drawTabs();
    drawView();
  };
  root.addEventListener('click', (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (
      !anchor ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (!anchor.closest('.rk-tabs, [data-in-page]')) return;
    event.preventDefault();
    ctx.go(anchor.getAttribute('href'));
  });
  addEventListener('popstate', () => {
    const next = parsePlayerRoute(location.pathname);
    if (!next || !ctx.profile || next.view === 'set') return location.reload();
    ctx.route = next;
    drawTabs();
    drawView();
  });
  start();
}

// ---- Header ----------------------------------------------------------------------------------------------------

// Today's change from rating rows (one per set), in the reader's own day. When every row read is from today and
// older ones exist, the day may have started further back, so it is left unsaid.
function todayFrom(rows, character, complete) {
  const now = Date.now();
  const done = rows.filter((row) => row.character === character && sameDay(row.date, now));
  if (!complete && done.length && rows.every((row) => sameDay(row.date, now))) return null;
  return {
    change: done.reduce((sum, row) => sum + (Number.isFinite(row.change) ? row.change : 0), 0),
    wins: done.filter((row) => row.change > 0).length,
    losses: done.filter((row) => row.change < 0).length,
  };
}

// A character's rating rows, oldest first: one page, or two when the first does not reach back to the season's
// start. The header's Today and the graph share the read.
function ratingRows(ctx, character) {
  const key = 'history:' + character;
  if (!ctx.cache.has(key))
    ctx.cache.set(
      key,
      (async () => {
        const start = ctx.table?.startedAt ? Date.parse(ctx.table.startedAt) : null;
        const endpoint = profileEndpoint(ctx.profile.player) + '/rating-history';
        const first = await fetchRanked(ctx.base, endpoint, 'rating-history', { character, limit: 50 });
        let rows = first.rows,
          cursor = first.nextCursor;
        if (cursor && start && rows.length && Date.parse(rows.at(-1).date) >= start) {
          const second = await fetchRanked(ctx.base, endpoint, 'rating-history', { character, limit: 50, cursor });
          rows = rows.concat(second.rows);
          cursor = second.nextCursor;
        }
        return {
          rows: rows.filter((row) => Number.isFinite(row.before) && Number.isFinite(row.after)).reverse(),
          complete: !cursor,
        };
      })(),
    );
  return ctx.cache.get(key);
}

function hero(ctx) {
  const { profile, table, own } = ctx;
  const player = profile.player;
  const rating = profile.rating;
  const games = profile.characters.find((row) => row.character === rating?.character);
  const box = el('section', 'rk-hero rk-panel');
  box.setAttribute('aria-label', 'Player');
  box.append(face(player.avatarCharacter, 120, { label: characterName(player.avatarCharacter) }));

  const main = el('div', 'rk-hero-main');
  const top = el('div', 'rk-hero-top');
  top.append(el('span', 'rk-pill', seasonLabel(profile)));
  if (own.position) top.append(el('span', 'rk-place', `#${fmt(own.position)} in All regions`));
  const title = el('h1', 'rk-hero-name');
  const nameText = el('span', 'rk-hero-text', player.name);
  title.append(nameText);
  if (player.tag) title.append(el('span', 'rk-hero-tag', `#${player.tag}`));
  fitName(box, title, nameText);
  const last = profile.recentSets?.[0]?.date ?? profile.ratingHistory[0]?.date;
  const meta = [regionName(own.region), last ? `Last set ${lower(ago(last))}` : ''].filter(Boolean).join(' · ');
  main.append(top, title);
  if (meta) main.append(el('p', 'rk-hero-meta', meta));

  const actions = el('div', 'rk-hero-actions');
  const copy = el('button', 'rk-btn');
  copy.type = 'button';
  copy.innerHTML = LINK_ICON;
  const copyText = el('span', '', 'Copy link');
  copy.append(copyText);
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(new URL(ctx.path, location.origin).href);
      copyText.textContent = 'Link copied';
    } catch {
      copyText.textContent = 'Copy failed';
    }
    setTimeout(() => (copyText.textContent = 'Copy link'), 2000);
  });
  const mine = el('button', 'rk-btn', 'This is me');
  mine.type = 'button';
  mine.title = 'Marks your row on the board, in this browser only';
  mine.setAttribute('aria-pressed', String(isMe(player)));
  mine.addEventListener('click', () => {
    setMe(isMe(player) ? null : player);
    mine.setAttribute('aria-pressed', String(isMe(player)));
  });
  actions.append(copy, mine);
  main.append(actions);
  box.append(main);

  const side = el('div', 'rk-hero-rank');
  if (placed(rating)) {
    const image = plate(rating.rankId, { label: rating.rank });
    if (image) side.append(image);
    const mmr = el('div', 'rk-hero-mmr', fmt(rating.mmr));
    if (int(rating.rd) != null) mmr.append(el('span', 'rk-rd', `± ${fmt(rating.rd)}`));
    if (settling(rating.rd, table)) mmr.append(unsure());
    side.append(mmr, el('div', 'rk-hero-sub', `${rating.rank} · MMR with ${characterName(rating.character)}`));
    const next = nextBadge(table, rating.rankId, rating.mmr);
    if (next) {
      const prog = el('div', 'rk-hero-prog');
      prog.append(bar(next.share), el('span', '', `${fmt(next.need)} to ${next.name}`));
      side.append(prog);
    }
  } else if (rating) {
    side.append(placingLine(rating, 'rk-hero-placing'));
    side.append(el('div', 'rk-hero-sub', `With ${characterName(rating.character)}`));
  }
  if (side.childElementCount) box.append(side);

  if (placed(rating)) {
    const stats = el('dl', 'rk-stats');
    const tile = (label, value, small, className = '') => {
      const item = el('div');
      const dd = el('dd', className, value);
      if (small) dd.append(el('small', '', small));
      item.append(el('dt', 'rk-cap', label), dd);
      stats.append(item);
      return item;
    };
    // Win rate counts sets as the board does: won over won and lost.
    if (own.wins != null && own.losses != null) {
      tile('Record', record(own.wins, own.losses), 'sets');
      tile('Win rate', pct(own.wins, own.losses));
    } else if (games) {
      tile('Record', record(games.wins, games.losses), 'games');
      tile('Win rate', games.winRate == null ? '–' : `${Math.round(games.winRate * 100)}%`, 'games');
    }
    if (int(rating.peakMmr) != null) tile('Peak', fmt(rating.peakMmr));
    const todayTile = (today) =>
      tile(
        'Today',
        signed(today.change),
        today.wins + today.losses ? `${record(today.wins, today.losses)} sets` : 'no sets',
        today.change > 0 ? 'rk-win' : today.change < 0 ? 'rk-loss' : '',
      );
    // The stats service's own day is UTC; the tile counts the reader's day, from the profile's latest rating rows
    // or, when those do not reach back to midnight, from the character's history.
    const today = todayFrom(profile.ratingHistory, rating.character, !profile.ratingHistoryCursor);
    if (today) todayTile(today);
    else
      ratingRows(ctx, rating.character).then(
        (data) => {
          const late = todayFrom(data.rows, rating.character, data.complete);
          if (late) todayTile(late);
        },
        () => {},
      );
    box.append(stats);
  }
  return box;
}

// A long name steps down in size until it fits on one line with its tag, so it never breaks inside a word. The
// tag steps down with it, on the page's type scale. At the smallest size the tag takes the next line, and a name
// too long even for a line of its own ends in "…".
function fitName(box, title, text) {
  let width = 0;
  const tag = title.querySelector('.rk-hero-tag');
  const fit = () => {
    title.style.fontSize = '';
    title.classList.remove('is-wrapped');
    const start = parseFloat(getComputedStyle(title).fontSize);
    const room = () =>
      text.scrollWidth + (tag ? tag.offsetWidth + parseFloat(getComputedStyle(title).columnGap || 0) : 0) <=
      title.clientWidth;
    for (const size of [start, 34, 28, 24, 20].filter((value) => value <= start)) {
      title.style.fontSize = `${size}px`;
      if (tag) tag.style.fontSize = size >= 34 ? '' : size >= 24 ? 'var(--fs-3)' : 'var(--fs-2)';
      if (room()) return;
    }
    title.classList.add('is-wrapped');
  };
  new ResizeObserver(() => {
    if (Math.abs(box.clientWidth - width) < 2) return;
    width = box.clientWidth;
    fit();
  }).observe(box);
  document.fonts?.ready.then(fit);
}

function placingLine(row, className) {
  const line = el('div', className);
  const done = int(row.placementSets),
    total = int(row.placementTotal);
  if (done != null && total) {
    line.append(lamps(done, total), `Placing ${done}/${total} · ${total - done} to go`);
  } else line.append('Placing');
  return line;
}

// ---- Overview ------------------------------------------------------------------------------------------------

function overview(ctx, view) {
  const { profile } = ctx;
  view.append(ratingGraph(ctx));
  view.append(section('Characters'), characterCards(ctx));
  if (ctx.hasSets) {
    const all = link('All sets', `${ctx.path}/sets`);
    all.dataset.inPage = '';
    view.append(section('Recent sets', 'Latest first, in your local time', all));
    const box = el('section', 'rk-sets rk-panel');
    box.setAttribute('aria-label', 'Recent sets');
    if (profile.recentSets.length) {
      const head = el('div', 'rk-set-head rk-set-cols rk-cap');
      head.append(
        el('span', '', 'Result'),
        el('span', '', 'You'),
        el('span', '', 'Opponent'),
        el('span', '', 'Games'),
        el('span', 'rk-r', 'MMR'),
        el('span'),
      );
      head.children[1].title = 'Your character';
      box.append(head);
      for (const set of profile.recentSets) box.append(...setRow(ctx, set));
    } else box.append(empty('No rated sets yet.'));
    view.append(box);
  } else if (Array.isArray(profile.recentMatches)) {
    view.append(section('Recent games', 'Latest first, in your local time'));
    view.append(recentGames(profile.recentMatches.slice(0, 10)));
  }
  const two = el('div', 'rk-two');
  const left = el('div'),
    right = el('div');
  left.append(section('Matchups', 'Games, all characters'));
  right.append(section('Head to head', 'Games, most played opponents'));
  const muBox = el('section', 'rk-panel');
  const hhBox = el('section', 'rk-panel');
  muBox.append(loading('Loading matchups'));
  hhBox.append(loading('Loading opponents'));
  left.append(muBox);
  right.append(hhBox);
  two.append(left, right);
  view.append(two);
  matchupRows(ctx).then(
    (rows) => muBox.replaceChildren(...matchupSummary(ctx, rows)),
    () => muBox.replaceChildren(empty('Matchups are unavailable right now.')),
  );
  opponents(ctx).then(
    (rows) => hhBox.replaceChildren(...rivalList(ctx, rows.slice(0, 5), true)),
    () => hhBox.replaceChildren(empty('Head to head is unavailable right now.')),
  );
  view.append(footNote(ctx));
}

// Games, while the stats service sends no sets: one row per game with its rounds, grouped by day. The portrait
// is the opponent's character, beside their name. A set's MMR change sits on its latest game only, since every
// game of the set carries the same one.
function recentGames(games) {
  const box = el('section', 'rk-panel rk-tab-panel rk-games');
  box.setAttribute('aria-label', 'Recent games');
  if (!games.length) {
    box.append(empty('No rated games yet.'));
    return box;
  }
  let lastDay = null,
    lastSet = null;
  for (const game of games) {
    const day = dayLabel(game.date);
    if (day !== lastDay) box.append(el('p', 'rk-day', day));
    lastDay = day;
    const href = playerPath(game.opponent);
    const row = el(href ? 'a' : 'div', 'rk-mini');
    if (href) row.href = href;
    const word = { win: 'Win', loss: 'Loss', draw: 'Draw' }[game.result];
    const res = el('span');
    const tone = game.result === 'win' ? 'rk-win' : game.result === 'loss' ? 'rk-loss' : '';
    res.append(el('span', `rk-res ${tone}`, word));
    if (game.score?.player != null && game.score?.opponent != null)
      res.append(' ', el('span', 'rk-sc', `${game.score.player}–${game.score.opponent}`));
    const who = el('span');
    if (game.opponent) who.append(el('b', '', game.opponent.name), ' ');
    who.append(el('span', 'rk-faint', characterName(game.opponentCharacter)));
    const change = game.ratingChange;
    const set = change ? `${game.opponent?.tag}:${change.before}:${change.after}` : null;
    const delta = el('b');
    if (change && set !== lastSet && Number.isFinite(change.change)) {
      delta.textContent = signed(change.change);
      delta.className = change.change > 0 ? 'rk-win' : change.change < 0 ? 'rk-loss' : '';
    }
    lastSet = set;
    row.append(
      res,
      face(game.opponentCharacter, 24, { label: characterName(game.opponentCharacter) }),
      who,
      el('span'),
      delta,
      el('span', 'rk-faint', clock(game.date)),
    );
    box.append(row);
  }
  box.append(el('p', 'rk-note', 'Rounds per game. A set changes MMR once, shown on its last game.'));
  return box;
}

function footNote(ctx) {
  const { profile, table } = ctx;
  const anyRd = profile.characters.some((row) => int(row.rd) != null);
  return el(
    'p',
    'rk-foot',
    [
      `Ranked sets in ${seasonLabel(profile)}${table?.startedAt ? `, from ${shortDate(table.startedAt)}` : ''}.`,
      `Updated ${ago(profile.updatedAt)}.`,
      anyRd ? 'The ± says how settled an MMR is, and ? means the rating is still settling.' : '',
      table ? 'Badges follow MMR.' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
}

// ---- Rating graph ----

function ratingGraph(ctx) {
  const { profile, table } = ctx;
  const panel = el('section', 'rk-graph rk-panel');
  panel.setAttribute('aria-label', 'Rating');
  const head = el('div', 'rk-graph-head');
  head.append(el('h2', 'rk-h', 'Rating'));
  panel.append(head);
  const chars = profile.characters.filter(placed);
  if (!chars.length) {
    const first = table?.placementSets ?? 5;
    panel.append(el('div', 'rk-graph-empty', `The graph starts once a character places, at set ${first}.`));
    return panel;
  }
  let character = placed(profile.rating) ? profile.rating.character : chars[0].character;
  const start = table?.startedAt ? Date.parse(table.startedAt) : null;
  let range = start ? 'season' : 'last';
  const label = seasonLabel(profile);

  const chips = chars.map((row) => {
    const chip = el('button', 'rk-chip');
    chip.type = 'button';
    chip.append(face(row.character, 24), el('span', 'rk-cn', characterName(row.character)));
    chip.setAttribute('aria-label', characterName(row.character));
    chip.addEventListener('click', () => {
      character = row.character;
      range = start ? 'season' : 'last';
      load();
    });
    chip.dataset.character = row.character;
    return chip;
  });
  head.append(...chips);
  const seg = el('span', 'rk-seg');
  const segButtons = [
    ['season', label],
    ['last', 'Last 50 sets'],
  ].map(([id, text]) => {
    const button = el('button', '', text);
    button.type = 'button';
    button.dataset.range = id;
    button.addEventListener('click', () => {
      range = id;
      load();
    });
    seg.append(button);
    return button;
  });
  if (start) head.append(seg);
  const readout = el('div', 'rk-readout');
  readout.setAttribute('aria-live', 'polite');
  const holder = el('div');
  const sum = el('p', 'rk-graph-sum');
  panel.append(readout, holder, sum);

  let drawn = null;
  async function load() {
    for (const chip of chips) chip.setAttribute('aria-pressed', String(chip.dataset.character === character));
    holder.replaceChildren(loading('Loading the rating'));
    readout.replaceChildren();
    sum.replaceChildren();
    const wanted = character;
    let data;
    try {
      data = await ratingRows(ctx, character);
    } catch {
      if (wanted === character)
        holder.replaceChildren(el('div', 'rk-graph-empty', 'The rating is unavailable right now.'));
      return;
    }
    if (wanted !== character) return;
    let points = range === 'season' ? data.rows.filter((row) => Date.parse(row.date) >= start) : data.rows.slice(-50);
    if (range === 'season' && !points.length) {
      range = 'last';
      points = data.rows.slice(-50);
    }
    for (const button of segButtons) button.setAttribute('aria-pressed', String(button.dataset.range === range));
    if (!points.length) {
      holder.replaceChildren(el('div', 'rk-graph-empty', 'No rated sets with this character yet.'));
      return;
    }
    drawn = { points, all: data.rows, complete: data.complete };
    paint();
  }

  function paint() {
    if (!drawn) return;
    const { points, all, complete } = drawn;
    const width = Math.max(300, Math.round(holder.clientWidth || panel.clientWidth - 44 || 900));
    const phone = width < 560;
    const W = width,
      H = phone ? 230 : 300,
      L = phone ? 4 : 8,
      R = phone ? 66 : 96,
      T = 24,
      B = 30,
      fs = 13,
      r = phone ? 2.8 : 3.6;
    const n = points.length;
    const values = [points[0].before, ...points.map((row) => row.after)];
    let lo = Math.min(...values),
      hi = Math.max(...values);
    const pad = Math.max(16, (hi - lo) * 0.14);
    lo -= pad;
    hi += pad;
    const x = (i) => L + (n ? i / n : 0) * (W - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const rated = profile.characters.find((row) => row.character === character);
    const parts = [];
    const text = (px, py, value, anchor = 'start', fill = '#8A9C9C') =>
      parts.push(
        `<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" fill="${fill}" font-size="${fs}" text-anchor="${anchor}">${value}</text>`,
      );
    const lines = table?.ranks.slice(1, 33).filter((row) => row.from != null && row.from >= lo && row.from <= hi) ?? [];
    if (table) {
      const index = isRankId(rated?.rankId) ? Number(rated.rankId.slice(5)) : null;
      const here = index != null ? table.ranks[index] : null,
        next = index != null ? table.ranks[index + 1] : null;
      if (here?.from != null) {
        const top = y(Math.min(hi, next?.from ?? hi)),
          bottom = y(Math.max(lo, here.from));
        if (bottom > top)
          parts.push(
            `<rect x="${L}" width="${W - L - R}" y="${top.toFixed(1)}" height="${(bottom - top).toFixed(1)}" fill="rgba(233,238,237,0.045)"/>`,
          );
      }
      const named = [];
      const order = [...lines].sort(
        (a, b) => (b.rankId === rated?.rankId) - (a.rankId === rated?.rankId) || b.from - a.from,
      );
      for (const row of order)
        if (named.length < 3 && named.every((other) => Math.abs(y(other.from) - y(row.from)) >= fs * 2.2))
          named.push(row);
      for (const row of lines) {
        const isNamed = named.includes(row);
        parts.push(
          `<line x1="${L}" x2="${W - R}" y1="${y(row.from).toFixed(1)}" y2="${y(row.from).toFixed(1)}" stroke="rgba(233,238,237,${isNamed ? 0.14 : 0.05})"/>`,
        );
        if (isNamed) text(W - R + 14, y(row.from) + fs * 0.35, escapeText(row.rank));
      }
    } else {
      const span = hi - lo,
        step = span < 120 ? 20 : span < 300 ? 50 : 100;
      for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
        parts.push(
          `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="rgba(233,238,237,0.08)"/>`,
        );
        text(W - R + 14, y(v) + fs * 0.35, fmt(v));
      }
    }
    // The placing sets, shaded up to the set that placed the character.
    const placedAt = points.findIndex((row) => row.rankBefore == null && row.rankAfter != null);
    if (placedAt >= 0) {
      parts.push(
        `<rect x="${L}" width="${(x(placedAt + 1) - L).toFixed(1)}" y="${T}" height="${H - T - B}" fill="rgba(233,238,237,0.035)"/>`,
      );
      text(L + 6, T + fs + 2, 'Placing');
    }
    const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    parts.push(
      `<path d="${path} L${x(n).toFixed(1)} ${H - B} L${x(0).toFixed(1)} ${H - B} Z" fill="rgba(233,238,237,0.04)"/>`,
    );
    parts.push(`<path d="${path}" fill="none" stroke="#AEBDBD" stroke-width="1.6" stroke-linejoin="round"/>`);
    for (let i = 1; i <= n; i++) {
      const won = wonSet(ctx, points[i - 1]);
      const cx = x(i).toFixed(1),
        cy = y(values[i]).toFixed(1);
      parts.push(
        won === true
          ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#3CC47E"/>`
          : won === false
            ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#140608" stroke="#FF9470" stroke-width="1.6"/>`
            : `<circle cx="${cx}" cy="${cy}" r="${r - 0.8}" fill="#AEBDBD"/>`,
      );
    }
    let peak = 1;
    for (let i = 2; i <= n; i++) if (values[i] >= values[peak]) peak = i;
    const px = x(peak),
      py = y(values[peak]);
    parts.push(`<path d="M${px.toFixed(1)} ${(py - 15).toFixed(1)} l5 5 l-5 5 l-5 -5 Z" fill="#E9EEED"/>`);
    const left = px - L > 96;
    text(
      left ? px - 9 : px + 9,
      py - 14 < T ? py + 24 : py - 14,
      `Peak ${fmt(values[peak])}`,
      left ? 'end' : 'start',
      '#E9EEED',
    );
    parts.push(
      `<circle cx="${x(n).toFixed(1)}" cy="${y(values[n]).toFixed(1)}" r="${r + 4}" fill="none" stroke="#E9EEED" stroke-width="1.5"/>`,
    );
    // Day marks along the bottom: where each day's sets begin, the last one "Today" when it is.
    const marks = [];
    for (let i = 1; i <= n; i++)
      if (i === 1 || !sameDay(points[i - 1].date, points[i - 2].date)) marks.push(i === 1 ? 0 : i - 1);
    let kept = [];
    for (const i of marks) {
      if (kept.length && x(i) - x(kept.at(-1)) < 72) {
        if (i === marks.at(-1) && kept.length > 1) kept.pop();
        else continue;
      }
      kept.push(i);
    }
    if (phone) kept = kept.length > 1 ? [kept[0], kept.at(-1)] : kept;
    for (const [at, i] of kept.entries()) {
      const date = points[Math.min(n - 1, i)].date;
      const label = sameDay(date, Date.now()) ? 'Today' : shortDate(date);
      text(x(i), H - 8, label, at === 0 && i === 0 ? 'start' : i === n ? 'end' : x(i) > W - R - 30 ? 'end' : 'middle');
    }
    parts.push(
      `<line class="rk-cursor" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="rgba(233,238,237,0.45)" stroke-dasharray="3 3" visibility="hidden"/>`,
    );

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'rk-chart');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('tabindex', '0');
    svg.setAttribute(
      'aria-label',
      `${characterName(character)} rating, ${n} sets. Use the arrow keys to read each set.`,
    );
    svg.innerHTML = parts.join('');
    holder.replaceChildren(svg);
    const cursor = svg.querySelector('.rk-cursor');

    let at = n;
    const show = (i) => {
      at = Math.max(1, Math.min(n, i));
      const row = points[at - 1];
      const set = ctx.setsByDate.get(row.date);
      const won = wonSet(ctx, row);
      const bits = [];
      if (won != null)
        bits.push(
          el(
            'span',
            `rk-res ${won ? 'rk-win' : 'rk-loss'}`,
            `${won ? 'Win' : 'Loss'}${set ? ' ' + setScore(set) : ''}`,
          ),
        );
      if (set)
        bits.push(el('span', '', `vs ${set.players[1].player.name} (${characterName(set.players[1].character)})`));
      const number = complete ? all.indexOf(row) + 1 : null;
      const state = row.rankAfter == null ? 'placing' : row.rankBefore == null ? 'placed' : '';
      bits.push(
        el(
          'span',
          'rk-faint',
          [
            number
              ? `Set ${number}${state ? ', ' + state : ''}`
              : state
                ? state.charAt(0).toUpperCase() + state.slice(1)
                : '',
            `${shortDate(row.date)}, ${clock(row.date)}`,
          ]
            .filter(Boolean)
            .join(' · '),
        ),
      );
      bits.push(
        el('span', `rk-delta ${row.change > 0 ? 'rk-win' : row.change < 0 ? 'rk-loss' : ''}`, signed(row.change)),
      );
      bits.push(el('span', 'rk-faint', `${fmt(row.before)} → ${fmt(row.after)}`));
      readout.replaceChildren(...bits);
      cursor.setAttribute('x1', x(at));
      cursor.setAttribute('x2', x(at));
      cursor.setAttribute('visibility', 'visible');
    };
    show(n);
    svg.addEventListener('mousemove', (event) => {
      const box = svg.getBoundingClientRect();
      const fx = ((event.clientX - box.left) / box.width) * W;
      show(Math.round(((fx - L) / (W - L - R)) * n));
    });
    svg.addEventListener('mouseleave', () => show(n));
    svg.addEventListener('keydown', (event) => {
      const step = { ArrowLeft: -1, ArrowRight: 1, Home: -n, End: n }[event.key];
      if (!step) return;
      event.preventDefault();
      show(at + step);
    });

    const first = values[0],
      lastValue = values[n];
    const bits = [];
    const total = el('span');
    if (range === 'season') {
      total.append(el('b', '', signed(lastValue - first)), ` this ${label}`);
      const count = el('span');
      count.append(el('b', '', fmt(n)), ` ${n === 1 ? 'set' : 'sets'} with ${characterName(character)}`);
      bits.push(total, count);
    } else {
      total.append(
        el('b', '', signed(lastValue - first)),
        ` over the last ${fmt(n)} ${n === 1 ? 'set' : 'sets'} with ${characterName(character)}`,
      );
      bits.push(total);
    }
    if (placedAt >= 0 && complete) bits.push(el('span', '', `Placed at set ${all.indexOf(points[placedAt]) + 1}`));
    const flat = points.some((row) => wonSet(ctx, row) == null);
    for (const [cls, word] of [
      ['kw', 'Win'],
      ['kl', 'Loss'],
      ...(flat ? [['kn', 'No change']] : []),
    ]) {
      const key = el('span', 'rk-key');
      key.append(el('i', cls), word);
      bits.push(key);
    }
    sum.replaceChildren(...bits);
  }

  let lastWidth = 0;
  new ResizeObserver(() => {
    const width = Math.round(holder.clientWidth);
    if (drawn && width && Math.abs(width - lastWidth) > 8) {
      lastWidth = width;
      paint();
    }
  }).observe(holder);
  load();
  return panel;
}

const escapeText = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// A Glicko-2 win always raises the rating; with no set to say, a zero change tells nothing either way.
function wonSet(ctx, row) {
  const set = ctx.setsByDate.get(row.date);
  if (set) return set.players[0].won;
  return row.change > 0 ? true : row.change < 0 ? false : null;
}

// ---- Characters ----

function characterCards(ctx) {
  const { profile, table } = ctx;
  const grid = el('section', 'rk-chars');
  grid.setAttribute('aria-label', 'Characters');
  for (const row of profile.characters) {
    const card = el('article', 'rk-char rk-panel');
    const top = el('div', 'rk-char-top');
    const names = el('div');
    const setRec = setRecord(ctx, row);
    const sets = int(row.ratedSets) ?? setRec?.sets ?? null;
    names.append(
      el('div', 'rk-char-name', characterName(row.character)),
      el(
        'div',
        'rk-char-sets',
        sets != null
          ? `${fmt(sets)} ${sets === 1 ? 'set' : 'sets'}`
          : `${fmt(row.games)} ${row.games === 1 ? 'game' : 'games'}`,
      ),
    );
    top.append(face(row.character, 40), names);
    card.append(top);
    const recordText = setRec
      ? `${record(setRec.wins, setRec.losses)} sets · ${pct(setRec.wins, setRec.losses)}`
      : `${record(row.wins, row.losses)} games · ${row.winRate == null ? '–' : Math.round(row.winRate * 100) + '%'}`;
    if (placed(row)) {
      const badge = el('div', 'rk-char-badge');
      const image = plate(row.rankId);
      if (image) badge.append(image);
      badge.append(row.rank);
      const mmr = el('div', 'rk-char-mmr', fmt(row.mmr));
      if (int(row.rd) != null) mmr.append(el('span', 'rk-rd', `± ${fmt(row.rd)}`));
      if (settling(row.rd, table)) mmr.append(unsure());
      const line = el('div', 'rk-char-line');
      line.append(el('span', '', recordText));
      if (int(row.peakMmr) != null) line.append(el('span', '', `Peak ${fmt(row.peakMmr)}`));
      card.append(badge, mmr, line);
      const next = nextBadge(table, row.rankId, row.mmr);
      if (next) card.append(bar(next.share), el('div', 'rk-char-next', `${fmt(next.need)} to ${next.name}`));
    } else if (Number.isFinite(row.mmr)) {
      card.append(placingLine(row, 'rk-char-placing'));
      const line = el('div', 'rk-char-line');
      line.append(
        el(
          'span',
          '',
          setRec
            ? `${record(setRec.wins, setRec.losses)} sets so far`
            : `${record(row.wins, row.losses)} games so far`,
        ),
      );
      card.append(line);
    } else {
      card.append(el('div', 'rk-char-placing', 'No rated set yet'));
      const line = el('div', 'rk-char-line');
      line.append(el('span', '', `${record(row.wins, row.losses)} games`));
      card.append(line);
    }
    grid.append(card);
  }
  if (!profile.characters.length) grid.append(empty('No characters yet.'));
  return grid;
}

// ---- Sets ----

// One set from the player's side: result and score, their character, the opponent, the games, the MMR change.
// It opens to show the rounds, both players before and after, and a link to the set page.
function setRow(ctx, set) {
  const [mine, other] = set.players;
  const won = mine.won;
  const row = el('button', 'rk-set rk-set-cols');
  row.type = 'button';
  row.setAttribute('aria-expanded', 'false');
  const res = el('span', 'rk-s-res');
  res.append(
    el('span', `rk-res ${won ? 'rk-win' : 'rk-loss'}`, won ? 'Win' : 'Loss'),
    el('span', 'rk-sc', setScore(set)),
  );
  const opp = el('span', 'rk-s-opp');
  const names = el('span', 'rk-n');
  names.append(el('b', '', other.player.name));
  if (other.player.tag) names.append(' ', el('span', 'rk-faint', `#${other.player.tag}`));
  names.append(el('span', 'rk-sub', characterName(other.character)));
  opp.append(face(other.character, 40), names);
  const games = el('span', 'rk-s-games');
  games.append(gameLetters(set));
  const delta = el('span', 'rk-s-delta');
  const change = mine.ratingChange?.change;
  delta.append(
    el('b', change > 0 ? 'rk-win' : change < 0 ? 'rk-loss' : '', change == null ? '' : signed(change)),
    el('span', '', ago(set.date)),
  );
  const more = el('span', 'rk-s-more');
  more.innerHTML = CHEVRON;
  row.append(
    res,
    face(mine.character, 24, { label: characterName(mine.character), className: 'rk-s-mine' }),
    opp,
    games,
    delta,
    el('span', 'rk-s-when', ago(set.date)),
    more,
  );

  const detail = el('div', 'rk-set-detail');
  detail.hidden = true;
  const fact = (label, value, after = '') => {
    const item = el('span', '', label ? label + ' ' : '');
    item.append(el('b', '', value));
    if (after) item.append(after);
    detail.append(item);
  };
  const roundText = rounds(set);
  if (roundText) fact('Rounds', roundText);
  for (const side of [mine, other])
    if (side.ratingChange)
      fact(
        side.player.name,
        `${fmt(side.ratingChange.before)} → ${fmt(side.ratingChange.after)}`,
        side === other ? ` (${signed(side.ratingChange.change)})` : '',
      );
  if (set.outcome === 'quit') detail.append(el('span', '', 'Forfeit'));
  detail.append(el('span', 'rk-faint', `${dayLabel(set.date)}, ${clock(set.date)}`));
  const page = setPath(mine.player, set.id);
  if (page) detail.append(link('Set page', page));
  const them = playerPath(other.player);
  if (them) detail.append(link(`${other.player.name}'s page`, them));
  row.addEventListener('click', () => {
    const open = row.getAttribute('aria-expanded') !== 'true';
    row.setAttribute('aria-expanded', String(open));
    detail.hidden = !open;
  });
  return [row, detail];
}

// A compact set line. The portrait sits beside the opponent's name and shows their character; when a label
// (a date, on head to head) takes the name's place, it shows the player's own character instead.
function miniRow(ctx, set, label) {
  const [mine, other] = set.players;
  const pictured = label ? mine : other;
  const href = setPath(mine.player, set.id);
  const row = el(href ? 'a' : 'div', 'rk-mini');
  if (href) row.href = href;
  const res = el('span');
  res.append(
    el('span', `rk-res ${mine.won ? 'rk-win' : 'rk-loss'}`, mine.won ? 'Win' : 'Loss'),
    ' ',
    el('span', 'rk-sc', setScore(set)),
  );
  const who = el('span');
  if (label) who.append(label);
  else who.append(el('b', '', other.player.name), ' ', el('span', 'rk-faint', characterName(other.character)));
  const change = mine.ratingChange?.change;
  const delta = el('b', change > 0 ? 'rk-win' : change < 0 ? 'rk-loss' : '', change == null ? '' : signed(change));
  const time = el('span', 'rk-faint', clock(set.date));
  row.append(
    res,
    face(pictured.character, 24, { label: characterName(pictured.character) }),
    who,
    gameLetters(set),
    delta,
    time,
  );
  return row;
}

function setsTab(ctx, view) {
  const { profile, base } = ctx;
  const panel = el('section', 'rk-panel rk-tab-panel');
  const filters = el('div', 'rk-filters');
  const list = el('div');
  const more = el('button', 'rk-btn', 'Older sets');
  more.type = 'button';
  more.hidden = true;
  more.classList.add('rk-more-link');
  panel.append(filters, list, more);
  view.append(panel);
  const chars = profile.characters.filter((row) => Number.isFinite(row.mmr));
  let character = '',
    cursor = null,
    lastDay = null;
  const chips = [['', 'All characters'], ...chars.map((row) => [row.character, characterName(row.character)])].map(
    ([id, title]) => {
      const chip = el('button', 'rk-chip');
      chip.type = 'button';
      if (id) chip.append(face(id, 24));
      chip.append(title);
      chip.addEventListener('click', () => {
        character = id;
        load(false);
      });
      chip.dataset.character = id;
      return chip;
    },
  );
  filters.append(...chips);
  async function load(append) {
    for (const chip of chips) chip.setAttribute('aria-pressed', String(chip.dataset.character === character));
    if (!append) {
      list.replaceChildren(loading('Loading sets'));
      lastDay = null;
    }
    more.disabled = true;
    try {
      const data = await fetchRanked(base, profileEndpoint(profile.player) + '/sets', 'sets', {
        character,
        limit: 20,
        cursor: append ? cursor : null,
      });
      if (!append) list.replaceChildren();
      for (const set of data.rows) {
        ctx.setsByDate.set(set.date, set);
        const day = dayLabel(set.date);
        if (day !== lastDay) list.append(el('p', 'rk-day', day));
        lastDay = day;
        list.append(miniRow(ctx, set));
      }
      if (!list.childElementCount) list.append(empty('No rated sets here yet.'));
      cursor = data.nextCursor;
      more.hidden = !cursor;
    } catch (error) {
      if (append && error.status === 400) return load(false);
      list.replaceChildren(empty('Sets are unavailable right now.'));
      more.hidden = true;
    } finally {
      more.disabled = false;
    }
  }
  more.addEventListener('click', () => load(true));
  load(false);
}

// ---- Matchups ----

function matchupRows(ctx) {
  if (!ctx.cache.has('matchups'))
    ctx.cache.set(
      'matchups',
      fetchRanked(ctx.base, profileEndpoint(ctx.profile.player) + '/matchups', 'player-matchups').then(
        (data) => data.rows,
      ),
    );
  return ctx.cache.get('matchups');
}
function byOpponent(rows, character) {
  const total = new Map();
  for (const row of rows) {
    if (character && row.character !== character) continue;
    const item = total.get(row.opponentCharacter) ?? { character: row.opponentCharacter, games: 0, wins: 0, losses: 0 };
    item.games += row.games;
    item.wins += row.wins;
    item.losses += row.losses;
    total.set(row.opponentCharacter, item);
  }
  return [...total.values()].sort(
    (a, b) => b.games - a.games || characterName(a.character).localeCompare(characterName(b.character)),
  );
}
const winShare = (row) => (row.wins + row.losses ? row.wins / (row.wins + row.losses) : null);

function matchupSummary(ctx, rows) {
  const items = byOpponent(rows);
  if (!items.length) return [empty('No matchups yet.')];
  const out = [];
  const enough = items.filter((row) => row.games >= FEW_GAMES && winShare(row) != null);
  if (enough.length >= 2) {
    const best = enough.reduce((a, b) => (winShare(b) > winShare(a) ? b : a));
    const hardest = enough.reduce((a, b) => (winShare(b) < winShare(a) ? b : a));
    const pair = el('div', 'rk-bw');
    for (const [title, row] of [
      ['Best', best],
      ['Hardest', hardest],
    ]) {
      const box = el('div');
      box.append(
        el('span', 'rk-cap', title),
        el('b', '', characterName(row.character)),
        el('span', 'rk-faint', `${Math.round(winShare(row) * 100)}% · ${fmt(row.games)} games`),
      );
      pair.append(box);
    }
    out.push(pair);
  }
  for (const row of items.slice(0, 6)) out.push(matchupLine(row));
  out.push(el('p', 'rk-note', `Under ${FEW_GAMES} games shows faded.`));
  const every = link('Every matchup', `${ctx.path}/matchups`, 'rk-link rk-more-link');
  every.dataset.inPage = '';
  out.push(every);
  return out;
}
function matchupLine(row) {
  const share = winShare(row);
  const line = el('div', 'rk-mu' + (row.games < FEW_GAMES ? ' is-few' : ''));
  const name = el('span', 'rk-n', characterName(row.character));
  name.append(el('small', '', fmt(row.games)));
  const track = el('span', 'rk-dv');
  track.setAttribute('aria-hidden', 'true');
  if (share != null) {
    const fill = el('i');
    const width = Math.abs(share - 0.5) * 100;
    fill.style.left = `${share >= 0.5 ? 50 : 50 - width}%`;
    fill.style.width = `${width}%`;
    track.append(fill);
  }
  line.append(
    face(row.character, 24),
    name,
    track,
    el('span', 'rk-p', share == null ? '–' : `${Math.round(share * 100)}%`),
  );
  return line;
}

function matchupsTab(ctx, view) {
  const panel = el('section', 'rk-panel rk-tab-panel');
  panel.append(loading('Loading matchups'));
  view.append(panel);
  matchupRows(ctx).then(
    (rows) => {
      const mine = [...new Set(rows.map((row) => row.character))];
      let character = '',
        sort = ['games', -1];
      const filters = el('div', 'rk-filters');
      const chips = [['', 'All characters'], ...mine.map((id) => [id, characterName(id)])].map(([id, title]) => {
        const chip = el('button', 'rk-chip');
        chip.type = 'button';
        if (id) chip.append(face(id, 24));
        chip.append(title);
        chip.dataset.character = id;
        chip.addEventListener('click', () => {
          character = id;
          draw();
        });
        return chip;
      });
      filters.append(...chips);
      const tableBox = el('table', 'rk-mtab');
      const note = el('p', 'rk-note', `Games. Under ${FEW_GAMES} games shows faded. Select a heading to sort.`);
      panel.replaceChildren(filters, tableBox, note);
      const columns = [
        ['character', ["Opponent's character", 'Opponent'], ''],
        ['games', 'Games', 'rk-r'],
        ['record', 'W–L', 'rk-r'],
        ['share', 'Win', 'rk-r'],
      ];
      const value = {
        character: (row) => characterName(row.character),
        games: (row) => row.games,
        record: (row) => row.wins - row.losses,
        share: (row) => winShare(row) ?? -1,
      };
      function draw() {
        for (const chip of chips) chip.setAttribute('aria-pressed', String(chip.dataset.character === character));
        const items = byOpponent(rows, character);
        const [key, direction] = sort;
        items.sort((a, b) => {
          const left = value[key](a),
            right = value[key](b);
          return (typeof left === 'string' ? left.localeCompare(right) : left - right) * direction || b.games - a.games;
        });
        const head = el('thead');
        const headRow = el('tr');
        for (const [id, title, cls] of columns) {
          const th = el('th', cls);
          th.scope = 'col';
          // A narrow table takes the short heading.
          const button = el('button');
          if (Array.isArray(title)) button.append(el('span', 'rk-long', title[0]), el('span', 'rk-short', title[1]));
          else button.textContent = title;
          button.type = 'button';
          button.addEventListener('click', () => {
            sort = [id, sort[0] === id ? -sort[1] : id === 'character' ? 1 : -1];
            draw();
          });
          if (sort[0] === id) th.setAttribute('aria-sort', sort[1] > 0 ? 'ascending' : 'descending');
          th.append(button);
          headRow.append(th);
        }
        head.append(headRow);
        const body = el('tbody');
        for (const row of items) {
          const tr = el('tr', row.games < FEW_GAMES ? 'is-few' : '');
          const who = el('span', 'rk-who');
          who.append(face(row.character, 24), el('span', 'rk-cn', characterName(row.character)));
          const first = el('td', 'rk-mtab-who');
          first.append(who);
          tr.append(
            first,
            el('td', 'rk-r', fmt(row.games)),
            el('td', 'rk-r', record(row.wins, row.losses)),
            el('td', 'rk-r', winShare(row) == null ? '–' : `${Math.round(winShare(row) * 100)}%`),
          );
          body.append(tr);
        }
        tableBox.replaceChildren(head, body);
        if (!items.length) tableBox.replaceChildren(el('caption', '', 'No games with this character yet.'));
      }
      draw();
    },
    () => panel.replaceChildren(empty('Matchups are unavailable right now.')),
  );
}

// ---- Head to head ----

function opponents(ctx) {
  if (!ctx.cache.has('h2h'))
    ctx.cache.set(
      'h2h',
      fetchRanked(ctx.base, profileEndpoint(ctx.profile.player) + '/head-to-head', 'head-to-head').then((data) =>
        [...data.rows].sort((a, b) => b.games - a.games || b.lastPlayedAt.localeCompare(a.lastPlayedAt)),
      ),
    );
  return ctx.cache.get('h2h');
}
const vsPath = (ctx, player) => {
  const path = playerPath(player);
  return path ? `${ctx.path}/vs/${path.slice('/player/'.length)}` : null;
};

function rivalList(ctx, rows, teaser) {
  if (!rows.length) return [empty('No opponents yet.')];
  const out = rows.map((row) => {
    const href = vsPath(ctx, row.opponent);
    const line = el(href ? 'a' : 'div', 'rk-rival');
    if (href) {
      line.href = href;
      line.dataset.inPage = '';
    }
    const names = el('div');
    names.append(el('b', '', row.opponent.name));
    if (row.opponent.tag) names.append(' ', el('span', 'rk-faint', `#${row.opponent.tag}`));
    names.append(el('div', 'rk-faint', `Last met ${lower(ago(row.lastPlayedAt))}`));
    line.append(face(row.opponent.avatarCharacter, 40), names, el('span', 'rk-sc', record(row.wins, row.losses)));
    return line;
  });
  if (teaser) {
    const every = link('Every opponent', `${ctx.path}/vs`, 'rk-link rk-more-link');
    every.dataset.inPage = '';
    out.push(every);
  }
  return out;
}

function headToHeadTab(ctx, view) {
  const { profile, base } = ctx;
  const panel = el('section', 'rk-panel rk-tab-panel');
  const pick = el('div', 'rk-h2h-pick');
  const form = searchForm('Find an opponent', { big: false });
  playerSearch(form, {
    base,
    slash: false,
    onPick: (path) => ctx.go(`${ctx.path}/vs/${path.slice('/player/'.length)}`),
  });
  pick.append(el('span', 'rk-cap', 'Opponent'), form);
  const body = el('div');
  panel.append(pick, body);
  view.append(panel);
  const opponent = ctx.route.opponent;
  if (!opponent) {
    body.append(loading('Loading opponents'));
    opponents(ctx).then(
      (rows) => body.replaceChildren(...rivalList(ctx, rows, false)),
      () => body.replaceChildren(empty('Head to head is unavailable right now.')),
    );
    return;
  }
  form.querySelector('input').value = `${opponent.name}#${opponent.tag}`;
  body.append(loading(`Loading ${opponent.name}`));
  const query = `${opponent.name}#${opponent.tag}`;
  const endpoint = profileEndpoint(profile.player);
  Promise.all([
    fetchRanked(base, endpoint + '/head-to-head', 'head-to-head', { opponent: query }),
    ctx.hasSets
      ? fetchRanked(base, endpoint + '/sets', 'sets', { opponent: query, limit: 50 }).catch(() => null)
      : null,
  ]).then(
    ([games, sets]) => {
      const row =
        games.rows.find(
          (item) =>
            item.opponent.tag === opponent.tag && item.opponent.name.toLowerCase() === opponent.name.toLowerCase(),
        ) ?? games.rows[0];
      if (!row) return body.replaceChildren(empty(`No rated games against ${opponent.name} yet.`));
      const setRows = sets?.rows ?? [];
      for (const set of setRows) ctx.setsByDate.set(set.date, set);
      const setWins = setRows.filter((set) => set.players[0].won).length;
      const setLosses = setRows.length - setWins;
      const vs = el('div', 'rk-h2h-vs');
      const side = (player, character, right) => {
        const box = el('div', 'rk-side' + (right ? ' rk-r' : ''));
        const names = el('div');
        const href = playerPath(player);
        names.append(
          href && right ? link(player.name, href, '') : el('b', '', player.name),
          el('div', 'rk-faint', characterName(character)),
        );
        box.append(face(character, 40), names);
        return box;
      };
      const mainCharacter = setRows[0]?.players[0].character ?? profile.player.avatarCharacter;
      const theirCharacter = setRows[0]?.players[1].character ?? row.opponent.avatarCharacter;
      const useSets = setRows.length > 0 && !sets.nextCursor;
      const score = el('div', 'rk-h2h-score');
      score.append(
        el('span', 'rk-cap', useSets ? 'Sets' : 'Games'),
        el('div', 'rk-big', useSets ? record(setWins, setLosses) : record(row.wins, row.losses)),
      );
      vs.append(side(profile.player, mainCharacter, false), score, side(row.opponent, theirCharacter, true));
      const facts = el('div', 'rk-h2h-facts');
      const fact = (label, value) => {
        const item = el('span', '', label + ' ');
        item.append(el('b', '', value));
        facts.append(item);
      };
      if (useSets) fact('Games', record(row.wins, row.losses));
      fact('Last met', lower(ago(row.lastPlayedAt)));
      body.replaceChildren(vs, facts);
      for (const set of setRows)
        body.append(miniRow(ctx, set, sameDay(set.date, Date.now()) ? 'Today' : shortDate(set.date)));
    },
    (error) =>
      body.replaceChildren(
        empty(error.status === 404 ? `No player called ${query}.` : 'Head to head is unavailable right now.'),
      ),
  );
}

// ---- Set page ----

function setPage(ctx) {
  const { root, base, route } = ctx;
  root.replaceChildren(loading('Loading the set'));
  fetchRanked(base, `sets/${route.setId}`, 'set').then(
    (data) => {
      const set = data.set;
      const first = set.players.findIndex(
        (side) =>
          side.player.tag === route.player.tag && side.player.name.toLowerCase() === route.player.name.toLowerCase(),
      );
      const sides = first === 1 ? [set.players[1], set.players[0]] : set.players;
      const flipped = first === 1;
      document.title = `${sides[0].player.name} vs ${sides[1].player.name} | Project Backdash`;
      const title = el('h1', 'label-tab', 'Set');
      const line = el('p', 'rk-head-line');
      line.append(
        el('span', 'rk-pill', seasonLabel(data)),
        `${dayLabel(set.date)}, ${clock(set.date)}${set.outcome === 'quit' ? ' · Forfeit' : ''}`,
      );
      const panel = el('section', 'rk-setpage rk-panel');
      const vs = el('div', 'rk-setpage-vs');
      const side = (s, right) => {
        const box = el('div', 'rk-setpage-side' + (right ? ' rk-r' : ''));
        const href = playerPath(s.player);
        const name = href ? link(s.player.name, href, '') : el('b', '', s.player.name);
        box.append(
          face(s.character, 80, { label: characterName(s.character) }),
          name,
          el('span', 'rk-sub', characterName(s.character)),
        );
        const image = plate(s.ratingChange?.rankAfter);
        if (image) {
          image.classList.add('rk-plate');
          box.append(image);
        }
        if (s.ratingChange) {
          const change = el('span', 'rk-sub', `${fmt(s.ratingChange.before)} → ${fmt(s.ratingChange.after)} `);
          change.append(
            el(
              'b',
              s.ratingChange.change > 0 ? 'rk-win' : s.ratingChange.change < 0 ? 'rk-loss' : '',
              signed(s.ratingChange.change),
            ),
          );
          box.append(change);
        }
        return box;
      };
      const score = sides.every((s) => s.score != null) ? `${sides[0].score}–${sides[1].score}` : '–';
      vs.append(side(sides[0], false), el('div', 'rk-big', score), side(sides[1], true));
      panel.append(vs);
      if (set.gameList?.length) {
        const list = el('div', 'rk-setpage-games');
        for (const game of set.gameList) {
          const row = el('div', 'rk-game');
          const winner = game.winner === null ? null : flipped ? 1 - game.winner : game.winner;
          const letter = el('span', 'rk-wl');
          letter.append(
            el('i', winner === null ? 'd' : winner === 0 ? 'w' : 'l', winner === null ? '–' : winner === 0 ? 'W' : 'L'),
          );
          const detail = el('span');
          const roundPair = game.rounds ? (flipped ? [game.rounds[1], game.rounds[0]] : game.rounds) : null;
          detail.append(winner === null ? 'Drawn, replayed' : `${sides[winner].player.name} won`);
          if (roundPair) detail.append(' · Rounds ', el('b', '', roundPair.join('–')));
          row.append(el('span', '', `Game ${game.number ?? ''}`), letter, detail);
          list.append(row);
        }
        panel.append(list);
      }
      const back = el('p', 'rk-foot');
      const home = playerPath(sides[0].player);
      if (home) back.append(link(`${sides[0].player.name}'s page`, home), ' · ');
      back.append(link('The board', '/ranked/'));
      root.replaceChildren(title, line, panel, back);
    },
    (error) => {
      const box = el('section', 'rk-panel rk-tab-panel');
      box.append(
        el('h1', 'rk-missing', error.status === 404 ? 'No set at this address.' : 'This set is unavailable right now.'),
      );
      const text = el('p', 'rk-missing-note');
      const home = playerPath(route.player);
      if (home) text.append(link(`${route.player.name}'s page`, home));
      box.append(text);
      root.replaceChildren(box);
    },
  );
}
