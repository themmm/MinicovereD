import { readFileSync, writeFileSync } from 'node:fs';
const REPO = '/Users/timo/git/mdcovergen';
const F = '/private/tmp/claude-501/-Users-timo-git-mdcovergen/957b2702-de78-4573-9ee4-d6e865fb3c33/scratchpad/fonts/x';
const b64 = (p) => readFileSync(p).toString('base64');
const face = (fam, p, extra = '') =>
  `@font-face{font-family:'${fam}';font-style:normal;${extra}font-display:block;src:url(data:font/woff2;base64,${b64(p)}) format('woff2');}`;

const faces = [
  face('Noto Sans Proto', `${REPO}/node_modules/@fontsource-variable/noto-sans/files/noto-sans-latin-wght-normal.woff2`, 'font-weight:100 900;'),
  face('JetBrains Mono Proto', `${F}/fontsource-variable-jetbrains-mono-5.3.0/package/files/jetbrains-mono-latin-wght-normal.woff2`, 'font-weight:100 800;'),
  face('Fira Code Proto', `${F}/fontsource-variable-fira-code-5.3.0/package/files/fira-code-latin-wght-normal.woff2`, 'font-weight:300 700;'),
  face('IBM Plex Mono Proto', `${F}/fontsource-ibm-plex-mono-5.3.0/package/files/ibm-plex-mono-latin-400-normal.woff2`, 'font-weight:400;'),
  face('IBM Plex Mono Proto', `${F}/fontsource-ibm-plex-mono-5.3.0/package/files/ibm-plex-mono-latin-600-normal.woff2`, 'font-weight:600;'),
].join('\n');

/* the real bundled asset (ADR-0004), not a redrawing of it */
const logo = `data:image/svg+xml;base64,${b64(`${REPO}/assets/minidisc-logo.svg`)}`;

const html = readFileSync('./round10.src.html', 'utf8')
  .replace('/*FACES*/', faces)
  .replace(/__MDLOGO__/g, logo);
writeFileSync('./round10.html', html);
console.log('round3.html', (html.length / 1024).toFixed(0) + ' KB');
