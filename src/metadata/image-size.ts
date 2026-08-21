/**
 * Pixel dimensions read straight out of an image's header. Cover art arrives
 * as bytes and an Artwork needs its size to be placed on a Part — doing that
 * from the header rather than from a decoder keeps the MetadataAdapter a plain
 * function of bytes, testable without a browser.
 *
 * The Cover Art Archive serves JPEG and PNG; anything else is reported as
 * unknown rather than guessed at.
 */

export interface ImageSize {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly mime: 'image/jpeg' | 'image/png';
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** JPEG frame markers that carry dimensions; the others are ignorable segments. */
const JPEG_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export function imageSize(bytes: Uint8Array): ImageSize | undefined {
  return pngSize(bytes) ?? jpegSize(bytes);
}

function readUint16(bytes: Uint8Array, offset: number): number | undefined {
  const high = bytes[offset];
  const low = bytes[offset + 1];
  return high === undefined || low === undefined ? undefined : (high << 8) | low;
}

function pngSize(bytes: Uint8Array): ImageSize | undefined {
  // Signature, then the IHDR chunk: 4-byte length, "IHDR", width, height.
  if (bytes.length < 24) return undefined;
  if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return undefined;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    widthPx: view.getUint32(16),
    heightPx: view.getUint32(20),
    mime: 'image/png',
  };
}

function jpegSize(bytes: Uint8Array): ImageSize | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;

  // Walk the segment chain to the first frame header, which holds the size.
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;

    const marker = bytes[offset + 1];
    if (marker === undefined) return undefined;
    // Padding between segments, and standalone markers that carry no length.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }

    const length = readUint16(bytes, offset + 2);
    if (length === undefined || length < 2) return undefined;

    if (JPEG_FRAME_MARKERS.has(marker)) {
      const heightPx = readUint16(bytes, offset + 5);
      const widthPx = readUint16(bytes, offset + 7);
      if (widthPx === undefined || heightPx === undefined) return undefined;
      return { widthPx, heightPx, mime: 'image/jpeg' };
    }
    offset += 2 + length;
  }
  return undefined;
}
