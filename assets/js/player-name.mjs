// A player's name in a narrow column. It breaks only at its natural points: after a space, dot, underscore or
// hyphen, or before a capital that follows a small letter (TKKN.|UNDERGROUND, Suid|Afrika|Mitsu), as the share
// card breaks one. A part still wider than its column takes a smaller size, and only past that may it break
// anywhere, so a name is never cut short. Pages style .pbd-name and its .is-small and .is-tight steps.
const BREAKS = /(?<=[\s._-])|(?<=\p{Ll})(?=\p{Lu})/u;

// Fills node with the name, a <wbr> at each natural break, and returns it.
export function nameInto(node, name) {
  String(name)
    .split(BREAKS)
    .forEach((part, index) => {
      if (index) node.append(document.createElement('wbr'));
      node.append(part);
    });
  node.classList.add('pbd-name');
  return node;
}

// Steps each block-level name down as far as its column needs. Run once the names are on the page and again
// whenever their column changes width.
export function fitNames(nodes) {
  const wide = (node) => node.scrollWidth > node.clientWidth + 1;
  for (const node of nodes) {
    node.classList.remove('is-small', 'is-tight');
    if (!wide(node)) continue;
    node.classList.add('is-small');
    if (wide(node)) node.classList.add('is-tight');
  }
}
