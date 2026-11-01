// <!-- check-allow: ranked -->
// The bar's player search on pages about players. The Ranked landing has its own, bigger box, so this one stays
// hidden there and "/" goes to that one instead.
import { playerSearch } from '/assets/js/ranked-kit.mjs?v=a623c764b6';

const form = document.querySelector('[data-bar-search]');
if (form && !document.querySelector('.rk-landing')) {
  const open = form.querySelector('.bar-search-open');
  const { input } = playerSearch(form, { base: form.dataset.barSearch });
  const show = (value) => {
    form.classList.toggle('is-open', value);
    open.setAttribute('aria-expanded', String(value));
  };
  open.addEventListener('click', () => {
    const value = !form.classList.contains('is-open');
    show(value);
    if (value) input.focus();
  });
  form.addEventListener('rk-open', () => show(true));
  input.addEventListener('blur', () =>
    setTimeout(() => {
      if (!form.contains(document.activeElement)) show(false);
    }, 150),
  );
}
