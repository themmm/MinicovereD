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
  if (!context) throw new Error('mdcovergen: this browser has no 2D canvas context');

  const cache = new Map<string, number>();

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
 * The bundled faces and a character from each, chosen so the browser is forced
 * to fetch the face rather than deciding it is not needed yet.
 */
const BUNDLED_FACES: ReadonlyArray<{ family: string; sample: string }> = [
  { family: 'Noto Sans Variable', sample: 'Aä' },
  { family: 'Noto Sans JP', sample: '東' },
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

/** Which bundled faces are actually loaded — the about dialog says so honestly. */
export function loadedBundledFaces(): readonly string[] {
  return BUNDLED_FACES.map(({ family }) => family).filter((family) =>
    [...document.fonts].some((face) => face.family === family && face.status === 'loaded'),
  );
}
