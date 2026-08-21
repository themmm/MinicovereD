import { ATTRIBUTIONS, licenseTextFor } from '../attribution/attributions.ts';
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
];

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

  for (const group of GROUPS) {
    const entries = ATTRIBUTIONS.filter((entry) => entry.kind === group.kind);
    if (entries.length === 0) continue;
    body.appendChild(el('h3', { class: 'about__group-title', text: group.title }));
    for (const entry of entries) body.appendChild(creditEntry(entry));
  }

  dialog.appendChild(body);
  return dialog;
}
