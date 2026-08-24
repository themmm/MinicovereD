import { ATTRIBUTIONS, DATA_SOURCES, licenseTextFor } from '../attribution/attributions.ts';
import type { Attribution, AttributionKind } from '../attribution/attributions.ts';
import type { PrintFace } from '../render/sheet-renderer.ts';
import { el } from './dom.ts';

/**
 * The about/licenses dialog — the visible-attribution surface ADR-0003 requires.
 * Every bundled font and library is listed with version, copyright and the full
 * license text, all from the bundle so it also reads offline.
 */

const GROUPS: ReadonlyArray<{ kind: AttributionKind; title: string }> = [
  { kind: 'font', title: 'Bundled fonts' },
  { kind: 'library', title: 'Bundled libraries' },
  { kind: 'asset', title: 'Bundled assets' },
];

/**
 * Lines that only render completely from the bundled fonts — the offline
 * typography proof, and of every stack rather than one.
 *
 * The boundary is the point (ADR-0008 rule 9): the chrome is set in JetBrains
 * Mono and a Part is set in one of the print faces, and those are not the same
 * typeface on purpose. Showing only the chrome would prove the half that never
 * reaches paper.
 *
 * Each print face gets its own line, named by its voice and set in itself,
 * because that is the only thing here that can actually go wrong offline: a
 * face that failed to load renders in a fallback and still looks like type.
 *
 * Two of the lines are chosen for their characters rather than their voice. The
 * humanist one carries Ł, ź and Č, which are Latin-ext: the five voices ship
 * that subset themselves, so seeing those glyphs in Cabin rather than in Noto
 * is what says the second subset arrived. The Japanese and bold lines are the
 * opposite case — no voice ships CJK, so those prove the Noto fallback every
 * print stack ends with.
 */
const FONT_SPECIMEN: ReadonlyArray<{
  label: string;
  sample: string;
  weight?: 'bold';
  stack: 'chrome' | PrintFace;
}> = [
  // 73.5 × 79 is the assembled Insert, which is the box the Parts band captions.
  // A specimen line is still a sentence about this app, so it must not go on
  // quoting the 87.5 mm J-Card that ADR-0012 retired.
  { label: 'This app', sample: 'MinicovereD · 73.5 × 79 mm · A4 · 300 DPI', stack: 'chrome' },
  { label: 'Sans', sample: 'Wichita Lineman — Glen Campbell', stack: 'sans' },
  { label: 'Serif', sample: 'Rêveries · Canción · Ángel · Sinnöver', stack: 'serif' },
  { label: 'Slab', sample: 'Selected Ambient Works 85–92', stack: 'slab' },
  { label: 'Grotesque', sample: 'Lift Your Skinny Fists Like Antennas', stack: 'grotesque' },
  { label: 'Condensed', sample: 'Ascenseur pour l’échafaud · Şafak', stack: 'condensed' },
  { label: 'Humanist', sample: 'Grüße aus Köln · Ærø · Łódź · Čačak', stack: 'humanist' },
  { label: 'Japanese', sample: '東京は夜の七時 · こんにちは · カタカナ', stack: 'sans' },
  { label: 'Bold', sample: 'Grüße · 東京 · Ángel', weight: 'bold', stack: 'sans' },
];

function fontSpecimen(): HTMLElement {
  const list = el('dl', { class: 'specimen' });
  for (const row of FONT_SPECIMEN) {
    list.appendChild(el('dt', { text: row.label }));
    list.appendChild(
      el('dd', {
        text: row.sample,
        attrs: { 'data-stack': row.stack, ...(row.weight ? { 'data-weight': row.weight } : {}) },
      }),
    );
  }
  return list;
}

function creditEntry(attribution: Attribution): HTMLElement {
  return el(
    'div',
    { class: 'credit' },
    el(
      'div',
      { class: 'credit__head' },
      el('a', {
        class: 'credit__name',
        text: attribution.name,
        attrs: { href: attribution.url, target: '_blank', rel: 'noreferrer noopener' },
      }),
      el('span', { class: 'credit__version', text: attribution.version }),
      el('span', { class: 'credit__license', text: attribution.license }),
    ),
    el('p', { class: 'credit__copyright', text: attribution.copyright }),
    ...(attribution.note ? [el('p', { class: 'credit__note', text: attribution.note })] : []),
    el(
      'details',
      {},
      el('summary', { text: `${attribution.license} license text` }),
      el('pre', { class: 'credit__text', text: licenseTextFor(attribution.license) }),
    ),
  );
}

export function createAboutDialog(): HTMLDialogElement {
  const dialog = el('dialog', { class: 'about', attrs: { 'aria-label': 'About and licenses' } });

  const body = el(
    'div',
    { class: 'about__body' },
    el(
      'div',
      { class: 'about__head' },
      el('h2', { text: 'About MinicovereD' }),
      el('button', {
        class: 'button',
        text: 'Close',
        on: { click: () => dialog.close() },
      }),
    ),
    el('p', {
      class: 'about__lede',
      text:
        'MinicovereD is MIT-licensed and runs entirely in your browser — no account, no server, ' +
        'no data leaves this device. Everything it ships is free and open source:',
    }),
  );

  body.appendChild(el('h3', { class: 'about__group-title', text: 'Typography, offline' }));
  body.appendChild(fontSpecimen());

  for (const group of GROUPS) {
    // The single-file build registers no service worker (ADR-0002), so it does
    // not contain workbox. Crediting it there would credit code that is not in
    // the file the reader is holding.
    const entries = ATTRIBUTIONS.filter(
      (entry) => entry.kind === group.kind && !(entry.pwaOnly && __SELF_CONTAINED_BUILD__),
    );
    if (entries.length === 0) continue;
    body.appendChild(el('h3', { class: 'about__group-title', text: group.title }));
    for (const entry of entries) body.appendChild(creditEntry(entry));
  }

  body.appendChild(el('h3', { class: 'about__group-title', text: 'Data sources' }));
  for (const source of DATA_SOURCES) {
    body.appendChild(
      el(
        'div',
        { class: 'credit' },
        el(
          'div',
          { class: 'credit__head' },
          el('a', {
            class: 'credit__name',
            text: source.name,
            attrs: { href: source.url, target: '_blank', rel: 'noreferrer noopener' },
          }),
        ),
        el('p', { class: 'credit__copyright', text: source.terms }),
      ),
    );
  }

  dialog.appendChild(body);
  return dialog;
}
