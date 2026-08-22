import isc from './licenses/ISC.txt?raw';
import mit from './licenses/MIT.txt?raw';
import ofl from './licenses/OFL-1.1.txt?raw';
import zeroBsd from './licenses/0BSD.txt?raw';
import zlib from './licenses/Zlib.txt?raw';
import publicDomainTextLogo from './licenses/PD-textlogo.txt?raw';

/**
 * ADR-0003: everything that ships must be free/open source under a permissive
 * license, and the licenses must be honored with visible attribution. This
 * module is that attribution — the data behind the about/licenses dialog, and
 * the thing the compliance tests check.
 */

/**
 * The licenses MinicovereD is allowed to ship under. SPDX ids, plus SPDX's own
 * `LicenseRef-` form for terms that have no id — the MiniDisc mark is public
 * domain for copyright purposes but is nobody's standard license. An id may
 * only appear here once its text is bundled, so the dialog can always show it
 * offline.
 */
export const PERMISSIVE_LICENSES = [
  'MIT',
  'MIT AND Zlib',
  // Not plain ISC: the one Lucide glyph this project uses is `search`, which
  // Lucide's own licence lists among the icons derived from Feather and
  // relicensed MIT. Both notices apply to it, so both are shown. Plain `ISC`
  // is deliberately absent until something actually ships under it alone.
  'ISC AND MIT',
  'OFL-1.1',
  '0BSD',
  'LicenseRef-PD-textlogo',
] as const;

export type LicenseId = (typeof PERMISSIVE_LICENSES)[number];

export type AttributionKind = 'font' | 'library' | 'asset';

export interface Attribution {
  /** Human-readable name, as shown in the dialog. */
  readonly name: string;
  readonly kind: AttributionKind;
  readonly version: string;
  readonly license: LicenseId;
  readonly copyright: string;
  readonly url: string;
  /** The npm package this entry covers, when it covers one. */
  readonly packageName?: string;
  /**
   * Repo-relative files this entry covers, for anything that is not an npm
   * package. The completeness check reads these, so an asset added to the
   * build without a line here fails the suite rather than shipping unexamined.
   */
  readonly files?: readonly string[];
  /**
   * Set when the entry ships in the hosted PWA only. The single-file build
   * registers no service worker (ADR-0002), so crediting workbox there would
   * credit code that is not in the file the reader is holding.
   */
  readonly pwaOnly?: true;
  /** Anything a reader needs to know beyond the license — a trademark, say. */
  readonly note?: string;
}

/**
 * Files that ship and that this project drew itself.
 *
 * Nobody has to be credited for them, but they still have to be *accounted
 * for*: ADR-0003 is a promise about everything that reaches a user, and the
 * only way to keep it is for every shipped file to be either attributed or
 * claimed. Adding an icon without adding it here fails the compliance test.
 */
export const OWN_ARTWORK: readonly string[] = [
  'assets/logo.svg',
  'public/icons/icon-192.png',
  'public/icons/icon-512.png',
  'public/icons/icon-maskable-512.png',
];

const LICENSE_TEXTS: Readonly<Record<string, string>> = {
  MIT: mit,
  ISC: isc,
  'OFL-1.1': ofl,
  '0BSD': zeroBsd,
  Zlib: zlib,
  'LicenseRef-PD-textlogo': publicDomainTextLogo,
};

/**
 * The full license text to show, offline. Composite SPDX expressions such as
 * `MIT AND Zlib` render every license they name. Throws rather than showing an
 * empty license block, which would be worse than no dialog at all.
 */
export function licenseTextFor(license: LicenseId): string {
  return license
    .split(' AND ')
    .map((id) => {
      const text = LICENSE_TEXTS[id];
      if (!text) throw new Error(`minicovered: no bundled license text for "${id}"`);
      return text;
    })
    .join('\n\n');
}

/**
 * Services the app fetches from at runtime. Not bundled, so not covered by the
 * package attribution above — but both ask to be credited, and a collector
 * deserves to know where the metadata on their Sheet came from.
 */
export interface DataSource {
  readonly name: string;
  readonly url: string;
  readonly terms: string;
}

export const DATA_SOURCES: readonly DataSource[] = [
  {
    name: 'MusicBrainz',
    url: 'https://musicbrainz.org',
    terms:
      'Release metadata and tracklists. MusicBrainz core data is in the public domain (CC0); ' +
      'MinicovereD keeps to the one-request-per-second rate limit (ADR-0006).',
  },
  {
    name: 'Cover Art Archive',
    url: 'https://coverartarchive.org',
    terms:
      'Cover art, fetched only for Releases you look up. The images belong to their respective ' +
      'copyright holders — MinicovereD neither redistributes nor bundles any of them.',
  },
];

/**
 * The workbox modules that reach the browser in the hosted build: two in the
 * page (`workbox-window`, which pulls `workbox-core` in with it) and four in
 * the generated service worker.
 */
export const WORKBOX_MODULES = [
  'workbox-window',
  'workbox-core',
  'workbox-precaching',
  'workbox-routing',
  'workbox-strategies',
] as const;

const WORKBOX_VERSION = '7.4.1';

export const ATTRIBUTIONS: readonly Attribution[] = [
  {
    name: 'Noto Sans',
    kind: 'font',
    version: '5.3.0',
    license: 'OFL-1.1',
    copyright: 'Copyright 2022 The Noto Project Authors',
    url: 'https://fontsource.org/fonts/noto-sans',
    packageName: '@fontsource-variable/noto-sans',
  },
  {
    name: 'Noto Sans JP',
    kind: 'font',
    version: '5.3.0',
    license: 'OFL-1.1',
    copyright: 'Copyright Google Inc.',
    url: 'https://fontsource.org/fonts/noto-sans-jp',
    packageName: '@fontsource/noto-sans-jp',
  },
  {
    name: 'JetBrains Mono',
    kind: 'font',
    version: '5.3.0',
    license: 'OFL-1.1',
    copyright: 'Copyright 2020 The JetBrains Mono Project Authors',
    url: 'https://fontsource.org/fonts/jetbrains-mono',
    packageName: '@fontsource-variable/jetbrains-mono',
    note:
      'The app surface only, never a Part (ADR-0008). Latin and Latin-ext, roman, one variable ' +
      'weight axis — the two subsets the chrome needs, out of the six the package ships.',
  },
  {
    name: 'Lucide',
    kind: 'asset',
    version: '1.33.0',
    license: 'ISC AND MIT',
    copyright:
      'Copyright (c) 2026 Lucide Icons and Contributors; the `search` glyph ' +
      'derives from Feather, Copyright (c) 2013-present Cole Bemis',
    url: 'https://lucide.dev',
    note:
      'A source of geometry, not a dependency (ADR-0008): the glyphs used are redrawn as inline ' +
      'SVG, so nothing of Lucide ships as a file and there is no runtime library. Using a set ' +
      'rather than drawing six icons is what keeps stroke weight, grid and terminals consistent.',
  },
  {
    name: 'Everforest',
    kind: 'asset',
    version: 'palette.md, 2019',
    license: 'MIT',
    copyright: 'Copyright (c) 2019 sainnhe',
    url: 'https://github.com/sainnhe/everforest',
    note:
      'The chrome palette (ADR-0008). A colour scheme rather than a file: the sixteen values end ' +
      'up as tokens in app.css, so nothing of it ships separately and there is nothing for the ' +
      'completeness check to find. Credited anyway, because the choice was somebody else’s work.',
  },
  {
    name: 'MiniDisc logo',
    kind: 'asset',
    version: 'Commons revision',
    license: 'LicenseRef-PD-textlogo',
    copyright: 'Sony Corporation',
    url: 'https://commons.wikimedia.org/wiki/File:MiniDisc-Logo.svg',
    files: ['assets/minidisc-logo.svg'],
    note:
      'MiniDisc is a trademark of Sony. The mark is below the threshold of originality for ' +
      'copyright and is bundled as an optional asset that any design can switch off (ADR-0004).',
  },
  {
    name: 'pdf-lib',
    kind: 'library',
    version: '1.17.1',
    license: 'MIT',
    copyright: 'Copyright (c) 2019 Andrew Dillon',
    url: 'https://pdf-lib.js.org',
    packageName: 'pdf-lib',
  },
  {
    name: '@pdf-lib/standard-fonts',
    kind: 'library',
    version: '1.0.0',
    license: 'MIT',
    copyright: 'Copyright (c) 2018 Andrew Dillon',
    url: 'https://github.com/Hopding/standard-fonts',
    packageName: '@pdf-lib/standard-fonts',
  },
  {
    name: '@pdf-lib/upng',
    kind: 'library',
    version: '1.0.1',
    license: 'MIT',
    copyright: 'Copyright (c) 2017 Photopea',
    url: 'https://github.com/Hopding/upng',
    packageName: '@pdf-lib/upng',
  },
  {
    name: 'pako',
    kind: 'library',
    version: '1.0.11',
    license: 'MIT AND Zlib',
    copyright: 'Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn',
    url: 'https://github.com/nodeca/pako',
    packageName: 'pako',
  },
  // Not dependencies of this project — vite-plugin-pwa compiles workbox into
  // the page to register the service worker, and workbox-build generates the
  // service worker itself out of the other four. All of it ships, so all of it
  // is attributed; ADR-0003 is about what reaches the user, not about which
  // section of package.json a name sits in. The set is not guesswork: each of
  // these stamps its own name into the built files, and the compliance test
  // reads those stamps back.
  ...WORKBOX_MODULES.map(
    (packageName): Attribution => ({
      name: packageName,
      kind: 'library',
      version: WORKBOX_VERSION,
      license: 'MIT',
      copyright: 'Copyright 2018 Google LLC',
      url: 'https://github.com/GoogleChrome/workbox',
      packageName,
      pwaOnly: true,
    }),
  ),
  {
    name: 'tslib',
    kind: 'library',
    version: '1.14.1',
    license: '0BSD',
    copyright: 'Copyright (c) Microsoft Corporation',
    url: 'https://www.typescriptlang.org/',
    packageName: 'tslib',
  },
];
