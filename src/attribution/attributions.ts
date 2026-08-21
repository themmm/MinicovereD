import mit from './licenses/MIT.txt?raw';
import ofl from './licenses/OFL-1.1.txt?raw';
import zeroBsd from './licenses/0BSD.txt?raw';
import zlib from './licenses/Zlib.txt?raw';

/**
 * ADR-0003: everything that ships must be free/open source under a permissive
 * license, and the licenses must be honored with visible attribution. This
 * module is that attribution — the data behind the about/licenses dialog, and
 * the thing the compliance tests check.
 */

/**
 * The licenses mdcovergen is allowed to ship under. An id may only appear here
 * once its text is bundled, so the dialog can always show it offline.
 */
export const PERMISSIVE_LICENSES = ['MIT', 'MIT AND Zlib', 'OFL-1.1', '0BSD'] as const;

export type LicenseId = (typeof PERMISSIVE_LICENSES)[number];

export type AttributionKind = 'font' | 'library';

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
}

const LICENSE_TEXTS: Readonly<Record<string, string>> = {
  MIT: mit,
  'OFL-1.1': ofl,
  '0BSD': zeroBsd,
  Zlib: zlib,
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
      if (!text) throw new Error(`mdcovergen: no bundled license text for "${id}"`);
      return text;
    })
    .join('\n\n');
}

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
];
