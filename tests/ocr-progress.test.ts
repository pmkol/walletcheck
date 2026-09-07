import { describe, expect, it } from 'vitest';
import { createOcrProgress } from '../src/recognition/ocr';

describe('OCR progress aggregation', () => {
  it('keeps progress monotonic across independent passes and formats', () => {
    const values: number[] = [];
    const progress = createOcrProgress((value) => values.push(value));

    progress.report(80);
    progress.report(0.2);
    progress.complete();
    progress.skip(2);
    for (let index = 0; index < 6; index += 1) progress.complete();

    expect(values.length).toBeGreaterThan(0);
    expect(values.every((value, index) => index === 0 || value >= values[index - 1])).toBe(true);
    expect(values.at(-1)).toBe(1);
  });
});
