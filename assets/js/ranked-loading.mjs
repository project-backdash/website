// <!-- check-allow: ranked -->
export function showLoading(target, text = 'Loading…', inline = false) {
  const wrap = document.createElement('span');
  wrap.className = 'stats-loading-indicator' + (inline ? ' stats-loading-inline' : '');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('pbd-loader');
  svg.setAttribute('viewBox', '-3 -3 90 30');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [index, d] of [
    'M0 12L12 0L13 0L13 8L24 8L24 16L13 16L13 24L12 24Z',
    'M30 12L42 0L43 0L43 8L54 8L54 16L43 16L43 24L42 24Z',
    'M60 21.8995L60 4.9289L60.7071 4.2218L66.364 9.8787L74.1421 2.1005L79.799 7.7574L72.0208 15.5355L77.6777 21.1924L76.9706 21.8995Z',
  ].entries()) {
    const arrow = document.createElementNS(svg.namespaceURI, 'path');
    arrow.setAttribute('d', d);
    arrow.setAttribute('class', 'pbd-loader-step step-' + (index + 1));
    svg.append(arrow);
  }
  const label = document.createElement('span');
  label.textContent = text;
  wrap.append(svg, label);
  target.setAttribute('role', 'status');
  target.replaceChildren(wrap);
}
