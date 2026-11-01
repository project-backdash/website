// <!-- check-allow: ranked -->
// <!-- check-allow: profiles -->
// The player card a player page shares: the player, one character's rank and MMR (or its placement sets while it
// places), the facts they pick and up to two widgets, at the size each place shows best (a 4:5 post, a 9:16 story or
// a 16:9 wide picture). cardModel() reads the stats into what the card says and cardLayout() places its parts; both
// are plain functions. drawCard() paints them with the Canvas 2D API. Every picture it draws is served by
// backdash.gg itself, so the canvas can always be saved as a PNG, and a picture that did not load is left out: a
// portrait leaves its empty frame, a plate nothing.
import { CHARACTERS, characterName } from '/assets/js/ranked-data.mjs?v=dde3981e98';
import {
  fmt,
  signed,
  record,
  pct,
  int,
  regionName,
  isRankId,
  isPlaced,
  isPlacing,
  sameDay,
  shortDate,
  seasonLabel,
  setScore,
} from '/assets/js/ranked-kit.mjs?v=a623c764b6';

export const FORMATS = [
  { id: 'post', name: 'Post', ratio: '4:5', width: 1080, height: 1350 },
  { id: 'story', name: 'Story', ratio: '9:16', width: 1080, height: 1920 },
  { id: 'wide', name: 'Wide', ratio: '16:9', width: 1920, height: 1080 },
];
// Each accent tints the card's field (the launcher's radial field, centre to edge) and draws its rules and graph.
export const ACCENTS = [
  {
    id: 'crimson',
    name: 'Crimson',
    line: '#E3304F',
    field: ['#5A0E18', '#470B15', '#2F0810', '#1D0609', '#140608'],
    panel: 'rgba(9, 2, 3, 0.86)',
  },
  {
    id: 'gold',
    name: 'Gold',
    line: '#F4B63F',
    field: ['#553A0E', '#432D0B', '#2D1E08', '#1C1305', '#140D04'],
    panel: 'rgba(10, 7, 2, 0.86)',
  },
  {
    id: 'petrol',
    name: 'Petrol',
    line: '#45C2B5',
    field: ['#0D4347', '#0A3438', '#072426', '#051718', '#041011'],
    panel: 'rgba(2, 8, 9, 0.86)',
  },
  {
    id: 'violet',
    name: 'Violet',
    line: '#B48CF5',
    field: ['#37195F', '#2A134A', '#1D0E33', '#130922', '#0D0618'],
    panel: 'rgba(7, 3, 12, 0.86)',
  },
  {
    id: 'green',
    name: 'Green',
    line: '#3CC47E',
    field: ['#10452B', '#0C3621', '#092617', '#06180F', '#04100A'],
    panel: 'rgba(2, 8, 5, 0.86)',
  },
  {
    id: 'white',
    name: 'White',
    line: '#E9EEED',
    field: ['#353C40', '#2A3033', '#1E2325', '#141718', '#0E1011'],
    panel: 'rgba(6, 7, 8, 0.86)',
  },
];
export const WIDGETS = [
  { id: 'graph', name: 'Rating graph' },
  { id: 'sets', name: 'Recent sets' },
  { id: 'record', name: 'Record and win rate' },
  { id: 'matchups', name: 'Best and hardest matchup' },
  { id: 'characters', name: 'Characters' },
];
export const DETAILS = [
  { id: 'mmr', name: 'MMR' },
  { id: 'place', name: 'Place' },
  { id: 'region', name: 'Region' },
  { id: 'tag', name: 'Tag' },
  { id: 'record', name: 'Set record' },
  { id: 'today', name: "Today's change" },
];
export const MAX_WIDGETS = 2;
// The most sets the Recent sets widget lists; the dialog reads no more than this.
export const SET_ROWS = 5;
// As on the player page: a matchup under 10 games says too little to call it best or hardest.
const FEW_GAMES = 10;
const STORE_KEY = 'pbd-share-card';

const ids = (list) => list.map((item) => item.id);
const faceUrl = (id) => (CHARACTERS.includes(id) ? `/assets/portraits/${id}.png` : null);
const plateUrl = (id) => (isRankId(id) ? `/assets/rank-plates/${id}.png` : null);

// ---- Choices ---------------------------------------------------------------------------------------------------

export function defaultChoices() {
  return {
    format: 'post',
    accent: 'crimson',
    rank: 'current',
    scope: 'all',
    widgets: ['graph', 'sets'],
    details: Object.fromEntries(ids(DETAILS).map((id) => [id, true])),
  };
}

// Any saved or passed value made safe: unknown names fall back to the defaults, widgets stay in the order they were
// picked (the newest last) without repeats.
export function cleanChoices(value) {
  const base = defaultChoices();
  const given = value && typeof value === 'object' ? value : {};
  const one = (list, item, fallback) => (ids(list).includes(item) ? item : fallback);
  const widgets = Array.isArray(given.widgets)
    ? [...new Set(given.widgets.filter((id) => ids(WIDGETS).includes(id)))]
    : base.widgets;
  const details = { ...base.details };
  if (given.details && typeof given.details === 'object')
    for (const id of ids(DETAILS)) if (typeof given.details[id] === 'boolean') details[id] = given.details[id];
  return {
    character: typeof given.character === 'string' ? given.character : null,
    format: one(FORMATS, given.format, base.format),
    accent: one(ACCENTS, given.accent, base.accent),
    rank: ['current', 'peak'].includes(given.rank) ? given.rank : base.rank,
    scope: ['all', 'region'].includes(given.scope) ? given.scope : base.scope,
    widgets,
    details,
  };
}

// Ticking a widget when two are drawn already replaces the older of the two. Wished widgets the character has no
// data for stay wished, for a character that has them.
export function pickWidget(wished, id, on, available) {
  const rest = wished.filter((item) => item !== id);
  if (!on) return rest;
  const next = [...rest, id];
  const shown = next.filter((item) => available.includes(item));
  return next.filter((item) => !shown.slice(0, -MAX_WIDGETS).includes(item));
}

// The last choices in this browser. Storage may be off or full: the card then starts from the defaults each time.
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
export function readChoices(store = storage()) {
  try {
    const saved = cleanChoices(JSON.parse(store?.getItem(STORE_KEY) ?? 'null'));
    saved.character = null;
    return saved;
  } catch {
    return defaultChoices();
  }
}
export function keepChoices(choices, store = storage()) {
  try {
    const { format, accent, rank, scope, widgets, details } = cleanChoices(choices);
    store?.setItem(STORE_KEY, JSON.stringify({ format, accent, rank, scope, widgets, details }));
  } catch {
    /* storage is off or full: the choices last while the page is open */
  }
}

// ---- What the card can say -------------------------------------------------------------------------------------

// The characters a card can show: every placed one, highest MMR first, or for a player with none placed yet the ones
// still placing, the furthest along first. The card starts on the character the page's header shows.
export function cardCharacters(profile) {
  const all = profile?.characters ?? [];
  const byName = (a, b) => characterName(a.character).localeCompare(characterName(b.character));
  const placed = all.filter(isPlaced).sort((a, b) => b.mmr - a.mmr || byName(a, b));
  if (placed.length) return placed;
  return all
    .filter(isPlacing)
    .sort((a, b) => b.placementSets - a.placementSets || (int(b.games) ?? 0) - (int(a.games) ?? 0) || byName(a, b));
}
function startCharacter(profile, rows) {
  return rows.find((row) => row.character === profile?.rating?.character)?.character ?? rows[0]?.character ?? null;
}

function rankAt(table, mmr) {
  let id = null;
  for (const row of table?.ranks ?? []) if (row.from != null && row.from <= mmr) id = row.rankId;
  return id;
}
function rankName(table, id, fallback = null) {
  return (isRankId(id) && table?.ranks?.[Number(id.slice(5))]?.rank) || fallback;
}
// The peak, when it is above where the character is now: at the current MMR it would draw the same card.
function peakOf(row, table) {
  if (!Number.isFinite(row.peakMmr) || !(row.peakMmr > row.mmr)) return null;
  const id = isRankId(row.peakRankId) ? row.peakRankId : rankAt(table, row.peakMmr);
  const name = rankName(table, id, id === row.rankId ? row.rank : null);
  return isRankId(id) && name ? { id, name, mmr: row.peakMmr } : null;
}

// A character's set record: its own, else the board row's when the board lists the player by that character.
function setRecordOf(row, own) {
  const [wins, losses] =
    int(row.setWins) != null && int(row.setLosses) != null ? [row.setWins, row.setLosses] : [own?.wins, own?.losses];
  return int(wins) != null && int(losses) != null && wins + losses > 0 ? { wins, losses } : null;
}

// Today's change in the reader's own day, from the character's rating rows (oldest first). When every row read is
// from today and older ones exist, the day may have started further back, so it is left unsaid.
export function todayOf(history, now) {
  const rows = history?.rows;
  if (!Array.isArray(rows)) return null;
  const done = rows.filter((row) => sameDay(row.date, now));
  if (!done.length || (!history.complete && done.length === rows.length)) return null;
  return {
    change: done.reduce((sum, row) => sum + (Number.isFinite(row.change) ? row.change : 0), 0),
    wins: done.filter((row) => row.change > 0).length,
    losses: done.filter((row) => row.change < 0).length,
  };
}

// The rating line: this season's sets with the character, or its last 50 when the season's start is unknown. A card
// headed with the season never draws sets from before it, so with fewer than two season sets there is no graph.
// `rankId` is the character's badge, whose line is named first.
export function graphOf(history, table, now, rankId = null) {
  const rows = history?.rows ?? [];
  const start = table?.startedAt ? Date.parse(table.startedAt) : NaN;
  const season = Number.isFinite(start);
  const points = season ? rows.filter((row) => Date.parse(row.date) >= start) : rows.slice(-50);
  if (points.length < 2) return null;
  const values = [points[0].before, ...points.map((row) => row.after)];
  // A set that starts away from where the one before it ended (the rating moved between them) starts a new stretch
  // of line, and the change adds up the sets themselves.
  const starts = points.map((row, i) => (i && Math.abs(row.before - points[i - 1].after) >= 0.5 ? row.before : null));
  let peak = 1;
  for (let i = 2; i < values.length; i++) if (values[i] >= values[peak]) peak = i;
  const sets = `${fmt(points.length)} sets`;
  return {
    kind: 'graph',
    values,
    starts,
    // A Glicko-2 win always raises the rating and a loss lowers it; no change says nothing either way.
    results: points.map((row) => (row.change > 0 ? 'w' : row.change < 0 ? 'l' : 'n')),
    peak,
    from: shortDate(points[0].date),
    to: shortDate(points.at(-1).date),
    today: sameDay(points[0].date, now),
    change: points.reduce((sum, row) => sum + (Number.isFinite(row.change) ? row.change : row.after - row.before), 0),
    note: season ? `over ${sets}` : `over the last ${sets}`,
    lines: (table?.ranks ?? [])
      .slice(1, 33)
      .filter((row) => Number.isFinite(row.from))
      .map((row) => ({ from: row.from, name: row.rank, mine: row.rankId === rankId })),
  };
}

export function setsOf(rows, character) {
  if (!Array.isArray(rows)) return null;
  const list = rows
    .filter((set) => set.players?.[0]?.character === character)
    .slice(0, SET_ROWS)
    .map((set) => {
      const [mine, other] = set.players;
      return {
        won: mine.won,
        score: setScore(set),
        opponent: other.player.name,
        character: other.character,
        change: Number.isFinite(mine.ratingChange?.change) ? mine.ratingChange.change : null,
        forfeit: set.outcome === 'quit',
      };
    });
  return list.length ? { kind: 'sets', rows: list } : null;
}

const winShare = (row) => row.wins / (row.wins + row.losses);
export function matchupsOf(rows, character) {
  if (!Array.isArray(rows)) return null;
  const enough = rows.filter(
    (row) => row.character === character && row.games >= FEW_GAMES && row.wins + row.losses > 0,
  );
  if (enough.length < 2) return null;
  const pick = (better) =>
    enough.reduce((a, b) =>
      better(winShare(b), winShare(a)) || (winShare(b) === winShare(a) && b.games > a.games) ? b : a,
    );
  const best = pick((x, y) => x > y);
  const hardest = pick((x, y) => x < y);
  if (best === hardest) return null;
  const item = (row) => ({
    character: row.opponentCharacter,
    name: characterName(row.opponentCharacter),
    rate: pct(row.wins, row.losses),
    games: row.games,
  });
  return { kind: 'matchups', best: item(best), hardest: item(hardest) };
}

function charactersOf(rows, table) {
  if (rows.length < 2) return null;
  return {
    kind: 'characters',
    rows: rows.slice(0, 3).map((row) => ({
      character: row.character,
      name: characterName(row.character),
      rankId: row.rankId,
      rank: rankName(table, row.rankId, row.rank),
      mmr: row.mmr,
    })),
  };
}

// Everything known about one of the player's card characters. `source` is the page's profile, the rank table and
// board row when they loaded, and the character's own reads (`data`: rating rows, sets, the player's matchups).
function read(source, character) {
  const { profile, table = null, board = null, data = {}, now = Date.now() } = source;
  const rows = cardCharacters(profile);
  const wanted = rows.some((row) => row.character === character) ? character : startCharacter(profile, rows);
  const row = rows.find((item) => item.character === wanted);
  if (!row) return null;
  const placing = !isPlaced(row);
  const own = board?.character === row.character ? board : null;
  const region = regionName(profile.player.region ?? board?.region) || null;
  const places = {};
  const position = int(row.position) ?? int(own?.position);
  if (!placing && position) places.all = { position, total: int(row.total), where: 'All regions' };
  if (!placing && int(row.regionPosition) && region)
    places.region = { position: row.regionPosition, total: int(row.regionTotal), where: region };
  const sets = setRecordOf(row, own);
  const history = Array.isArray(data.history?.rows)
    ? { ...data.history, rows: data.history.rows.filter((item) => item.character === row.character) }
    : null;
  return {
    profile,
    table,
    row,
    rows,
    placing,
    region,
    label: seasonLabel(profile),
    places,
    sets,
    now,
    peak: placing ? null : peakOf(row, table),
    today: todayOf(history, now),
    widgets: {
      // A placing rating is still being found, so the graph starts once the character places, as on the page.
      graph: placing ? null : graphOf(history, table, now, row.rankId),
      sets: setsOf(data.sets, row.character),
      record: sets && {
        kind: 'record',
        ...sets,
        rate: pct(sets.wins, sets.losses),
        share: sets.wins / (sets.wins + sets.losses),
        games: int(row.wins) != null && int(row.losses) != null ? { wins: row.wins, losses: row.losses } : null,
      },
      matchups: matchupsOf(data.matchups, row.character),
      characters: charactersOf(rows.filter(isPlaced), table),
    },
  };
}

const READY = {
  mmr: (r) => !r.placing,
  place: (r) => Object.keys(r.places).length > 0,
  region: (r) => Boolean(r.region),
  tag: (r) => /^\d{4}$/.test(r.profile.player.tag ?? ''),
  record: (r) => Boolean(r.sets),
  // While placing the rating is not shown, so neither is the day's change in it.
  today: (r) => !r.placing && Boolean(r.today && r.today.wins + r.today.losses > 0),
};

// The options that have something to show for this character; the dialog hides the rest.
export function cardOptions(source, character) {
  const r = read(source, character);
  if (!r) return null;
  return optionsOf(r);
}
function optionsOf(r) {
  return {
    characters: r.rows.map((row) => row.character),
    character: r.row.character,
    ranks: r.peak ? ['current', 'peak'] : ['current'],
    scopes: ['all', 'region'].filter((id) => r.places[id]),
    scopeNames: { all: 'All regions', region: r.region },
    widgets: ids(WIDGETS).filter((id) => r.widgets[id]),
    details: ids(DETAILS).filter((id) => READY[id](r)),
  };
}

// The choices the card is drawn with: the wished ones that this character can show. The newest two wished widgets
// that have data are drawn, in the order they were picked.
export function settle(wish, options) {
  const clean = cleanChoices(wish);
  return {
    ...clean,
    character: options.character,
    rank: options.ranks.includes(clean.rank) ? clean.rank : 'current',
    scope: options.scopes.includes(clean.scope) ? clean.scope : (options.scopes[0] ?? 'all'),
    widgets: clean.widgets.filter((id) => options.widgets.includes(id)).slice(-MAX_WIDGETS),
    details: Object.fromEntries(ids(DETAILS).map((id) => [id, clean.details[id] && options.details.includes(id)])),
  };
}

export function cardModel(source, wish) {
  const r = read(source, wish?.character);
  if (!r) return null;
  const options = optionsOf(r);
  const choices = settle(wish, options);
  const { player } = r.profile;
  const show = choices.details;
  const peak = choices.rank === 'peak' ? r.peak : null;
  const { placementSets: done, placementTotal: total } = r.row;
  const rank = r.placing
    ? { id: null, name: `${done} of ${total} sets`, caption: 'Placing', mmr: null, rd: null, placing: { done, total } }
    : peak
      ? { id: peak.id, name: peak.name, caption: 'Peak rank', mmr: show.mmr ? peak.mmr : null, rd: null }
      : {
          id: r.row.rankId,
          name: rankName(r.table, r.row.rankId, r.row.rank),
          caption: 'Rank',
          mmr: show.mmr ? r.row.mmr : null,
          rd: show.mmr ? int(r.row.rd) : null,
        };
  const graph = choices.widgets.includes('graph') ? r.widgets.graph : null;
  const facts = [];
  // The Record widget says the same in more room, so the tile steps aside for it.
  if (show.record && !choices.widgets.includes('record')) {
    const { wins, losses } = r.sets;
    facts.push({ label: 'Set record', value: record(wins, losses), note: `${pct(wins, losses)} won` });
  }
  if (show.place) {
    const place = r.places[choices.scope];
    facts.push({
      label: 'Place',
      value: `#${fmt(place.position)}`,
      note: [place.total ? `of ${fmt(place.total)}` : '', place.where].filter(Boolean).join(' · '),
    });
  }
  // The day's change carries its date, since the picture outlives the day. A graph that starts today already shows it.
  if (show.today && !graph?.today) {
    const { change, wins, losses } = r.today;
    facts.push({
      label: shortDate(r.now),
      value: signed(change),
      note: `${record(wins, losses)} sets`,
      tone: change > 0 ? 'win' : change < 0 ? 'loss' : '',
    });
  }
  const format = FORMATS.find((item) => item.id === choices.format);
  const card = {
    format,
    accent: ACCENTS.find((item) => item.id === choices.accent),
    heading: r.label,
    name: player.name,
    meta: [show.tag ? `#${player.tag}` : '', show.region ? r.region : ''].filter(Boolean).join(' · '),
    character: r.row.character,
    characterName: characterName(r.row.character),
    rank,
    facts,
    widgets: choices.widgets.map((id) => r.widgets[id]),
    // The address as a person types it; the browser encodes a space in a name by itself.
    url: `backdash.gg/player/${player.name}-${player.tag}`,
    date: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(r.now),
  };
  card.images = imagesOf(card);
  card.summary = [
    `Player card for ${player.name}`,
    card.characterName,
    r.placing ? `placing, ${rank.name}` : rank.name,
    rank.mmr != null ? `${fmt(rank.mmr)} MMR` : '',
  ]
    .filter(Boolean)
    .join(', ');
  return { options, choices, card };
}

// Every picture the card draws, so they can all be read before it is drawn. The panda portrait is a full-body
// picture cropped into another portrait's frame, so it brings that frame along.
export function imagesOf(card) {
  const urls = new Set();
  const addFace = (id) => {
    if (faceUrl(id)) urls.add(faceUrl(id));
    if (id === 'panda') urls.add(faceUrl('kuma'));
  };
  const addPlate = (id) => plateUrl(id) && urls.add(plateUrl(id));
  addFace(card.character);
  addPlate(card.rank.id);
  for (const widget of card.widgets) {
    if (widget.kind === 'sets') for (const row of widget.rows) addFace(row.character);
    if (widget.kind === 'matchups') for (const item of [widget.best, widget.hardest]) addFace(item.character);
    if (widget.kind === 'characters')
      for (const row of widget.rows) {
        addFace(row.character);
        addPlate(row.rankId);
      }
  }
  return [...urls];
}

export function fileName(name, format) {
  const slug = String(name ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
  return `pbd-${slug || 'player'}-${format}.png`;
}

// ---- Layout ----------------------------------------------------------------------------------------------------

// A post or a story is seen about 390 px wide in a phone's feed, a little over a third of its size, so no text on
// the card is set under 28 px (10 px there).
export const SMALL = 28;
const PAD = 56;
const GAP = 28;
const FACE = 200;
const FOOT = 76;
const RANK_TOP = 200;
// Two or three facts sit in tiles under the rank; one is a single line.
const TILES = 164;
const LINE = 84;
const TAB = 52;
// A widget's tab and the padding inside its panel.
const FRAME = TAB + 52;
const SET_ROW = 92;
const CHARACTER_ROW = 116;
const WIDGET_GAP = 24;

// The most height each widget can fill with what it shows; the graph grows with the room, up to a point, and lists
// grow by their rows. `widget` is a widget of the card, or only its kind.
const TALLEST = { graph: 720, record: 360, matchups: 320 };
const GRAPH_LEAST = 340;
function tallest(widget) {
  const kind = widget?.kind ?? widget;
  const rows = widget?.rows?.length;
  if (kind === 'sets') return FRAME + SET_ROW * Math.min(SET_ROWS, rows ?? SET_ROWS);
  if (kind === 'characters') return FRAME + CHARACTER_ROW * (rows ?? 3);
  return TALLEST[kind] ?? Infinity;
}

// Where each part goes, in card pixels. The top bar and footer hold the edges; the player, their rank and the
// widgets (`widgets` lists the card's widgets, or only their kinds, in order) sit between them, centred when there
// is room to spare. A post puts two widgets side by side, a story stacks them, and the wide card gives them a column
// beside the player, both columns starting on the same line.
export function cardLayout(formatId, { widgets = [], facts = 0 } = {}) {
  const format = FORMATS.find((item) => item.id === formatId) ?? FORMATS[0];
  const W = format.width,
    H = format.height;
  const top = { x: PAD, y: PAD, w: W - 2 * PAD, h: 40 };
  const footer = { x: PAD, y: H - PAD - FOOT, w: W - 2 * PAD, h: FOOT };
  const bodyTop = top.y + top.h + 40,
    bodyBottom = footer.y - 36;
  const bodyH = bodyBottom - bodyTop;
  const rankH = RANK_TOP + (facts > 1 ? TILES : facts ? LINE : 0);
  const headH = FACE + GAP + rankH;
  const gaps = WIDGET_GAP * Math.max(0, widgets.length - 1);
  const frame = { W, H, top, footer };
  if (format.id === 'wide') {
    const colW = 820;
    const x = widgets.length ? PAD : (W - colW) / 2;
    const right = PAD + colW + 56;
    const sizes = shares(widgets, bodyH - gaps);
    const column = widgets.length ? sizes.reduce((sum, size) => sum + size, gaps) : 0;
    const y = bodyTop + Math.max(0, (bodyH - Math.max(headH, column)) / 2);
    let at = y;
    return {
      ...frame,
      id: { x, y, w: colW, h: FACE },
      rank: { x, y: y + FACE + GAP, w: colW, h: rankH },
      widgets: sizes.map((size) => {
        const rect = { x: right, y: at, w: W - PAD - right, h: size };
        at += size + WIDGET_GAP;
        return rect;
      }),
    };
  }
  const width = W - 2 * PAD;
  const room = bodyH - headH - GAP;
  const area = !widgets.length
    ? 0
    : format.id === 'post'
      ? Math.min(room, Math.max(...widgets.map(tallest)))
      : shares(widgets, room - gaps).reduce((sum, size) => sum + size, gaps);
  const y = bodyTop + Math.max(0, (bodyH - headH - (area && GAP + area)) / 2);
  const below = y + headH + GAP;
  return {
    ...frame,
    id: { x: PAD, y, w: width, h: FACE },
    rank: { x: PAD, y: y + FACE + GAP, w: width, h: rankH },
    widgets:
      format.id === 'post'
        ? widgets.map((_, i) => {
            const each = (width - gaps) / widgets.length;
            return { x: PAD + i * (each + WIDGET_GAP), y: below, w: each, h: area };
          })
        : stack(PAD, below, width, area, widgets),
  };
}
// Stacked widgets share the height (see shares()). When every one is full the stack is centred in the height.
function stack(x, y, w, h, widgets) {
  const gaps = WIDGET_GAP * Math.max(0, widgets.length - 1);
  const sizes = shares(widgets, h - gaps);
  let at = y + (h - sizes.reduce((sum, size) => sum + size, gaps)) / 2;
  return sizes.map((size) => {
    const rect = { x, y: at, w, h: size };
    at += size + WIDGET_GAP;
    return rect;
  });
}
// The graph reads at any height, so the other widgets take what they can fill first, leaving it at least
// GRAPH_LEAST: each an equal part but no more than it can fill, what one cannot use going to the others. The graph
// then takes the rest, up to its own most.
function shares(widgets, room) {
  const sizes = widgets.map(() => 0);
  const graph = widgets.findIndex((widget) => (widget?.kind ?? widget) === 'graph');
  let open = widgets.map((_, i) => i).filter((i) => i !== graph),
    left = room - (graph >= 0 && open.length ? Math.min(GRAPH_LEAST, room / widgets.length) : 0);
  while (open.length) {
    const each = left / open.length;
    const full = open.filter((i) => tallest(widgets[i]) <= each);
    if (!full.length) {
      for (const i of open) sizes[i] = each;
      break;
    }
    for (const i of full) left -= sizes[i] = tallest(widgets[i]);
    open = open.filter((i) => !full.includes(i));
  }
  if (graph >= 0) sizes[graph] = Math.min(TALLEST.graph, room - sizes.reduce((sum, size) => sum + size, 0));
  return sizes;
}

// ---- Drawing ---------------------------------------------------------------------------------------------------

const INK = {
  text1: '#E9EEED',
  text2: '#AEBDBD',
  text3: '#8A9C9C',
  good: '#3CC47E',
  bad: '#FF9470',
  band: '#0B0304',
  edge: 'rgba(233, 238, 237, 0.1)',
  hair: 'rgba(233, 238, 237, 0.08)',
  lift: 'rgba(233, 238, 237, 0.05)',
  blank: '#1D0609',
};
const FAMILY = {
  display: '"PBD Display", Barlow, "Segoe UI", system-ui, sans-serif',
  ui: 'Barlow, "Segoe UI", system-ui, sans-serif',
};

function type(g, weight, size, family = 'ui', spacing = 0) {
  g.font = `${weight} ${size}px ${FAMILY[family]}`;
  // Letter spacing where the canvas has it; elsewhere the text is set solid.
  if ('letterSpacing' in g) g.letterSpacing = spacing ? `${spacing}em` : '0px';
}
function write(g, text, x, y, color, align = 'left') {
  g.fillStyle = color;
  g.textAlign = align;
  g.fillText(text, x, y);
}
const width = (g, text) => g.measureText(text).width;
// The text cut to fit, ending in "…".
function clip(g, text, room) {
  if (width(g, text) <= room) return text;
  const chars = [...text];
  let lo = 0,
    hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (width(g, chars.slice(0, mid).join('') + '…') <= room) lo = mid;
    else hi = mid - 1;
  }
  return lo ? chars.slice(0, lo).join('').trimEnd() + '…' : '';
}
// The largest of `sizes` at which the text fits; the smallest when none does.
function fit(g, text, room, sizes, set) {
  for (const size of sizes) {
    set(size);
    if (width(g, text) <= room) return size;
  }
  return sizes.at(-1);
}
function rounded(g, x, y, w, h, r) {
  const k = Array.isArray(r) ? r : [r, r, r, r];
  g.beginPath();
  g.moveTo(x + k[0], y);
  g.arcTo(x + w, y, x + w, y + h, k[1]);
  g.arcTo(x + w, y + h, x, y + h, k[2]);
  g.arcTo(x, y + h, x, y, k[3]);
  g.arcTo(x, y, x + w, y, k[0]);
  g.closePath();
}
const picture = (assets, url) => (url ? (assets.images?.get(url) ?? null) : null);
const toneOf = (value) => (value > 0 ? INK.good : value < 0 ? INK.bad : INK.text1);

// A portrait in its own frame. The panda's is cut from the kuma portrait, as on the player page; a portrait that
// did not load leaves the empty frame.
function face(g, assets, id, x, y, size) {
  const image = picture(assets, faceUrl(id));
  if (image && id !== 'panda') return g.drawImage(image, x, y, size, size);
  const frame = image && picture(assets, faceUrl('kuma'));
  const inset = frame ? Math.round(size * 0.07) : 1;
  if (frame) g.drawImage(frame, x, y, size, size);
  g.save();
  rounded(g, x + inset, y + inset, size - 2 * inset, size - 2 * inset, frame ? size * 0.03 : 0);
  g.fillStyle = image ? '#28232A' : INK.blank;
  g.fill();
  if (image) {
    g.clip();
    // The head of the full-body picture, placed as the player page's .rk-panda crop places it.
    const box = size - 2 * inset;
    g.drawImage(image, x + inset - 0.8833 * box, y + inset - 0.08 * box, 1.8667 * box, 2 * box);
  }
  g.restore();
  if (!frame) {
    g.strokeStyle = 'rgba(233, 238, 237, 0.18)';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, size - 2, size - 2);
  }
}
// A badge plate, 192 x 96 at its own size.
function plate(g, assets, id, x, y, w = 192) {
  const image = picture(assets, plateUrl(id));
  if (image) g.drawImage(image, x, y, w, w / 2);
  return Boolean(image);
}
function brand(g, art, x, y, height) {
  const scale = height / art.box[1];
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  for (const part of art.paths) {
    g.fillStyle = part.fill;
    g.fill(part.path);
  }
  g.restore();
  return art.box[0] * scale;
}
function panel(g, r, accent, corners = 6) {
  rounded(g, r.x, r.y, r.w, r.h, corners);
  g.fillStyle = accent.panel;
  g.fill();
  g.strokeStyle = INK.edge;
  g.lineWidth = 1.5;
  g.stroke();
}
// A widget: the launcher's black label tab, slanted on the right with an accent edge, over its panel. Returns the
// room inside.
function widgetBox(g, r, title, accent) {
  panel(g, { x: r.x, y: r.y + TAB, w: r.w, h: r.h - TAB }, accent, [0, 6, 6, 6]);
  type(g, 400, SMALL, 'display', 0.16);
  const label = clip(g, title.toUpperCase(), r.w - 64);
  const w = Math.min(r.w, width(g, label) + 64);
  g.beginPath();
  g.moveTo(r.x, r.y);
  g.lineTo(r.x + w, r.y);
  g.lineTo(r.x + w - 16, r.y + TAB);
  g.lineTo(r.x, r.y + TAB);
  g.closePath();
  g.fillStyle = INK.band;
  g.fill();
  g.fillStyle = accent.line;
  g.fillRect(r.x, r.y, 4, TAB);
  write(g, label, r.x + 22, r.y + 36, INK.text1);
  return { x: r.x + 28, y: r.y + TAB + 26, w: r.w - 56, h: r.h - TAB - 52 };
}
// A label in small spaced capitals, cut to `room` when one is given.
function caption(g, text, x, y, color = INK.text3, align = 'left', room = null) {
  type(g, 700, SMALL, 'ui', 0.14);
  const label = text.toUpperCase();
  write(g, room == null ? label : clip(g, label, room), x, y, color, align);
}

function field(g, layout, accent) {
  const { W, H } = layout;
  const [c0, c1, c2, c3, c4] = accent.field;
  g.fillStyle = c4;
  g.fillRect(0, 0, W, H);
  // The launcher's field: an ellipse 80% wide and 90% tall, its centre right of the middle.
  g.save();
  g.translate(W * 0.64, H * 0.4);
  g.scale(W * 0.8, H * 0.9);
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  [c0, c1, c2, c3, c4].forEach((color, i) => glow.addColorStop([0, 0.24, 0.5, 0.76, 1][i], color));
  g.fillStyle = glow;
  g.fillRect(-1, -1, 2, 2);
  g.restore();
  g.fillStyle = accent.line;
  g.fillRect(0, 0, W, 6);
}

function topBar(g, card, r, assets) {
  let x = r.x;
  if (assets.mark) x += brand(g, assets.mark, r.x, r.y + 3, 34) + 26;
  type(g, 700, SMALL, 'ui', 0.18);
  write(g, clip(g, card.heading.toUpperCase(), r.x + r.w - x), x, r.y + 31, INK.text2);
}

function identity(g, card, r, assets) {
  face(g, assets, card.character, r.x, r.y, r.h);
  const x = r.x + r.h + 36,
    room = r.x + r.w - x;
  const name = card.name.toUpperCase();
  const size = fit(g, name, room, [96, 84, 72, 64, 56, 48, 44, 40, 36, 32], (s) => type(g, 400, s, 'display', 0.04));
  const nameCap = size * 0.72;
  const block = 20 + 24 + nameCap + (card.meta ? 26 + 23 : 0);
  let y = r.y + (r.h - block) / 2 + 20;
  type(g, 700, SMALL, 'ui', 0.16);
  write(g, clip(g, card.characterName.toUpperCase(), room), x, y, INK.text3);
  y += 24 + nameCap;
  type(g, 400, size, 'display', 0.04);
  write(g, clip(g, name, room), x, y, INK.text1);
  if (card.meta) {
    y += 26 + 23;
    type(g, 600, 32);
    write(g, clip(g, card.meta, room), x, y, INK.text2);
  }
}

// The placement lamps in the plate's place: one per placement set, lit for each one played.
function lamps(g, { done, total }, x, mid) {
  const count = Math.min(total, 10);
  const size = count > 6 ? 22 : 30,
    gap = count > 6 ? 8 : 12;
  for (let i = 0; i < count; i++) {
    g.beginPath();
    g.arc(x + size / 2 + i * (size + gap), mid, size / 2 - 1.5, 0, Math.PI * 2);
    if (i < done) {
      g.fillStyle = INK.text1;
      g.fill();
    } else {
      g.strokeStyle = 'rgba(233, 238, 237, 0.5)';
      g.lineWidth = 3;
      g.stroke();
    }
  }
  return count * size + (count - 1) * gap;
}

function rankPanel(g, card, r, assets) {
  panel(g, r, card.accent);
  const { rank } = card;
  let x = r.x + 32;
  if (rank.placing) x += lamps(g, rank.placing, x, r.y + RANK_TOP / 2) + 36;
  else if (plate(g, assets, rank.id, r.x + 28, r.y + (RANK_TOP - 96) / 2)) x = r.x + 28 + 192 + 32;
  const room = r.x + r.w - 32 - x;
  const name = (rank.name ?? '').toUpperCase();
  // The big line: the MMR with its ± or, while placing, the sets still to play.
  const big = rank.placing
    ? { value: fmt(rank.placing.total - rank.placing.done), unit: 'to go' }
    : rank.mmr != null
      ? { value: fmt(rank.mmr), unit: 'MMR', after: rank.rd != null ? `± ${fmt(rank.rd)}` : '' }
      : null;
  if (big) {
    let y = r.y + 46;
    caption(g, rank.caption, x, y, INK.text3, 'left', room);
    y += 50;
    fit(g, name, room, [44, 40, 36, 32], (s) => type(g, 400, s, 'display', 0.06));
    write(g, clip(g, name, room), x, y, INK.text1);
    y += 80;
    type(g, 400, 80, 'display', 0.02);
    write(g, big.value, x, y, INK.text1);
    let after = x + width(g, big.value) + 18;
    caption(g, big.unit, after, y);
    after += width(g, big.unit.toUpperCase()) + 16;
    if (big.after) {
      type(g, 600, 30);
      write(g, clip(g, big.after, r.x + r.w - 32 - after), after, y, INK.text3);
    }
  } else {
    let y = r.y + (RANK_TOP - 20 - 18 - 40) / 2 + 20;
    caption(g, rank.caption, x, y, INK.text3, 'left', room);
    y += 18 + 40;
    fit(g, name, room, [56, 48, 40, 32], (s) => type(g, 400, s, 'display', 0.06));
    write(g, clip(g, name, room), x, y, INK.text1);
  }
  if (card.facts.length) facts(g, card.facts, r, r.y + RANK_TOP);
}

// The facts under the rank: tiles as wide as what each one says, sharing what is left, or one fact on one line.
function facts(g, list, r, top) {
  g.fillStyle = INK.hair;
  g.fillRect(r.x + 24, top, r.w - 48, 1.5);
  const color = (fact) => (fact.tone ? INK[fact.tone === 'win' ? 'good' : 'bad'] : INK.text1);
  if (list.length === 1) {
    const [fact] = list;
    const y = top + LINE / 2 + 14;
    let x = r.x + 32;
    caption(g, fact.label, x, y);
    x += width(g, fact.label.toUpperCase()) + 22;
    type(g, 400, 40, 'display', 0.02);
    write(g, fact.value, x, y, color(fact));
    x += width(g, fact.value) + 18;
    type(g, 500, SMALL);
    write(g, clip(g, fact.note, r.x + r.w - 32 - x), x, y, INK.text3);
    return;
  }
  const between = 40;
  const room = r.w - 64 - between * (list.length - 1);
  const need = list.map((fact) => {
    type(g, 700, SMALL, 'ui', 0.14);
    const label = width(g, fact.label.toUpperCase());
    type(g, 400, 48, 'display', 0.02);
    const value = width(g, fact.value);
    type(g, 500, SMALL);
    return Math.max(label, value, width(g, fact.note));
  });
  const spare = (room - need.reduce((sum, w) => sum + w, 0)) / list.length;
  const widths = need.map((w) => Math.max(60, w + spare));
  let x = r.x + 32;
  list.forEach((fact, i) => {
    const w = widths[i];
    if (i) {
      g.fillStyle = INK.hair;
      g.fillRect(x - between / 2, top + 24, 1.5, TILES - 48);
    }
    caption(g, fact.label, x, top + 48, INK.text3, 'left', w);
    type(g, 400, 48, 'display', 0.02);
    write(g, clip(g, fact.value, w), x, top + 104, color(fact));
    type(g, 500, SMALL);
    write(g, clip(g, fact.note, w), x, top + 142, INK.text3);
    x += w + between;
  });
}

function footer(g, card, r, assets) {
  g.fillStyle = INK.hair;
  g.fillRect(r.x, r.y - 18, r.w, 1.5);
  if (assets.wordmark) brand(g, assets.wordmark, r.x, r.y + 2, SMALL);
  const baseline = r.y + r.h - 6;
  type(g, 500, SMALL);
  const date = card.date;
  const dateRoom = width(g, date);
  write(g, date, r.x + r.w, baseline, INK.text3, 'right');
  const room = r.w - dateRoom - 32;
  fit(g, card.url, room, [30, SMALL], (s) => type(g, 600, s));
  write(g, clip(g, card.url, room), r.x, baseline, INK.text1);
}

// ---- Widgets ----

function graphWidget(g, widget, r, card) {
  const b = widgetBox(g, r, 'Rating', card.accent);
  const { values, starts } = widget;
  const n = values.length - 1;
  const known = values.concat(starts.filter((value) => value != null));
  let lo = Math.min(...known),
    hi = Math.max(...known);
  const pad = Math.max(16, (hi - lo) * 0.14);
  lo -= pad;
  hi += pad;
  // Rank lines in range carry their badge names in the gutter; with none, the first and highest ratings do.
  const lines = widget.lines.filter((line) => line.from >= lo && line.from <= hi);
  const marks = lines.length
    ? lines.map((line) => ({ value: line.from, text: line.name, mine: line.mine }))
    : [values[0], Math.max(...values)].map((value) => ({ value, text: fmt(value) }));
  type(g, 600, SMALL);
  const gutter = Math.min(220, Math.max(...marks.map((mark) => width(g, mark.text))) + 22);
  const datesH = 46,
    noteH = 58;
  const plot = { x: b.x, y: b.y + 12, w: b.w - gutter, h: b.h - 12 - datesH - noteH };
  // The top of the plot is kept for the peak's mark and label, so they never sit on the line.
  const head = 36;
  const X = (i) => plot.x + (i / n) * plot.w;
  const Y = (v) => plot.y + head + (1 - (v - lo) / (hi - lo)) * (plot.h - head);

  // Up to three names spread over the height, the character's own badge first, then the highest; the other lines stay
  // faint.
  const apart = Math.max(40, plot.h / 4);
  const named = [];
  for (const mark of [...marks].sort((a, b) => Boolean(b.mine) - Boolean(a.mine) || b.value - a.value))
    if (named.length < 3 && named.every((other) => Math.abs(Y(other.value) - Y(mark.value)) >= apart)) named.push(mark);
  for (const mark of marks) {
    const isNamed = named.includes(mark);
    g.fillStyle = `rgba(233, 238, 237, ${isNamed ? 0.16 : 0.06})`;
    g.fillRect(plot.x, Y(mark.value), plot.w, 1.5);
    if (isNamed) write(g, mark.text, plot.x + plot.w + 18, Y(mark.value) + 10, INK.text3);
  }

  // One stretch of line per run of sets that follow on from each other.
  g.beginPath();
  g.moveTo(X(0), Y(values[0]));
  for (let i = 1; i <= n; i++) {
    if (starts[i - 1] != null) g.moveTo(X(i - 1), Y(starts[i - 1]));
    g.lineTo(X(i), Y(values[i]));
  }
  g.strokeStyle = card.accent.line;
  g.lineWidth = 4;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.stroke();

  // Results never rely on colour alone: wins are filled dots, losses hollow.
  if (n <= 60) {
    const dot = n <= 24 ? 8 : n <= 40 ? 6.5 : 5;
    widget.results.forEach((result, i) => {
      g.beginPath();
      g.arc(X(i + 1), Y(values[i + 1]), result === 'n' ? dot - 2 : dot, 0, Math.PI * 2);
      if (result === 'w') {
        g.fillStyle = INK.good;
        g.fill();
      } else if (result === 'l') {
        g.fillStyle = INK.band;
        g.fill();
        g.strokeStyle = INK.bad;
        g.lineWidth = 3;
        g.stroke();
      } else {
        g.fillStyle = INK.text2;
        g.fill();
      }
    });
  }
  const px = X(widget.peak),
    py = Y(values[widget.peak]);
  g.beginPath();
  g.moveTo(px, py - 34);
  g.lineTo(px + 10, py - 24);
  g.lineTo(px, py - 14);
  g.lineTo(px - 10, py - 24);
  g.closePath();
  g.fillStyle = INK.text1;
  g.fill();
  type(g, 600, SMALL);
  const peakText = `Peak ${fmt(values[widget.peak])}`;
  const left = px - plot.x > width(g, peakText) + 24;
  write(g, peakText, left ? px - 18 : px + 18, py - 14, INK.text1, left ? 'right' : 'left');

  type(g, 500, SMALL);
  write(g, widget.from, plot.x, plot.y + plot.h + 38, INK.text3);
  if (widget.to !== widget.from) write(g, widget.to, plot.x + plot.w, plot.y + plot.h + 38, INK.text3, 'right');

  const baseline = b.y + b.h - 4;
  type(g, 400, 40, 'display', 0.02);
  const change = signed(widget.change);
  write(g, change, b.x, baseline, toneOf(widget.change));
  const after = b.x + width(g, change) + 16;
  type(g, 600, SMALL);
  write(g, clip(g, widget.note, b.x + b.w - after), after, baseline, INK.text2);
}

// Each set on a row: the result, the score, the opponent and the rating change, in columns as wide as their widest
// entry. Where there is room a row also shows the opponent's portrait and character; a narrow or short widget keeps
// to one line.
function setsWidget(g, widget, r, card, assets) {
  const b = widgetBox(g, r, 'Recent sets', card.accent);
  const roomy = b.w >= 600;
  const wanted = Math.min(widget.rows.length, SET_ROWS);
  const full = roomy && Math.floor(b.h / SET_ROW) >= Math.min(wanted, 4);
  const count = Math.max(1, Math.min(wanted, Math.floor(b.h / (full ? SET_ROW : 60))));
  const rowH = Math.min(full ? 104 : 80, b.h / count);
  const rows = widget.rows.slice(0, count);
  const faceSize = full ? Math.min(60, rowH - 24) : roomy ? Math.min(46, rowH - 18) : 0;
  const scoreSize = full ? 36 : 34;
  type(g, 400, scoreSize, 'display', 0.02);
  const scoreW = Math.max(...rows.map((row) => width(g, row.score))) + 22;
  type(g, 700, 30);
  const changes = rows.map((row) => (row.change == null ? '' : signed(row.change)));
  const changeW = Math.max(0, ...changes.map((text) => width(g, text)));
  rows.forEach((row, i) => {
    const top = b.y + i * rowH,
      mid = top + rowH / 2;
    if (i) {
      g.fillStyle = INK.hair;
      g.fillRect(b.x, top, b.w, 1.5);
    }
    let x = b.x;
    rounded(g, x, mid - 22, 44, 44, 4);
    if (row.won) {
      g.fillStyle = 'rgba(60, 196, 126, 0.22)';
      g.fill();
    } else {
      g.strokeStyle = 'rgba(255, 148, 112, 0.6)';
      g.lineWidth = 2;
      g.stroke();
    }
    type(g, 700, SMALL);
    write(g, row.won ? 'W' : 'L', x + 22, mid + 10, row.won ? '#BFF0D5' : INK.bad, 'center');
    x += 44 + 18;
    type(g, 400, scoreSize, 'display', 0.02);
    write(g, row.score, x, mid + 13, INK.text1);
    x += scoreW;
    if (faceSize) {
      face(g, assets, row.character, x, mid - faceSize / 2, faceSize);
      x += faceSize + 18;
    }
    if (changes[i]) {
      type(g, 700, 30);
      write(g, changes[i], b.x + b.w, mid + 11, toneOf(row.change), 'right');
    }
    const room = b.x + b.w - (changeW ? changeW + 20 : 0) - x;
    const sub = characterName(row.character) + (row.forfeit ? ' · Forfeit' : '');
    type(g, 600, 30);
    const name = clip(g, row.opponent, room);
    if (full) {
      write(g, name, x, mid - 4, INK.text1);
      type(g, 500, SMALL);
      write(g, clip(g, sub, room), x, mid + 30, INK.text3);
      return;
    }
    write(g, name, x, mid + 11, INK.text1);
    // On one line, the character follows the name where there is room for it.
    const after = x + width(g, name) + 18;
    type(g, 500, SMALL);
    if (roomy && room - (after - x) >= 140) write(g, clip(g, sub, room - (after - x)), after, mid + 11, INK.text3);
  });
}

function recordWidget(g, widget, r, card) {
  const b = widgetBox(g, r, 'Record', card.accent);
  const stats = [
    ['Sets', record(widget.wins, widget.losses)],
    ['Win rate', widget.rate],
  ];
  // The two numbers sit centred in the room above the bar: side by side when it is wide, else one over the other.
  // They stay under the 80 px of the MMR, which is the card's main number.
  const barY = b.y + b.h - 54;
  const room = barY - 24 - b.y;
  const across = b.w >= 600;
  const big = Math.max(40, Math.min(72, across ? (room - 38) / 0.72 : (room - 112) / 1.44));
  const block = 38 + big * 0.72;
  const top = b.y + (room - (across ? block : 2 * block + 36)) / 2;
  stats.forEach(([label, value], i) => {
    const x = across ? b.x + i * (b.w / 2) : b.x;
    const y = across ? top : top + i * (block + 36);
    caption(g, label, x, y + 20);
    type(g, 400, big, 'display', 0.02);
    write(g, clip(g, value, across ? b.w / 2 - 20 : b.w), x, y + block, INK.text1);
  });
  g.fillStyle = 'rgba(233, 238, 237, 0.14)';
  g.fillRect(b.x, barY, b.w, 12);
  g.fillStyle = card.accent.line;
  g.fillRect(b.x, barY, b.w * widget.share, 12);
  type(g, 500, SMALL);
  const games = widget.games ? `Games ${record(widget.games.wins, widget.games.losses)}` : '';
  const gamesW = games ? width(g, games) + 24 : 0;
  write(
    g,
    clip(g, `${fmt(widget.wins)} won · ${fmt(widget.losses)} lost`, b.w - gamesW),
    b.x,
    b.y + b.h - 4,
    INK.text2,
  );
  if (games && b.w - gamesW >= 200) write(g, games, b.x + b.w, b.y + b.h - 4, INK.text3, 'right');
}

function matchupsWidget(g, widget, r, card, assets) {
  const b = widgetBox(g, r, 'Matchups', card.accent);
  const items = [
    ['Best', widget.best],
    ['Hardest', widget.hardest],
  ];
  const across = b.w >= 600;
  items.forEach(([label, item], i) => {
    const cell = across
      ? { x: b.x + i * (b.w / 2 + 12), y: b.y, w: b.w / 2 - 12, h: b.h }
      : { x: b.x, y: b.y + i * (b.h / 2 + 8), w: b.w, h: b.h / 2 - 8 };
    if (i && !across) {
      g.fillStyle = INK.hair;
      g.fillRect(b.x, cell.y - 8, b.w, 1.5);
    }
    const size = Math.max(64, Math.min(120, cell.h - 32));
    const fy = cell.y + (cell.h - size) / 2;
    face(g, assets, item.character, cell.x, fy, size);
    const x = cell.x + size + 24,
      room = cell.x + cell.w - x;
    const mid = cell.y + cell.h / 2;
    caption(g, label, x, mid - 40);
    type(g, 600, 30);
    write(g, clip(g, item.name, room), x, mid - 2, INK.text1);
    type(g, 400, 44, 'display', 0.02);
    write(g, item.rate, x, mid + 50, INK.text1);
    const after = x + width(g, item.rate) + 14;
    type(g, 500, SMALL);
    write(g, clip(g, `${fmt(item.games)} games`, cell.x + cell.w - after), after, mid + 50, INK.text3);
  });
}

// The player's characters, one row each, the card's own marked with the accent. A wide widget sets the plate and
// MMR at the end of the row; a narrow one gives the name the whole first line and the badge and MMR the second.
function charactersWidget(g, widget, r, card, assets) {
  const b = widgetBox(g, r, 'Characters', card.accent);
  const rowH = Math.min(CHARACTER_ROW, b.h / widget.rows.length);
  const size = Math.min(80, rowH - 20);
  const roomy = b.w >= 600;
  widget.rows.forEach((row, i) => {
    const top = b.y + i * rowH,
      mid = top + rowH / 2;
    const mine = row.character === card.character;
    if (i) {
      g.fillStyle = INK.hair;
      g.fillRect(b.x, top, b.w, 1.5);
    }
    if (mine) {
      g.fillStyle = INK.lift;
      g.fillRect(r.x + 1.5, top + 1.5, r.w - 3, rowH - 3);
      g.fillStyle = card.accent.line;
      g.fillRect(r.x, top + 10, 4, rowH - 20);
    }
    face(g, assets, row.character, b.x, mid - size / 2, size);
    const x = b.x + size + 20;
    const mmr = fmt(row.mmr);
    if (roomy) {
      type(g, 400, 40, 'display', 0.02);
      const mmrW = width(g, mmr);
      write(g, mmr, b.x + b.w, mid + 15, INK.text1, 'right');
      let end = b.x + b.w - mmrW - 24;
      if (plate(g, assets, row.rankId, end - 144, mid - 36, 144)) end -= 144 + 20;
      type(g, 600, 30);
      write(g, clip(g, row.name, end - x), x, mid - 4, mine ? INK.text1 : INK.text2);
      type(g, 500, SMALL);
      write(g, clip(g, row.rank ?? '', end - x), x, mid + 30, INK.text3);
      return;
    }
    type(g, 600, 30);
    write(g, clip(g, row.name, b.x + b.w - x), x, mid - 6, mine ? INK.text1 : INK.text2);
    type(g, 400, 34, 'display', 0.02);
    const mmrW = width(g, mmr);
    write(g, mmr, b.x + b.w, mid + 32, INK.text1, 'right');
    type(g, 500, SMALL);
    write(g, clip(g, row.rank ?? '', b.x + b.w - mmrW - 16 - x), x, mid + 32, INK.text3);
  });
}

const DRAW_WIDGET = {
  graph: graphWidget,
  sets: setsWidget,
  record: recordWidget,
  matchups: matchupsWidget,
  characters: charactersWidget,
};

// Paints `card` (cardModel's) at `layout` (cardLayout's) on a 2D context of the layout's size. `assets.images`
// maps each of card.images to a loaded picture or null; `assets.mark` and `assets.wordmark` are the brand
// drawings as { box: [width, height], paths: [{ path: Path2D, fill }] }, or null to leave them out.
export function drawCard(g, card, layout, assets = {}) {
  g.save();
  g.textBaseline = 'alphabetic';
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  field(g, layout, card.accent);
  topBar(g, card, layout.top, assets);
  identity(g, card, layout.id, assets);
  rankPanel(g, card, layout.rank, assets);
  card.widgets.forEach((widget, i) => DRAW_WIDGET[widget.kind](g, widget, layout.widgets[i], card, assets));
  footer(g, card, layout.footer, assets);
  g.restore();
}
