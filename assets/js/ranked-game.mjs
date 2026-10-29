// <!-- check-allow: ranked -->
import { replayPath, characterName } from '/assets/js/ranked-data.mjs?v=2fa1825259';
import { el, playerLink, number, change, dateLabel } from '/assets/js/ranked-ui.mjs?v=dcce91eb97';
import { REGIONS } from '/assets/js/ranked-filters.mjs?v=a47ec7b13c';

export function matchRow(game, player) {
  const item = el('li', 'ranked-game');
  item.dataset.result = game.result;
  const date = el('time', 'ranked-game-date');
  date.dateTime = game.date;
  date.title = dateLabel(game.date);
  date.textContent = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(game.date));
  date.append(
    el(
      'small',
      'ranked-sub',
      new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(
        new Date(game.date),
      ) + ' UTC',
    ),
  );
  const result = el('div', 'ranked-game-head');
  result.append(el('strong', '', { win: 'Win', loss: 'Loss', draw: 'Draw' }[game.result]));
  if (game.score?.player != null && game.score.opponent != null)
    result.append(el('span', '', `${number(game.score.player)} – ${number(game.score.opponent)}`));
  const players = el('div', 'ranked-game-players');
  for (const [who, character] of [
    [game.player ?? player, game.character],
    [game.opponent, game.opponentCharacter],
  ]) {
    const side = el('div');
    side.append(playerLink(who));
    if (character && character !== who?.avatarCharacter)
      side.append(el('small', 'ranked-sub', `Played: ${characterName(character)}`));
    if (players.childElementCount) players.append(el('span', 'ranked-game-vs', 'vs'));
    players.append(side);
  }
  const delta = el('span', 'ranked-game-delta');
  if (game.ratingChange?.change != null) {
    delta.textContent = change(game.ratingChange.change);
    delta.setAttribute('aria-label', `Set MMR change ${delta.textContent}`);
    delta.title = `${number(game.ratingChange.before)} → ${number(game.ratingChange.after)} MMR · Set change`;
  }
  item.append(date, result, players, delta);
  const facts = [
    game.stage == null ? null : `Stage ${game.stage}`,
    game.region ? REGIONS.find(([id]) => id === game.region)?.[1] || game.region.toUpperCase() : null,
    game.build ? `Build ${game.build}` : null,
  ].filter(Boolean);
  const replay = replayPath(game.sharedReplayUrl);
  if (replay) {
    const link = el('a', 'ranked-replay', 'Shared replay');
    link.href = replay;
    item.append(link);
  }
  if (facts.length) {
    const details = el('details', 'ranked-game-details');
    details.append(el('summary', '', 'Details'));
    if (facts.length) details.append(el('p', 'ranked-note', facts.join(' · ')));
    item.append(details);
  }
  return item;
}
