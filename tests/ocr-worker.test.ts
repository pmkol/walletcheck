import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const bootstrap = readFileSync(new URL('../scripts/ocr-worker-bootstrap.js', import.meta.url), 'utf8');

function createListener() {
  const addEventListener = vi.fn();
  const importScripts = vi.fn();
  runInNewContext(bootstrap, { self: { addEventListener }, importScripts });
  expect(importScripts).toHaveBeenCalledWith('./worker.min.js');
  return addEventListener.mock.calls[0][1] as (event: { data: unknown }) => void;
}

describe('OCR worker initialization compatibility', () => {
  it('uses language codes, not model bytes, when initializing the engine', () => {
    const listener = createListener();
    const message = { action: 'initialize', payload: { langs: [{ code: 'eng', data: new Uint8Array([1, 2]) }] } };
    listener({ data: message });
    expect(message.payload.langs).toBe('eng');
  });

  it('leaves actual language data untouched during model loading', () => {
    const listener = createListener();
    const langs = [{ code: 'eng', data: new Uint8Array([1, 2]) }];
    const message = { action: 'loadLanguage', payload: { langs } };
    listener({ data: message });
    expect(message.payload.langs).toBe(langs);
  });

  it('preserves string language codes', () => {
    const listener = createListener();
    const message = { action: 'initialize', payload: { langs: 'eng' } };
    listener({ data: message });
    expect(message.payload.langs).toBe('eng');
  });
});
