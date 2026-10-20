// <!-- check-allow: ranked -->
// <!-- check-allow: profiles -->
export const RANK_BANDS = [
  ['all', 'All ranks'],
  ['unranked', 'Unranked'],
  ['rank_00_09', 'Beginner–1st Kyu'],
  ['rank_10_19', '1st Dan–Warrior'],
  ['rank_20_29', 'Master–Raijin'],
  ['rank_30_34', 'Deity–Dark Lord'],
];

export const CHARACTERS = [
  'anna_williams',
  'armor_king',
  'asuka_kazama',
  'baek_doo_san',
  'bruce_irvin',
  'bryan_fury',
  'christie_monteiro',
  'craig_marduk',
  'devil_jin',
  'eddy_gordo',
  'feng_wei',
  'ganryu',
  'heihachi_mishima',
  'hwoarang',
  'jack_5',
  'jin_kazama',
  'julia_chang',
  'kazuya_mishima',
  'king',
  'kuma',
  'lee_chaolan',
  'lei_wulong',
  'lili',
  'ling_xiaoyu',
  'marshall_law',
  'mokujin',
  'nina_williams',
  'panda',
  'paul_phoenix',
  'raven',
  'roger_jr',
  'sergei_dragunov',
  'steve_fox',
  'wang_jinrei',
  'yoshimitsu',
];

export function characterName(id) {
  if (id == null) return 'Unknown';
  if (id === 'jack_5') return 'Jack-5';
  if (id === 'roger_jr') return 'Roger Jr.';
  return String(id)
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function playerPath(player) {
  if (!player || typeof player.name !== 'string' || !/^\d{4}$/.test(player.tag ?? '')) return null;
  return `/player/${encodeURIComponent(player.name)}-${player.tag}`;
}

export function parsePlayerPath(pathname) {
  const match = /^\/player\/([^/]+)-(\d{4})\/?$/.exec(pathname);
  if (!match) return null;
  try {
    const name = decodeURIComponent(match[1]);
    if (!name.trim() || name.length > 40 || /[\u0000-\u001f\u007f]/.test(name)) return null;
    return { name, tag: match[2] };
  } catch {
    return null;
  }
}

export function profileEndpoint(player) {
  return `players/${encodeURIComponent(player.name)}/${player.tag}`;
}

export function replayPath(value) {
  if (typeof value !== 'string') return null;
  // Accept only the site's shared replay pages, never a supplied script or another origin.
  if (/^\/r\/[a-f0-9]{32}\/?$/.test(value)) return value.replace(/\/$/, '');
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      !['backdash.gg', 'www.backdash.gg'].includes(url.host) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const match = /^(\/r\/[a-f0-9]{32})\/?$/.exec(url.pathname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

const count = (value) => Number.isSafeInteger(value) && value >= 0;
const text = (value) => typeof value === 'string' && value.length > 0 && value.length <= 120;
const nullable = (check, value) => value === null || check(value);
const ratio = (value) => nullable((v) => Number.isFinite(v) && v >= 0 && v <= 1, value);
const date = (value) => text(value) && Number.isFinite(Date.parse(value));
const player = (value) =>
  value &&
  text(value.name) &&
  value.name.length <= 40 &&
  (value.tag === null || /^\d{4}$/.test(value.tag)) &&
  (value.avatarCharacter == null || CHARACTERS.includes(value.avatarCharacter));
const cursor = (value) => value === null || text(value) || (typeof value === 'string' && value.length <= 4096);
const rating = (value) =>
  value &&
  nullable(text, value.rank) &&
  nullable(Number.isFinite, value.mmr) &&
  nullable((v) => typeof v === 'boolean', value.provisional);
const games = (row) =>
  row &&
  text(row.character) &&
  ['games', 'wins', 'losses', 'draws'].every((key) => count(row[key])) &&
  ratio(row.winRate);
const point = (row) =>
  row &&
  date(row.date) &&
  nullable(text, row.character) &&
  ['before', 'after', 'change'].every((key) => nullable(Number.isFinite, row[key]));
const match = (row) =>
  row &&
  text(row.id) &&
  (row.player === undefined || nullable(player, row.player)) &&
  nullable(text, row.character) &&
  nullable(player, row.opponent) &&
  nullable(text, row.opponentCharacter) &&
  ['win', 'loss', 'draw'].includes(row.result) &&
  date(row.date) &&
  nullable((v) => v && nullable(count, v.player) && nullable(count, v.opponent), row.score) &&
  nullable(
    (v) =>
      v && v.appliesTo === 'set' && ['before', 'after', 'change'].every((key) => nullable(Number.isFinite, v[key])),
    row.ratingChange,
  ) &&
  nullable(text, row.sharedReplayUrl);

export function readRanked(value, kind) {
  if (
    !value ||
    value.version !== 1 ||
    value.mode !== 'ranked' ||
    !['launch-1', 'preseason-1'].includes(value.season) ||
    !date(value.updatedAt)
  )
    throw new Error('Invalid stats response.');
  let valid = false;
  if (kind === 'players') valid = Array.isArray(value.players) && value.players.every(player);
  if (kind === 'profile')
    valid =
      player(value.player) &&
      nullable(rating, value.rating) &&
      Array.isArray(value.characters) &&
      value.characters.every((row) => games(row) && rating(row)) &&
      Array.isArray(value.recentMatches) &&
      value.recentMatches.every(match) &&
      cursor(value.matchesCursor) &&
      Array.isArray(value.ratingHistory) &&
      value.ratingHistory.every(point) &&
      cursor(value.ratingHistoryCursor);
  if (kind === 'matches' || kind === 'rating-history')
    valid =
      Array.isArray(value.rows) && value.rows.every(kind === 'matches' ? match : point) && cursor(value.nextCursor);
  if (kind === 'characters' || kind === 'matchups')
    valid =
      RANK_BANDS.some(([id]) => id === value.rankBand) &&
      Array.isArray(value.rows) &&
      value.rows.every(
        (row) => games(row) && (kind === 'characters' ? ratio(row.pickRate) : text(row.opponentCharacter)),
      );
  if (kind === 'leaderboard')
    valid =
      Array.isArray(value.rows) &&
      value.rows.every(
        (row) =>
          count(row.position) &&
          player(row.player) &&
          text(row.character) &&
          rating(row) &&
          ['wins', 'losses', 'ratedSets'].every((key) => count(row[key])),
      );
  if (kind === 'filters')
    valid = ['regions', 'characters', 'builds'].every((key) => Array.isArray(value[key]) && value[key].every(text));
  if (kind === 'rank-distribution')
    valid =
      ['highest', 'characters'].includes(value.population) &&
      count(value.total) &&
      ['players', 'playerCharacters'].includes(value.unit) &&
      Array.isArray(value.rows) &&
      value.rows.every(
        (row) =>
          row &&
          count(row.players) &&
          ratio(row.share) &&
          nullable(text, row.rank) &&
          nullable(
            (v) => v && ['min', 'p10', 'p25', 'p50', 'p75', 'p90', 'max'].every((key) => Number.isFinite(v[key])),
            row.mmr,
          ),
      );
  if (kind === 'activity')
    valid =
      count(value.totalGames) &&
      Array.isArray(value.rows) &&
      value.rows.every(
        (row) => row && date(row.date) && ['games', 'wins', 'losses', 'draws'].every((key) => count(row[key])),
      );
  if (kind === 'player-matchups')
    valid =
      count(value.totalGames) &&
      Array.isArray(value.rows) &&
      value.rows.every((row) => games(row) && text(row.opponentCharacter));
  if (kind === 'head-to-head')
    valid =
      count(value.totalGames) &&
      Array.isArray(value.rows) &&
      value.rows.every(
        (row) =>
          row &&
          player(row.opponent) &&
          ['games', 'wins', 'losses', 'draws'].every((key) => count(row[key])) &&
          ratio(row.winRate) &&
          date(row.lastPlayedAt),
      );
  if (kind === 'character-detail')
    valid =
      games(value) &&
      ratio(value.pickRate) &&
      count(value.players) &&
      count(value.mains) &&
      ratio(value.mainShare) &&
      nullable(text, value.medianRank) &&
      Array.isArray(value.daily) &&
      value.daily.every(
        (row) =>
          date(row.date) &&
          ['games', 'wins', 'losses', 'draws'].every((key) => count(row[key])) &&
          ratio(row.winRate) &&
          ratio(row.pickRate),
      ) &&
      Array.isArray(value.matchups) &&
      value.matchups.every((row) => games(row) && text(row.opponentCharacter));
  if (!valid) throw new Error('Invalid stats response.');
  return value;
}

export class StatsError extends Error {
  constructor(status) {
    super(
      status === 404
        ? 'Player not found.'
        : status === 400
          ? 'This selection is no longer available. Reset the filters and try again.'
          : status === 429
            ? 'Too many requests. Try again in a minute.'
            : 'Stats are unavailable. Try again shortly.',
    );
    this.status = status;
  }
}

export async function fetchRanked(base, endpoint, kind, params = {}, signal) {
  const url = new URL(`${base.replace(/\/$/, '')}/${endpoint}`);
  for (const [key, value] of Object.entries(params))
    if (value !== '' && value != null) url.searchParams.set(key, value);
  const response = await fetch(url, {
    credentials: 'omit',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new StatsError(response.status);
  return readRanked(await response.json(), kind);
}
