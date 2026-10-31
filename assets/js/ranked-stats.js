// <!-- check-allow: ranked -->
// <!-- check-allow: profiles -->
import { fetchRanked, RANK_BANDS, parsePlayerPath, StatsError } from '/assets/js/ranked-data.mjs?v=2fa1825259';
import { el, statsNav, dateLabel } from '/assets/js/ranked-ui.mjs?v=dcce91eb97';
import { playersView, matchupsView, leaderboardView } from '/assets/js/ranked-views.mjs?v=4278445667';
import { charactersView } from '/assets/js/ranked-characters.mjs?v=e9f3c8a232';
import { populationView } from '/assets/js/ranked-population.mjs?v=b35786fe33';
import { profileView } from '/assets/js/ranked-profile.mjs?v=a680aaf9c8';
import { showLoading } from '/assets/js/ranked-loading.mjs?v=99f2b86e88';

function mount(root, view, player) {
  const params = new URLSearchParams(location.search);
  const heading = root.querySelector('h1');
  const filters = el('div', 'ranked-filters');
  const status = el('p', 'ranked-status', 'Loading…');
  status.setAttribute('role', 'status');
  const retry = el('button', 'btn', 'Try again');
  retry.type = 'button';
  retry.hidden = true;
  const content = el('div', 'ranked-content');
  if (view === 'leaderboard') root.classList.add('ranked-leaderboard');
  if (view === 'characters') root.classList.add('ranked-analytics');
  root.append(statsNav(view === 'profile' ? '' : view === 'leaderboard' ? '/stats/leaderboard/' : location.pathname), filters, status, retry, content);
  root.querySelector('[data-ranked-fallback]')?.remove();
  let pending, repeat;
  const app = {
    base: root.dataset.rankedApi,
    title: heading,
    params,
    filters,
    status,
    content,
    band: () => (RANK_BANDS.some(([id]) => id === params.get('rankBand')) ? params.get('rankBand') : 'all'),
    setParam(key, value) {
      if (value && value !== 'all') params.set(key, value);
      else params.delete(key);
      history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : '') + location.hash);
    },
    async load(endpoint, query, render, kind = endpoint) {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      repeat = () => app.load(endpoint, query, render, kind);
      retry.hidden = true;
      content.replaceChildren();
      content.setAttribute('aria-busy', 'true');
      showLoading(status, view === 'players' ? 'Searching…' : 'Loading…');
      try {
        const data = await fetchRanked(app.base, endpoint, kind, query, controller.signal);
        if (pending !== controller) return;
        await render(data);
        if (pending !== controller) return;
        status.textContent = `${data.season === 'preseason-1' ? 'Preseason' : 'Beta Season'} · Updated ${dateLabel(data.updatedAt)}`;
      } catch (error) {
        if (pending !== controller) return;
        content.replaceChildren();
        status.textContent = error instanceof StatsError ? error.message : 'Stats are unavailable. Try again shortly.';
        retry.hidden = error.status === 404;
      } finally {
        if (pending === controller) content.removeAttribute('aria-busy');
      }
    },
  };
  retry.addEventListener('click', () => repeat?.());
  if (view === 'profile') profileView(app, player);
  else
    ({
      players: playersView,
      characters: charactersView,
      matchups: matchupsView,
      leaderboard: leaderboardView,
      ranks: populationView,
    })[view]?.(app);
}

const player = parsePlayerPath(location.pathname);
let root = document.querySelector('[data-ranked-view]');
if (player && document.querySelector('[data-player-route]')) {
  const main = document.querySelector('main');
  main.className = 'page-main';
  root = el('div', 'page-col ranked-stats');
  root.dataset.rankedApi = document.querySelector('[data-player-route]').dataset.playerRoute;
  const header = el('header', 'page-head');
  header.append(el('h1', '', `${player.name}#${player.tag}`));
  root.append(header);
  main.replaceChildren(root);
  document.title = `${player.name}#${player.tag} | Project Backdash`;
  mount(root, 'profile', player);
} else if (root) mount(root, root.dataset.rankedView);
