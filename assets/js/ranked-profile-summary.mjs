// <!-- check-allow: ranked -->
// <!-- check-allow: profiles -->
import { characterName } from '/assets/js/ranked-data.mjs?v=2fa1825259';
import { characterBadge } from '/assets/js/ranked-avatar.mjs?v=1cc811626f';
import { REGIONS } from '/assets/js/ranked-filters.mjs?v=a47ec7b13c';
import { el, number, percent, dateLabel } from '/assets/js/ranked-ui.mjs?v=dcce91eb97';

export function profileSummary(title, data) {
  const header = title.parentElement;
  header.classList.add('ranked-profile-head');
  header.querySelector('.ranked-profile-summary')?.remove();
  const summary = el('div', 'ranked-profile-summary');
  const identity = el('div', 'ranked-profile-identity');
  identity.append(characterBadge(data.player.avatarCharacter));
  const best = data.rating;
  if (best) {
    identity.append(el('strong', '', best.rank || 'Unranked'));
    if (best.mmr != null) identity.append(el('strong', '', `${number(best.mmr)} MMR`));
    if (best.provisional) identity.append(el('span', 'ranked-sub', 'Provisional'));
    if (best.character && best.character !== data.player.avatarCharacter)
      identity.append(el('span', 'ranked-sub', `Ranked: ${characterName(best.character)}`));
  } else identity.append(el('strong', '', 'Unranked'));
  summary.append(identity);
  const record = data.characters.reduce(
    (total, row) => ({
      wins: total.wins + row.wins,
      losses: total.losses + row.losses,
      draws: total.draws + row.draws,
    }),
    { wins: 0, losses: 0, draws: 0 },
  );
  const latest = data.recentMatches[0];
  const region = data.recentMatches.find((game) => game.region)?.region;
  const facts = el('dl', 'ranked-profile-facts');
  for (const [label, value] of [
    ['Wins – losses', `${number(record.wins)} – ${number(record.losses)}`],
    ['Win rate', record.wins + record.losses ? percent(record.wins / (record.wins + record.losses)) : null],
    ['Draws', record.draws ? number(record.draws) : null],
    ['Region', region ? REGIONS.find(([id]) => id === region)?.[1] || region.toUpperCase() : null],
    ['Last played', latest ? dateLabel(latest.date) : null],
  ]) {
    if (value == null) continue;
    const fact = el('div');
    fact.append(el('dt', '', label), el('dd', '', value));
    facts.append(fact);
  }
  summary.append(facts);
  header.append(summary);
}
