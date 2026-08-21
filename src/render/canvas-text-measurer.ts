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
 * Bundled fonts load asynchronously even though they never touch the network.
 * Measuring before they are ready would size the layout to a fallback face.
 */
export async function fontsReady(): Promise<void> {
  await document.fonts.ready;
}
