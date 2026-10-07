import { readRelease, formatBytes } from './release-manifest.js';

export function renderRelease(root, value) {
  const parsed = readRelease(value);
  const status = root.querySelector('[data-release-status]');
  const details = root.querySelector('[data-release-file]');
  const mirrors = root.querySelector('[data-release-mirrors]');
  if (!status || !details || !mirrors) return;
  details.replaceChildren(); mirrors.replaceChildren();
  if (root.dataset.release !== 'live' || parsed.state !== 'ready') {
    status.textContent = parsed.state === 'invalid' && root.dataset.release === 'live' ? 'Download details are unavailable. Please try again later.' : 'No public installer is available yet.';
    return;
  }
  const { version, installer } = parsed.release;
  status.textContent = `PROJECT BACKDASH ${version} for Windows, 64-bit.`;
  const list = document.createElement('dl'); list.className = 'dl';
  for (const [name, value] of [['Version', version], ['File size', formatBytes(installer.size)], ['SHA-256', installer.sha256]]) {
    const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = name; dd.textContent = value;
    if (name === 'SHA-256') dd.className = 'hash';
    row.append(dt, dd); list.append(row);
  }
  details.append(list);
  for (const [index, mirror] of installer.mirrors.entries()) {
    const row = document.createElement('li'), link = document.createElement('a');
    link.href = mirror.url; link.textContent = index === 0 ? `Download for Windows — ${mirror.name}` : mirror.name;
    if (index === 0) link.className = 'btn-primary';
    row.append(link); mirrors.append(row);
  }
}

const root = document.querySelector('[data-release]');
if (root?.querySelector('[data-release-status]')) {
  fetch('/release-manifest.json', { cache: 'no-store', credentials: 'same-origin' })
    .then(response => { if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new Error('unavailable'); } return response.json(); })
    .then(value => renderRelease(root, value))
    .catch(() => renderRelease(root, null));
}
