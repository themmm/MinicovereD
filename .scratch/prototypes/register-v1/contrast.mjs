import { PALETTES } from './palettes.js';

const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const PAIRS = [
  ['body text',        'ink',      'surface', 4.5],
  ['secondary text',   'inkSoft',  'surface', 4.5],
  ['field labels 12px','inkFaint', 'surface', 4.5],
  ['hint on page',     'inkSoft',  'page',    4.5],
  ['WARNING text',     'accent',   'accentSoft', 4.5],
  ['ready pill',       'ok',       'okSoft',  4.5],
  ['shell text',       'shellInk', 'shell',   4.5],
  ['shell tagline',    'shellFaint','shell',  4.5],
  ['panel border',     'line',     'surface', 3.0],
  ['input border',     'line',     'page',    3.0],
];

const rows = [];
for (const [key, p] of Object.entries(PALETTES)) {
  const scores = PAIRS.map(([, fg, bg]) => ratio(p[fg], p[bg]));
  const fails = scores.filter((s, i) => s < PAIRS[i][3]);
  const textOnly = scores.slice(0, 8);
  rows.push({ key, label: p.label, dark: p.dark, scores, fails: fails.length,
              worst: Math.min(...scores.map((s, i) => s / PAIRS[i][3])),
              minText: Math.min(...textOnly) });
}

const w = (s, n) => String(s).padEnd(n);
console.log(w('palette', 22) + w('mode', 6) + PAIRS.map(([n]) => n.slice(0, 9).padStart(10)).join('') + '   fails');
for (const r of rows.sort((a, b) => b.worst - a.worst)) {
  console.log(
    w(r.label, 22) + w(r.dark ? 'dark' : 'light', 6) +
    r.scores.map((s, i) => (s.toFixed(2) + (s < PAIRS[i][3] ? '!' : ' ')).padStart(10)).join('') +
    '   ' + (r.fails === 0 ? 'none' : r.fails)
  );
}
console.log('\ntargets: ' + PAIRS.map(([n, , , t]) => `${n}=${t}`).join(', '));
console.log('\n-- paper against each mode\'s darkest chrome (simultaneous-contrast load on white) --');
for (const [, p] of Object.entries(PALETTES)) {
  console.log(w(p.label, 22) + 'paper #ffffff on shell ' + p.shell + '  = ' + ratio('#ffffff', p.shell).toFixed(1) + ':1');
}
