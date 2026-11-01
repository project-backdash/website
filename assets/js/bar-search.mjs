// <!-- check-allow: ranked -->
// The bar's player search, on every page. A page with its own, bigger box (the Ranked board and the Players page mark
// it data-own-search) hides this one, and "/" goes to that one instead. The suggestions' code (ranked-kit.mjs and what it reads)
// loads the first time the box is used, so a page that never searches never fetches it; until then Enter searches on
// the Players page. On a narrow screen the box opens under the bar from its icon; Escape closes it again and puts
// focus back on the icon.

const form = document.querySelector('[data-bar-search]');
if (form && !document.querySelector('[data-own-search]')) {
  const open = form.querySelector('.bar-search-open');
  const input = form.querySelector('input');
  const show = (value) => {
    form.classList.toggle('is-open', value);
    open.setAttribute('aria-expanded', String(value));
  };
  let ready = null;
  const start = () =>
    (ready ??= import('/assets/js/ranked-kit.mjs?v=f30d870cde').then(({ playerSearch }) => {
      playerSearch(form, { base: form.dataset.barSearch, slash: false });
      // Whatever was typed while the code loaded is searched now.
      if (input.value.trim()) input.dispatchEvent(new Event('input'));
    }));
  input.addEventListener('focus', start);
  open.addEventListener('click', () => {
    const value = !form.classList.contains('is-open');
    show(value);
    if (value) input.focus();
  });
  // Escape with no suggestions showing (the first one closes them) closes the opened box.
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !form.classList.contains('is-open') || !open.getClientRects().length) return;
    if (form.querySelector('.rk-search-list:not([hidden])')) return;
    show(false);
    open.focus();
  });
  input.addEventListener('blur', () =>
    setTimeout(() => {
      if (!form.contains(document.activeElement)) show(false);
    }, 150),
  );
  // "/" opens the search from anywhere on the page but a field.
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
      return;
    event.preventDefault();
    show(true);
    input.focus();
  });
}
