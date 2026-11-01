// <!-- check-allow: ranked -->
// Top players as Home draws them, on Home, the Stats overview and a character's page: the place (#1's in gold), the
// portrait of the character the row is for, the name with its tag and region, the badge's plate and name, the MMR,
// the record in sets and the win rate. Each row opens the player's page. A long name wraps at its natural breaks
// and steps down a size when a part is too wide for its column (player-name.mjs); the list fits its names again
// whenever it changes width.
import { characterName, playerPath } from '/assets/js/ranked-data.mjs?v=dde3981e98';
import { el, fmt, pct, record, face, plate, regionCode } from '/assets/js/ranked-kit.mjs?v=f30d870cde';
import { nameInto, fitNames } from '/assets/js/player-name.mjs?v=f4f589f1dc';

const refit = new ResizeObserver((entries) => {
  for (const entry of entries) fitNames(entry.target.querySelectorAll('.pbd-name'));
});

// Fills the list (an <ol class="top-players">) with the leaderboard's rows, or says so when there are none.
export function drawTopPlayers(list, rows, empty = 'Nobody has placed yet.') {
  refit.observe(list);
  if (!rows.length) return list.replaceChildren(el('li', 'top-msg', empty));
  const cap = el('li', 'top-row top-cap');
  cap.setAttribute('aria-hidden', 'true');
  for (const [text, cls] of [
    ['#', 'top-r'],
    ['', ''],
    ['Player', ''],
    ['Badge', 'top-c-badge'],
    ['MMR', 'top-r'],
    ['Sets', 'top-r top-c-rec'],
    ['Won', 'top-r top-c-rate'],
  ])
    cap.append(el('span', cls, text));
  const items = rows.map((row) => {
    const href = playerPath(row.player);
    const line = el(href ? 'a' : 'div', 'top-row');
    if (href) line.href = href;
    const who = el('span', 'top-who');
    const region = regionCode(row.region ?? row.player.region);
    who.append(
      nameInto(el('b'), row.player.name),
      el('span', '', [row.player.tag && `#${row.player.tag}`, region].filter(Boolean).join(' · ')),
    );
    const badge = el('span', 'top-badge top-c-badge');
    const image = plate(row.rankId);
    if (image) badge.append(image);
    badge.append(el('span', '', row.rank ?? ''));
    line.append(
      el('span', 'top-place', fmt(row.position)),
      face(row.character, 40, { label: characterName(row.character) }),
      who,
      badge,
      el('span', 'top-mmr', fmt(row.mmr)),
      el('span', 'top-sub top-c-rec', record(row.wins, row.losses)),
      el('span', 'top-sub top-c-rate', pct(row.wins, row.losses)),
    );
    line.setAttribute(
      'aria-label',
      `${row.position}. ${row.player.name}, ${row.rank ?? 'unranked'}, ${fmt(row.mmr)} MMR, ${record(row.wins, row.losses)} in sets`,
    );
    const item = el('li');
    item.append(line);
    return item;
  });
  list.replaceChildren(cap, ...items);
  fitNames(list.querySelectorAll('.pbd-name'));
}
