import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { imageSize } from './image-size.ts';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const bytesOf = (name: string): Uint8Array => new Uint8Array(readFileSync(join(fixtures, name)));

/**
 * Cover art arrives from the Cover Art Archive as bytes, but an Artwork needs
 * its pixel dimensions to be placed on a Part. Reading them out of the file
 * header keeps the adapter usable without a browser to decode with.
 */
describe('reading image dimensions from bytes', () => {
  it('reads a JPEG', () => {
    expect(imageSize(bytesOf('cover-art-front.jpg'))).toEqual({
      widthPx: 500,
      heightPx: 500,
      mime: 'image/jpeg',
    });
  });

  it('reads a PNG', () => {
    expect(imageSize(bytesOf('cover-art-front.png'))).toEqual({
      widthPx: 240,
      heightPx: 320,
      mime: 'image/png',
    });
  });

  it('returns nothing for bytes that are not an image', () => {
    expect(imageSize(new TextEncoder().encode('<html>404</html>'))).toBeUndefined();
  });

  it('returns nothing for a truncated file rather than guessing', () => {
    expect(imageSize(bytesOf('cover-art-front.jpg').slice(0, 12))).toBeUndefined();
    expect(imageSize(bytesOf('cover-art-front.png').slice(0, 8))).toBeUndefined();
  });

  it('returns nothing for no bytes at all', () => {
    expect(imageSize(new Uint8Array())).toBeUndefined();
  });
});
