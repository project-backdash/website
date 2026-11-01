// <!-- check-allow: ranked -->
// <!-- check-allow: profiles -->
import { fetchRanked, RANK_BANDS, parsePlayerRoute, StatsError } from '/assets/js/ranked-data.mjs?v=dde3981e98';
import { el, statsNav, dateLabel } from '/assets/js/ranked-ui.mjs?v=8eae8314f1';
import { showLoading } from '/assets/js/ranked-loading.mjs?v=78371fcc9f';

// Each page loads only its own view: a player page (404.html) never waits for the Stats views, nor they for it.
const VIEWS = {
  players: () => import('/assets/js/ranked-views.mjs?v=6c534fa2f3').then((m) => m.playersView),
  matchups: () => import('/assets/js/ranked-views.mjs?v=6c534fa2f3').then((m) => m.matchupsView),
  characters: () => import('/assets/js/ranked-characters.mjs?v=375f325d73').then((m) => m.charactersView),
  ranks: () => import('/assets/js/ranked-population.mjs?v=1a45e15f6a').then((m) => m.populationView),
};

async function mount(root, view) {
  const show = VIEWS[view]?.();
  const params = new URLSearchParams(location.search);
  const heading = root.querySelector('h1');
  const filters = el('div', 'ranked-filters');
  const status = el('p', 'ranked-status', 'Loading…');
  status.setAttribute('role', 'status');
  const retry = el('button', 'btn', 'Try again');
  retry.type = 'button';
  retry.hidden = true;
  const content = el('div', 'ranked-content');
  if (view === 'characters') root.classList.add('ranked-analytics');
  root.append(statsNav(location.pathname), filters, status, retry, content);
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
  (await show)?.(app);
}

// GitHub Pages answers every unknown address with 404.html, so player pages are drawn from there. Its inline
// script has already framed the page for an address shaped like a player's; one that does not read as a player
// goes back to the plain missing page.
const route = parsePlayerRoute(location.pathname);
const playerRoute = document.querySelector('[data-player-route]');
const root = document.querySelector('[data-ranked-view]');
if (route && playerRoute)
  import('/assets/js/ranked-player.mjs?v=9034fcac96').then(({ playerPage }) =>
    playerPage(document.querySelector('main'), route, playerRoute.dataset.playerRoute),
  );
else if (playerRoute && document.documentElement.classList.contains('is-player')) {
  const main = document.querySelector('main');
  if (main.parentElement.classList.contains('page')) main.parentElement.replaceWith(main);
  main.className = 'nf';
  document.documentElement.classList.remove('is-player');
} else if (root) mount(root, root.dataset.rankedView);
