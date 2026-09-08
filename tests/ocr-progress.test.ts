import { describe, expect, it } from 'vitest';
import { createOcrProgress, onlyChineseEvidence } from '../src/recognition/ocr';

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

  it('preserves known coin and network tokens in mixed Chinese lines', () => {
    expect(onlyChineseEvidence('充值 USDT\n网络 ARBI\n网络 Arbitrum One\n随机 ABC')).toBe('充值 USDT\n网络 ARBI\n网络 Arbitrum One');
  });
});
