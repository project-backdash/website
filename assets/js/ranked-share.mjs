// <!-- check-allow: ranked -->
// <!-- check-allow: profiles -->
// The Share dialog on a player page: the player card's live preview beside its options (stacked on a phone), and
// Share, Download and Copy image for the PNG. It is a modal <dialog>, so the page behind it is inert, focus stays
// inside and Esc closes it. Options with nothing to show for the chosen character are hidden, and the choices are
// remembered in this browser for the next card.
import { characterName, profileEndpoint, fetchRanked } from '/assets/js/ranked-data.mjs?v=dde3981e98';
import { el, face, loading } from '/assets/js/ranked-kit.mjs?v=a623c764b6';
import {
  FORMATS,
  ACCENTS,
  WIDGETS,
  DETAILS,
  MAX_WIDGETS,
  SET_ROWS,
  pickWidget,
  cardCharacters,
  cardOptions,
  cardModel,
  cardLayout,
  drawCard,
  fileName,
  readChoices,
  keepChoices,
} from '/assets/js/ranked-card.mjs?v=f1136a59c1';

const CLOSE_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
// Barlow at each weight the card uses, and PBD Display: the canvas draws only with fonts already loaded.
const FONTS = ['400 40px "PBD Display"', '400 24px Barlow', '500 24px Barlow', '600 24px Barlow', '700 24px Barlow'];

let fontsReady = null;
function loadFonts() {
  fontsReady ??= Promise.all(FONTS.map((font) => document.fonts?.load(font).catch(() => null)));
  return fontsReady;
}

const pictures = new Map();
function loadPicture(url) {
  if (!pictures.has(url))
    pictures.set(
      url,
      new Promise((resolve) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = url;
      }),
    );
  return pictures.get(url);
}

// The mark and the wordmark as drawings, read from the site's own SVG files so the card's logo is the site's.
let brandArt = null;
function loadBrand() {
  const read = (url) =>
    fetch(url)
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
      .then((svg) => {
        const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
        const paths = [...svg.matchAll(/<path\b[^>]*?\bd="([^"]+)"[^>]*?\bfill="(#[0-9A-Fa-f]{3,8})"/g)].map(
          ([, d, fill]) => ({ path: new Path2D(d), fill }),
        );
        return box && paths.length ? { box: [Number(box[1]), Number(box[2])], paths } : null;
      })
      .catch(() => null);
  brandArt ??= Promise.all([read('/assets/brand/mark.svg?v=5187f37382'), read('/assets/brand/wordmark.svg?v=9116ec80dd')]);
  return brandArt;
}

function option(type, name, value, label) {
  const box = el('label', type === 'checkbox' ? 'rk-share-check' : 'rk-share-opt');
  const input = el('input');
  input.type = type;
  input.name = name;
  input.value = value;
  box.append(input);
  if (label != null) box.append(typeof label === 'string' ? el('span', '', label) : label);
  return box;
}
function group(legend, className = 'rk-share-row') {
  const set = el('fieldset', 'rk-share-group');
  const title = el('legend');
  title.append(...(Array.isArray(legend) ? legend : [legend]));
  const row = el('div', className);
  set.append(title, row);
  return { set, row };
}

// `loaders` are the page's own reads, so the card shares what the page already fetched: ratingRows(ctx, character)
// and matchupRows(ctx). `opener` gets focus back when the dialog closes.
export function openShare(ctx, loaders, opener) {
  ctx.share ??= shareDialog(ctx, loaders);
  ctx.share.open(opener);
}

function shareDialog(ctx, loaders) {
  const { profile } = ctx;
  const player = profile.player;
  const wish = { ...readChoices(), character: profile.rating?.character ?? null };
  let model = null,
    revision = 0,
    drawn = Promise.resolve(),
    ready = null,
    returnTo = null;

  const dialog = el('dialog', 'rk-share');
  dialog.setAttribute('aria-labelledby', 'rk-share-title');
  const inner = el('div', 'rk-share-in');
  const head = el('div', 'rk-share-head');
  const title = el('h2', '', 'Player card');
  title.id = 'rk-share-title';
  const close = el('button', 'rk-share-close');
  close.type = 'button';
  close.innerHTML = CLOSE_ICON;
  close.setAttribute('aria-label', 'Close');
  head.append(title, close);

  const body = el('div', 'rk-share-body');
  const stage = el('div', 'rk-share-stage');
  const frame = el('div', 'rk-share-frame');
  const canvas = el('canvas');
  canvas.setAttribute('role', 'img');
  const wait = loading('Drawing the card');
  frame.append(canvas, wait);
  const size = el('p', 'rk-share-size');
  stage.append(frame, size);

  const form = el('form', 'rk-share-opts');
  form.setAttribute('aria-label', 'Card options');
  form.addEventListener('submit', (event) => event.preventDefault());

  const chars = group('Character');
  for (const row of cardCharacters(profile)) {
    const label = el('span', '', characterName(row.character));
    const box = option('radio', 'character', row.character, label);
    box.insertBefore(face(row.character, 24), label);
    chars.row.append(box);
  }
  const formats = group('Format');
  for (const format of FORMATS) {
    const label = el('span');
    const shape = el('i', 'rk-share-shape');
    shape.style.aspectRatio = `${format.width} / ${format.height}`;
    label.append(format.name, ' ', el('small', '', format.ratio));
    const box = option('radio', 'format', format.id, label);
    box.insertBefore(shape, label);
    formats.row.append(box);
  }
  const accents = group('Accent', 'rk-share-row rk-share-swatches');
  for (const accent of ACCENTS) {
    const box = option('radio', 'accent', accent.id, el('span', 'visually-hidden', accent.name));
    box.className = 'rk-share-swatch';
    box.title = accent.name;
    box.style.setProperty('--swatch', accent.line);
    accents.row.append(box);
  }
  const ranks = group('Rank');
  ranks.row.append(option('radio', 'rank', 'current', 'Current'), option('radio', 'rank', 'peak', 'Peak'));
  const widgets = group(['Widgets ', el('small', '', `up to ${MAX_WIDGETS}`)], 'rk-share-list');
  for (const widget of WIDGETS) widgets.row.append(option('checkbox', 'widget', widget.id, widget.name));
  const details = group('Details', 'rk-share-list');
  const scopes = el('div', 'rk-share-row rk-share-scopes');
  const regionLabel = el('span');
  for (const detail of DETAILS) {
    details.row.append(option('checkbox', 'detail', detail.id, detail.name));
    if (detail.id === 'place') {
      scopes.append(option('radio', 'scope', 'all', 'All regions'), option('radio', 'scope', 'region', regionLabel));
      details.row.append(scopes);
    }
  }
  form.append(chars.set, formats.set, accents.set, ranks.set, widgets.set, details.set);
  body.append(stage, form);

  const actions = el('div', 'rk-share-actions');
  const button = (text, main) => {
    const node = el('button', main ? 'rk-btn rk-btn-main' : 'rk-btn', text);
    node.type = 'button';
    return node;
  };
  // The first button is the main one: Share where the device can share a picture, else Download.
  const sharing = canShareFiles();
  const share = button('Share', true);
  const download = button('Download', !sharing);
  const copy = button('Copy image');
  share.hidden = !sharing;
  copy.hidden = !canCopyImage();
  const status = el('p', 'rk-share-status');
  status.setAttribute('role', 'status');
  actions.append(share, download, copy, status);
  inner.append(head, body, actions);
  dialog.append(inner);
  document.body.append(dialog);

  const inputs = (name) => [...form.querySelectorAll(`input[name="${name}"]`)];
  const shown = (input, visible) => (input.closest('label').hidden = !visible);

  // The form shows the settled choices; hidden options keep what was wished for, for a character that has them.
  function showChoices(options, choices) {
    chars.set.hidden = options.characters.length < 2;
    for (const input of inputs('character')) input.checked = input.value === choices.character;
    for (const input of inputs('format')) input.checked = input.value === choices.format;
    for (const input of inputs('accent')) input.checked = input.value === choices.accent;
    ranks.set.hidden = options.ranks.length < 2;
    for (const input of inputs('rank')) input.checked = input.value === choices.rank;
    widgets.set.hidden = !options.widgets.length;
    for (const input of inputs('widget')) {
      shown(input, options.widgets.includes(input.value));
      input.checked = choices.widgets.includes(input.value);
    }
    for (const input of inputs('detail')) {
      shown(input, options.details.includes(input.value));
      input.checked = choices.details[input.value];
    }
    scopes.hidden = options.scopes.length < 2 || !choices.details.place;
    regionLabel.textContent = options.scopeNames.region ?? '';
    for (const input of inputs('scope')) input.checked = input.value === choices.scope;
  }

  form.addEventListener('change', (event) => {
    const input = event.target;
    if (input.name === 'widget')
      wish.widgets = pickWidget(wish.widgets, input.value, input.checked, model?.options.widgets ?? []);
    else if (input.name === 'detail') wish.details = { ...wish.details, [input.value]: input.checked };
    else wish[input.name] = input.value;
    keepChoices(wish);
    render();
  });

  // Each character's own reads, once: its rating rows, its latest sets and the player's matchups. A read that
  // fails leaves only the options it feeds hidden.
  const reads = new Map();
  function readsFor(character) {
    if (!reads.has(character)) {
      const sets = ctx.hasSets
        ? fetchRanked(ctx.base, profileEndpoint(player) + '/sets', 'sets', { character, limit: SET_ROWS }).then(
            (data) => data.rows,
            () => profile.recentSets,
          )
        : null;
      reads.set(
        character,
        Promise.allSettled([loaders.ratingRows(ctx, character), loaders.matchupRows(ctx), sets]).then(
          ([history, matchups, recent]) => ({
            history: history.value ?? null,
            matchups: matchups.value ?? null,
            sets: recent.value ?? null,
          }),
        ),
      );
    }
    return reads.get(character);
  }

  // Redrawn on every change; a newer change makes an older draw stop where it is.
  function render() {
    const current = ++revision;
    ready = null;
    drawn = (async () => {
      const data = await readsFor(cardOptions(source(null), wish.character).character);
      if (current !== revision) return;
      const next = cardModel(source(data), wish);
      showChoices(next.options, next.choices);
      const layout = cardLayout(next.card.format.id, { widgets: next.card.widgets, facts: next.card.facts.length });
      const [images, [mark, wordmark]] = await Promise.all([
        Promise.all(next.card.images.map(async (url) => [url, await loadPicture(url)])),
        loadBrand(),
        loadFonts(),
      ]);
      if (current !== revision) return;
      model = { ...next, layout };
      if (canvas.width !== layout.W) canvas.width = layout.W;
      if (canvas.height !== layout.H) canvas.height = layout.H;
      drawCard(canvas.getContext('2d'), next.card, layout, { images: new Map(images), mark, wordmark });
      canvas.setAttribute('aria-label', next.card.summary);
      size.textContent = `${layout.W} x ${layout.H} PNG`;
      wait.hidden = true;
      canvas.hidden = false;
      fitPreview();
      // The PNG is made now, so Share and Copy image can hand it over inside the click itself: Safari refuses a
      // share that waits for anything first.
      encode().then(
        (blob) => {
          if (current === revision) ready = blob;
        },
        () => {},
      );
    })().catch(() => {
      if (current === revision) say('The card could not be drawn. Close this and try again.');
    });
    return drawn;
  }
  const source = (data) => ({
    profile,
    table: ctx.table,
    board: ctx.own?.board ?? null,
    data: data ?? {},
    now: Date.now(),
  });

  // The preview keeps the card's shape at the largest size its box allows.
  function fitPreview() {
    if (!model) return;
    const scale = Math.min(frame.clientWidth / model.layout.W, frame.clientHeight / model.layout.H);
    if (!(scale > 0)) return;
    canvas.style.width = `${Math.floor(model.layout.W * scale)}px`;
    canvas.style.height = `${Math.floor(model.layout.H * scale)}px`;
  }
  new ResizeObserver(fitPreview).observe(frame);

  let sayTimer;
  const say = (text) => {
    status.textContent = text;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => (status.textContent = ''), 4000);
  };
  const encode = () =>
    new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No image'))), 'image/png'),
    );
  // The PNG of the card as last drawn: the one made after the draw, else made once the draw in progress is done.
  const png = async () => {
    if (ready) return ready;
    await drawn;
    return ready ?? encode();
  };
  const name = () => fileName(player.name, model?.choices.format ?? 'post');

  share.addEventListener('click', async () => {
    try {
      const file = new File([ready ?? (await png())], name(), { type: 'image/png' });
      await navigator.share({ files: [file], title: `${player.name}#${player.tag} | Project Backdash` });
    } catch (error) {
      if (error?.name !== 'AbortError') say('Sharing did not work here. Download the image instead.');
    }
  });
  download.addEventListener('click', async () => {
    try {
      const url = URL.createObjectURL(await png());
      const link = el('a');
      link.href = url;
      link.download = name();
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      say(`Saved as ${name()}`);
    } catch {
      say('The image could not be made. Try again.');
    }
  });
  copy.addEventListener('click', async () => {
    try {
      // The item takes the image, or the promise of it while it is being made, so the copy stays inside the click.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': ready ?? png() })]);
      say('Image copied');
    } catch {
      say('Copying did not work here. Download the image instead.');
    }
  });

  close.addEventListener('click', () => dialog.close());
  // A click on the backdrop lands on the dialog itself; its content fills it edge to edge.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => returnTo?.focus());

  return {
    open(opener) {
      returnTo = opener ?? null;
      status.textContent = '';
      if (!model) {
        canvas.hidden = true;
        wait.hidden = false;
      }
      dialog.showModal();
      render();
    },
  };
}

function canShareFiles() {
  try {
    return Boolean(navigator.canShare?.({ files: [new File([new Uint8Array(8)], 'card.png', { type: 'image/png' })] }));
  } catch {
    return false;
  }
}
function canCopyImage() {
  try {
    return (
      typeof ClipboardItem === 'function' &&
      typeof navigator.clipboard?.write === 'function' &&
      (ClipboardItem.supports?.('image/png') ?? true)
    );
  } catch {
    return false;
  }
}
