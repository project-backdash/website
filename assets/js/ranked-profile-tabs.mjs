// <!-- check-allow: ranked -->
// <!-- check-allow: profiles -->
import { el } from '/assets/js/ranked-ui.mjs?v=dcce91eb97';

export function profileTabs(content) {
  const nav = el('nav', 'ranked-nav ranked-profile-tabs');
  nav.setAttribute('aria-label', 'Player statistics');
  nav.setAttribute('role', 'tablist');
  const panels = ['characters', 'rating', 'games', 'activity', 'matchups', 'head-to-head'].map((id) =>
    content.querySelector('#profile-' + id),
  );
  const tabs = [];
  const activate = (index, focus = false) => {
    panels.forEach((panel, i) => {
      const inOverview = index === 0 && i < 3;
      panel.hidden = i !== index && !inOverview;
      if (panel.tagName === 'DETAILS') panel.open = i === index;
      if (i === index) {
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tabs[i].id);
      } else {
        panel.removeAttribute('role');
        panel.removeAttribute('aria-labelledby');
      }
      tabs[i].setAttribute('aria-selected', String(i === index));
      tabs[i].tabIndex = i === index ? 0 : -1;
    });
    if (focus) tabs[index].focus();
  };
  for (const [index, label] of ['Overview', 'Rating', 'Games', 'Activity', 'Matchups', 'Head to head'].entries()) {
    const tab = el('a', '', label),
      panel = panels[index];
    tab.id = panel.id + '-tab';
    tab.href = '#' + panel.id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('click', (event) => {
      event.preventDefault();
      history.replaceState(null, '', location.pathname + location.search + tab.hash);
      activate(index);
    });
    tab.addEventListener('keydown', (event) => {
      const next = {
        ArrowRight: (index + 1) % panels.length,
        ArrowLeft: (index + panels.length - 1) % panels.length,
        Home: 0,
        End: panels.length - 1,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      tabs[next].click();
      tabs[next].focus();
    });
    tabs.push(tab);
    nav.append(tab);
  }
  content.prepend(nav);
  const fromHash = () =>
    activate(
      Math.max(
        0,
        panels.findIndex((p) => '#' + p.id === location.hash),
      ),
    );
  fromHash();
  addEventListener('hashchange', fromHash);
}
