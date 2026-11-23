// Banque de posts : rotation en alternant les thèmes (« Le temps » puis « Directrices »),
// chacun dans l'ordre de ses numéros : 1, 6, 2, 7, 3, 8… puis on recommence.
// Les posts eux-mêmes sont dans ma base (jamais dans le code).

export const THEMES = { temps: 'Le temps', directrices: 'Directrices' };

export function rotation(posts) {
  const by = (theme) => posts.filter((p) => !p.deleted && (p.theme || 'temps') === theme).sort((a, b) => (a.num ?? 99) - (b.num ?? 99));
  const lists = Object.keys(THEMES).map(by);
  const out = [];
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

export function currentPost(posts, cursor = 0) {
  const r = rotation(posts);
  return r.length ? { post: r[((cursor % r.length) + r.length) % r.length], position: (cursor % r.length) + 1, total: r.length } : null;
}
