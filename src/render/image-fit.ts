import type { Rect } from '../domain/units.ts';

/** Where to take pixels from, and where to put them, when an image meets a box. */
export interface ImagePlacement {
  /** Source rectangle in image pixels. */
  readonly source: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Destination rectangle in the same units as `target`. */
  readonly dest: Rect;
}

/**
 * `cover` fills the box and crops what does not fit, centred — how cover art
 * sits on the Front Panel. `contain` fits the whole image inside the box and
 * centres the leftover space.
 */
export function fitImage(
  sourceSize: { readonly widthPx: number; readonly heightPx: number },
  target: Rect,
  fit: 'cover' | 'contain',
): ImagePlacement {
  const { widthPx, heightPx } = sourceSize;
  const sourceAspect = widthPx / heightPx;
  const targetAspect = target.width / target.height;

  if (fit === 'contain') {
    const scale = Math.min(target.width / widthPx, target.height / heightPx);
    const width = widthPx * scale;
    const height = heightPx * scale;
    return {
      source: { x: 0, y: 0, width: widthPx, height: heightPx },
      dest: {
        x: target.x + (target.width - width) / 2,
        y: target.y + (target.height - height) / 2,
        width,
        height,
      },
    };
  }

  const cropWidth = sourceAspect > targetAspect ? heightPx * targetAspect : widthPx;
  const cropHeight = sourceAspect > targetAspect ? heightPx : widthPx / targetAspect;
  return {
    source: {
      x: (widthPx - cropWidth) / 2,
      y: (heightPx - cropHeight) / 2,
      width: cropWidth,
      height: cropHeight,
    },
    dest: target,
  };
}
