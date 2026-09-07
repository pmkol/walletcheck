import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('OCR worker assets', () => {
  it('uses the tesseract-wasm worker entry point', () => {
    expect(readFileSync(new URL('../scripts/copy-ocr-assets.mjs', import.meta.url), 'utf8'))
      .toContain("tesseract-worker.js");
  });
});
