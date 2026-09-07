import { describe, expect, it } from 'vitest';
import { hasDarkBackground } from '../src/recognition/preprocess';

function pixels(luminance: number): Uint8ClampedArray {
  const result = new Uint8ClampedArray(32 * 32 * 4);
  for (let offset = 0; offset < result.length; offset += 4) {
    result.set([luminance, luminance, luminance, 255], offset);
  }
  return result;
}

describe('OCR background detection', () => {
  it('recognizes dark screenshots for grayscale inversion', () => {
    expect(hasDarkBackground(pixels(0), 32, 32)).toBe(true);
    expect(hasDarkBackground(pixels(40), 32, 32)).toBe(true);
  });

  it('leaves light screenshots unchanged', () => {
    expect(hasDarkBackground(pixels(255), 32, 32)).toBe(false);
    expect(hasDarkBackground(pixels(150), 32, 32)).toBe(false);
  });

  it('does not classify a large dark QR on a white background as a dark theme', () => {
    const image = pixels(255);
    for (let row = 2; row < 30; row += 1) {
      for (let column = 2; column < 30; column += 1) {
        image.set([0, 0, 0, 255], (row * 32 + column) * 4);
      }
    }
    expect(hasDarkBackground(image, 32, 32)).toBe(false);
  });

  it('does not invert a light image just because it has a dark border', () => {
    const image = pixels(0);
    for (let row = 2; row < 30; row += 1) {
      for (let column = 2; column < 30; column += 1) {
        image.set([255, 255, 255, 255], (row * 32 + column) * 4);
      }
    }
    expect(hasDarkBackground(image, 32, 32)).toBe(false);
  });
});
