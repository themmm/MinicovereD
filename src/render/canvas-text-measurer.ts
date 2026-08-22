import type { TextStyle } from './layout.ts';
import { fontFor } from './raster.ts';
import type { TextMeasurer } from './text.ts';

/**
 * The browser's answer to "how wide is this text", in millimetres. Measured at
 * a fixed high scale so rounding never shows up in the layout, and cached
 * because a tracklist asks the same question once per line per keystroke.
 */
const MEASURE_PX_PER_MM = 40;

export function createCanvasTextMeasurer(): TextMeasurer {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('minicovered: this browser has no 2D canvas context');

  const cache = new Map<string, number>();

  // A width measured before its face arrived is a width against the fallback,
  // and caching it would outlive the font load. Every face that finishes
  // loading invalidates what was measured without it.
  document.fonts.addEventListener('loadingdone', () => cache.clear());

  return {
    widthMm(text: string, style: TextStyle): number {
      const font = fontFor(style, MEASURE_PX_PER_MM);
      const key = `${font} ${text}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;

      context.font = font;
      const width = context.measureText(text).width / MEASURE_PX_PER_MM;
      cache.set(key, width);
      return width;
    },
  };
}

/**
 * The bundled faces and, for each, a character from every unicode-range subset
 * it ships as. One character per subset is what forces the browser to fetch
 * that subset; anything it is not asked for stays unloaded and silently falls
 * back to whatever the system has.
 *
 * Print faces only, and every one of them: this is the list a canvas measures
 * against, so a face a Template can select but that is missing here would be
 * laid out on the fallback's metrics and then drawn in itself. The chrome
 * joining this list would be a leak rather than an optimisation (ADR-0008
 * rule 9), and both halves are asserted in `print-quarantine.test.ts`.
 */
const BUNDLED_FACES: ReadonlyArray<{ family: string; sample: string }> = [
  {
    family: 'Noto Sans Variable',
    // latin · latin-ext · greek · greek-ext · cyrillic · cyrillic-ext · vietnamese · devanagari
    sample: 'Aä Łź α ᾰ Б Ԑ ế अ',
  },
  { family: 'Noto Sans JP', sample: '東' },
  // The five voices, Latin and Latin-ext only — the two subsets each is
  // declared with in `fonts.css`, so two characters fetch the whole of each.
  { family: 'Source Serif 4 Variable', sample: 'Aä Łź' },
  { family: 'Bitter Variable', sample: 'Aä Łź' },
  { family: 'Space Grotesk Variable', sample: 'Aä Łź' },
  { family: 'Archivo Narrow Variable', sample: 'Aä Łź' },
  { family: 'Cabin Variable', sample: 'Aä Łź' },
];

/**
 * Bundled fonts load asynchronously even though they never touch the network,
 * and a face with a unicode-range is not loaded at all until text in that range
 * is rendered. `document.fonts.ready` alone therefore resolves with the CJK
 * face still absent, and both measuring and drawing silently fall through to
 * whatever the system happens to have — tofu, on a machine with no CJK font.
 * Asking for each face by name is what actually fetches it.
 */
export async function fontsReady(): Promise<void> {
  await Promise.all(
    BUNDLED_FACES.map(async ({ family, sample }) => {
      try {
        await document.fonts.load(`400 16px "${family}"`, sample);
        await document.fonts.load(`700 16px "${family}"`, sample);
      } catch {
        // A face that will not load is a fallback, not a failure: the app still
        // renders, just not in the typography it shipped with.
      }
    }),
  );
  await document.fonts.ready;
}

/**
 * Runs `listener` whenever a font finishes loading. A subset that arrives after
 * the first render leaves the layout sized against a fallback face, so the
 * caller has to draw again — clearing the measurement cache alone only fixes
 * the *next* render.
 */
export function onFontsLoaded(listener: () => void): void {
  document.fonts.addEventListener('loadingdone', listener);
}
