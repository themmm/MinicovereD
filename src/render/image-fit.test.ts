import { describe, expect, it } from 'vitest';

import { fitImage } from './image-fit.ts';

const SQUARE_BOX = { x: 0, y: 0, width: 100, height: 100 };

describe('fitting artwork into a Part', () => {
  it('crops a landscape image to the centre of a square box when covering', () => {
    const { source, dest } = fitImage({ widthPx: 600, heightPx: 400 }, SQUARE_BOX, 'cover');

    expect(source).toEqual({ x: 100, y: 0, width: 400, height: 400 });
    expect(dest).toEqual(SQUARE_BOX);
  });

  it('crops a portrait image to the centre of a square box when covering', () => {
    const { source } = fitImage({ widthPx: 400, heightPx: 600 }, SQUARE_BOX, 'cover');

    expect(source).toEqual({ x: 0, y: 100, width: 400, height: 400 });
  });

  it('uses the whole of a square image when covering a square box', () => {
    const { source } = fitImage({ widthPx: 500, heightPx: 500 }, SQUARE_BOX, 'cover');

    expect(source).toEqual({ x: 0, y: 0, width: 500, height: 500 });
  });

  it('fits the whole landscape image inside the box and centres it when containing', () => {
    const { source, dest } = fitImage({ widthPx: 600, heightPx: 400 }, SQUARE_BOX, 'contain');

    expect(source).toEqual({ x: 0, y: 0, width: 600, height: 400 });
    expect(dest.width).toBeCloseTo(100, 6);
    expect(dest.height).toBeCloseTo(66.6667, 3);
    expect(dest.y).toBeCloseTo(16.6667, 3);
  });
});
