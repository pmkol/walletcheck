import { afterEach, expect, it, vi } from 'vitest';
import { BrowserRecognizer } from '../src/recognition/browser';
import { MAX_FILE_BYTES } from '../src/image-limits';

afterEach(() => vi.unstubAllGlobals());

it('rejects files above 5 MB before decoding, but accepts the exact size boundary', async () => {
  const decode = vi.fn().mockRejectedValue(new Error('decode reached'));
  vi.stubGlobal('createImageBitmap', decode);
  const recognizer = new BrowserRecognizer();
  const context = { signal: new AbortController().signal, assetBaseUrl: '', onProgress: vi.fn() };
  expect(MAX_FILE_BYTES).toBe(5 * 1024 * 1024);
  await expect(recognizer.recognize(new Blob([new Uint8Array(MAX_FILE_BYTES + 1)], { type: 'image/png' }), context)).rejects.toThrow('5 MB');
  expect(decode).not.toHaveBeenCalled();
  await expect(recognizer.recognize(new Blob([new Uint8Array(MAX_FILE_BYTES)], { type: 'image/png' }), context)).rejects.toThrow('decode reached');
  expect(decode).toHaveBeenCalledOnce();
});
