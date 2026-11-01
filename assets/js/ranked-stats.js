// <!-- check-allow: ranked -->
// <!-- check-allow: profiles -->
import { fetchRanked, RANK_BANDS, parsePlayerRoute, StatsError } from '/assets/js/ranked-data.mjs?v=dde3981e98';
import { el, dateLabel } from '/assets/js/ranked-ui.mjs?v=8b024de9ed';
import { seasonLabel } from '/assets/js/ranked-kit.mjs?v=f30d870cde';
import { showLoading } from '/assets/js/ranked-loading.mjs?v=78371fcc9f';

// Each page loads only its own view: a player page (404.html) never waits for the Stats views, nor they for it.
const VIEWS = {
  players: () => import('/assets/js/ranked-views.mjs?v=85dfb4983e').then((m) => m.playersView),
  matchups: () => import('/assets/js/ranked-views.mjs?v=85dfb4983e').then((m) => m.matchupsView),
  characters: () => import('/assets/js/ranked-characters.mjs?v=05117d9a37').then((m) => m.charactersView),
  ranks: () => import('/assets/js/ranked-population.mjs?v=1656eb343e').then((m) => m.populationView),
};

async function mount(root, view) {
  const show = VIEWS[view]?.();
  const params = new URLSearchParams(location.search);
  const heading = root.querySelector('h1');
  const season = root.querySelector('[data-season]');
  const filters = el('div', 'ranked-filters');
  const status = el('p', 'ranked-status', 'Loading…');
  status.setAttribute('role', 'status');
  const retry = el('button', 'btn', 'Try again');
  retry.type = 'button';
  retry.hidden = true;
  // Busy from the start, so the page holds its height until the view has drawn (ranked-stats.css).
  const content = el('div', 'ranked-content');
  content.setAttribute('aria-busy', 'true');
  if (view === 'characters') root.classList.add('ranked-analytics');
  root.querySelector('[data-ranked-fallback]')?.remove();
  root.append(filters, status, retry, content);
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
        status.textContent = `Updated ${dateLabel(data.updatedAt)}`;
        if (season) season.textContent = seasonLabel(data);
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
  (await show)?.(app);
  // A view with nothing to load yet (Players before a search) is drawn at once.
  if (!pending) content.removeAttribute('aria-busy');
}

// GitHub Pages answers every unknown address with 404.html, so player pages are drawn from there. Its inline
// script has already marked an address shaped like a player's; one that does not read as a player goes back to the
// plain missing page.
const route = parsePlayerRoute(location.pathname);
const playerRoute = document.querySelector('[data-player-route]');
const root = document.querySelector('[data-ranked-view]');
if (route && playerRoute)
  import('/assets/js/ranked-player.mjs?v=d285108c7a').then(({ playerPage }) =>
    playerPage(document.querySelector('main'), route, playerRoute.dataset.playerRoute),
  );
else if (playerRoute) document.documentElement.classList.remove('is-player');
else if (root) mount(root, root.dataset.rankedView);
