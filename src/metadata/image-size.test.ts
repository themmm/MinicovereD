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

  it('rejects a header claiming zero pixels, which would divide by zero later', () => {
    const zeroSized = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 0, 0, 0,
      0, 0,
    ]);

    expect(imageSize(zeroSized)).toBeUndefined();
  });

  it('walks past 0xFF padding between JPEG segments', () => {
    const padded = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xff, 0xff, 0xff, 0xc0, 0, 17, 8, 1, 44, 2, 88, 3, 1, 0x11, 0, 2, 0x11, 1,
      3, 0x11, 1,
    ]);

    expect(imageSize(padded)).toEqual({ widthPx: 600, heightPx: 300, mime: 'image/jpeg' });
  });

  it('gives up rather than looping on a malformed segment chain', () => {
    const overrun = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 1, 2, 3, 4, 5, 6, 7, 8]);
    const zeroLength = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xc0, 0, 17, 8, 1, 44, 2, 88]);

    expect(imageSize(overrun)).toBeUndefined();
    expect(imageSize(zeroLength)).toBeUndefined();
  });
});
