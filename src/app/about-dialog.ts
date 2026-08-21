import { ATTRIBUTIONS, DATA_SOURCES, licenseTextFor } from '../attribution/attributions.ts';
import type { Attribution, AttributionKind } from '../attribution/attributions.ts';
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

/** Lines that only render completely from the bundled fonts — the offline typography proof. */
const FONT_SPECIMEN: ReadonlyArray<{ script: string; sample: string; weight?: 'bold' }> = [
  { script: 'Latin', sample: 'Wichita Lineman — Glen Campbell' },
  { script: 'Umlauts', sample: 'Grüße aus Köln · Ærø · Łódź · Čačak' },
  { script: 'Accents', sample: 'Rêveries · Canción · Sinnöver · Ángel' },
  { script: 'Japanese', sample: '東京は夜の七時 · こんにちは · カタカナ' },
  { script: 'Bold', sample: 'Grüße · 東京 · Ángel', weight: 'bold' },
];

function fontSpecimen(): HTMLElement {
  const list = el('dl', { class: 'specimen' });
  for (const row of FONT_SPECIMEN) {
    list.appendChild(el('dt', { text: row.script }));
    list.appendChild(
      el('dd', {
        text: row.sample,
        ...(row.weight ? { attrs: { 'data-weight': row.weight } } : {}),
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
      el('h2', { text: 'About mdcovergen' }),
      el('button', {
        class: 'button',
        text: 'Close',
        on: { click: () => dialog.close() },
      }),
    ),
    el('p', {
      class: 'about__lede',
      text:
        'mdcovergen is MIT-licensed and runs entirely in your browser — no account, no server, ' +
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
