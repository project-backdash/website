export const RELEASE_SCHEMA = 'pbd-web-release-v1';
export const MAX_INSTALLER_BYTES = 1024 * 1024 * 1024;

function safeUrl(value, version) {
  if (typeof value !== 'string' || value.length > 1024) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || value !== url.href || url.username || url.password || url.port || url.search || url.hash) return false;
    if (url.pathname.includes('//') || url.pathname.endsWith('/')) return false;
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts.some(part => /[\\/\u0000-\u001f]/.test(part) || part === '..' || part === '.')) return false;
    const file = parts.at(-1);
    if (!/^Project Backdash Setup [0-9.]+\.exe$/.test(file || '') || file !== `Project Backdash Setup ${version}.exe`) return false;
    if (url.hostname === 'dl.backdash.gg') return parts.length === 3 && parts[0] === 'releases' && parts[1] === version;
    if (url.hostname === 'github.com') return parts.length === 6 && parts[0] === 'project-backdash' && parts[1] === 'launcher' && parts[2] === 'releases' && parts[3] === 'download' && parts[4] === `v${version}`;
    if (url.hostname === 'downloads.sourceforge.net') return parts.length === 4 && parts[0] === 'project' && parts[1] === 'project-backdash' && parts[2] === version;
  } catch {}
  return false;
}

export function validateSignedRelease(value) {
  if (!value || value.schema !== 'pbd-update-v1' || typeof value.version !== 'string' || !/^\d+(\.\d+){1,3}$/.test(value.version)) return null;
  if (value.notes !== undefined && (typeof value.notes !== 'string' || value.notes.length > 8000)) return null;
  const { installer, version } = value;
  if (!installer || !Number.isSafeInteger(installer.size) || installer.size <= 0 || installer.size > MAX_INSTALLER_BYTES || typeof installer.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(installer.sha256) || !safeUrl(installer.url, version)) return null;
  const mirrors = installer.mirrors === undefined ? [{ name: 'Download host', url: installer.url }] : installer.mirrors;
  if (!Array.isArray(mirrors) || mirrors.length < 1 || mirrors.length > 8 || mirrors[0]?.url !== installer.url) return null;
  const names = new Set(), urls = new Set();
  for (const mirror of mirrors) {
    if (!mirror || typeof mirror.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/.test(mirror.name) || !safeUrl(mirror.url, version) || names.has(mirror.name.toLowerCase())) return null;
    const parsed = new URL(mirror.url), canonical = parsed.origin + parsed.pathname.split('/').map(decodeURIComponent).join('/');
    if (urls.has(canonical)) return null;
    names.add(mirror.name.toLowerCase()); urls.add(canonical);
  }
  return { version, installer: { url: installer.url, size: installer.size, sha256: installer.sha256, mirrors: mirrors.map(({name, url}) => ({name, url})) } };
}

export function readRelease(value) {
  if (!value || value.schema !== RELEASE_SCHEMA) return { state: 'invalid', release: null };
  if (value.status === 'unreleased' && value.release === null) return { state: 'unreleased', release: null };
  if (value.status !== 'ready') return { state: 'invalid', release: null };
  const release = validateSignedRelease(value.release);
  return { state: release ? 'ready' : 'invalid', release };
}

export function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB (${bytes.toLocaleString('en-GB')} bytes)`;
}
