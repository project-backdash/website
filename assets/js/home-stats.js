// <!-- check-allow: ranked -->
import { readStats } from '/assets/js/stats.js?v=0a4e010ab3';
import { playerPath } from '/assets/js/ranked-data.mjs?v=2fa1825259';

const root = document.querySelector('[data-home-stats]');
const counts = root.querySelectorAll('[data-home-count]');
const status = root.querySelector('[data-home-status]');
const leaders = root.querySelector('[data-home-leaders]');
const number = new Intl.NumberFormat('en-US');
status.textContent = 'Loading stats…';

async function update() {
  try {
    const response = await fetch(root.dataset.homeStats, { credentials: 'omit', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Stats unavailable');
    const stats = readStats(await response.json());
    if (!stats) throw new Error('Invalid stats');
    for (const cell of counts) cell.textContent = number.format(stats.totals[cell.dataset.homeCount]);
    leaders.replaceChildren();
    for (const player of stats.players.slice(0, 5)) {
      const row = document.createElement('li');
      const link = document.createElement('a');
      link.textContent = player.player + (/^\d{4}$/.test(player.tag ?? '') ? `#${player.tag}` : '');
      link.href = playerPath({ name: player.player, tag: player.tag }) || '/stats/players/?q=' + encodeURIComponent(player.player);
      const detail = document.createElement('span');
      detail.textContent = `${player.rank} · ${number.format(player.mmr)} MMR`;
      row.append(link, detail);
      leaders.append(row);
    }
    if (!stats.players.length) leaders.textContent = 'No Ranked players yet.';
    status.textContent = stats.updated ? `Updated ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(stats.updated)} UTC.` : '';
  } catch {
    for (const cell of counts) cell.textContent = '—';
    status.textContent = 'Stats are unavailable right now.';
    leaders.textContent = 'Stats are unavailable right now.';
  }
}
update();
setInterval(() => { if (!document.hidden) update(); }, 300000);
