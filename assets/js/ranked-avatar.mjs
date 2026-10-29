// <!-- check-allow: ranked -->
import { characterName } from '/assets/js/ranked-data.mjs?v=2fa1825259';

export function characterBadge(character) {
  const id = typeof character === 'string' && /^[a-z][a-z0-9_]{0,47}$/.test(character) ? character : null;
  const badge = document.createElement('span');
  badge.className = 'character-badge';
  badge.dataset.character = id || '';
  badge.textContent = id ? characterName(id) : 'Character unknown';
  return badge;
}
