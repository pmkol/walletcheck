import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeModel, loadModel } from '../src/recognition/model';

const data = gzipSync('model-test-data');
const model = {
  format: 'walletcheck-ocr-model', version: 1, language: 'eng', encoding: 'base64+gzip',
  bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), data: data.toString('base64'),
};
const externalModel = {
  format: 'walletcheck-ocr-model', version: 2, language: 'eng', encoding: 'external+gzip',
  file: 'lang/eng-v1.traineddata', bytes: data.length,
  sha256: createHash('sha256').update(data).digest('hex'),
};
const base = new URL('http://localhost/walletcheck-assets/');

afterEach(() => vi.unstubAllGlobals());

describe('validated OCR model loading', () => {
  it('decodes the exact verified compressed model bytes', () => {
    expect(decodeModel(model)).toEqual(new Uint8Array(data));
  });

  it.each([
    null,
    { ...model, language: 'chi_sim' },
    { ...model, version: 2 },
    { ...model, data: 'invalid' },
    { ...model, bytes: -1 },
    { ...model, sha256: '0'.repeat(64) },
    { ...model, data: '!'.repeat(model.data.length) },
  ])('rejects malformed or corrupt model data %#', (value) => {
    expect(() => decodeModel(value)).toThrow('文字识别模型');
  });

  it('requests JSON instead of an archive and revalidates the HTTP cache', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(model), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    expect(await loadModel(base, signal)).toEqual(new Uint8Array(data));
    expect(fetch).toHaveBeenCalledWith(new URL('lang/eng-v1.json', base), {
      signal, headers: { Accept: 'application/json' }, cache: 'no-cache',
    });
  });

  it('loads and inflates an external gzip model after validating its manifest', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(externalModel), {
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(data, {
        headers: { 'Content-Type': 'application/octet-stream' },
      }));
    vi.stubGlobal('fetch', fetch);
    expect(await loadModel(base, new AbortController().signal)).toEqual(new TextEncoder().encode('model-test-data'));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(2, new URL(externalModel.file, base), {
      signal: expect.any(AbortSignal),
      headers: { Accept: 'application/gzip, application/octet-stream' },
      cache: 'no-cache',
    });
  });

  it.each([
    [new Response('Not found', { status: 404 }), 'HTTP 404'],
    [new Response('<html>fallback</html>', { headers: { 'Content-Type': 'text/html' } }), '响应不是 JSON'],
    [new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename=model.json' } }), '附件下载'],
    [new Response('{"data":', { headers: { 'Content-Type': 'application/json' } }), 'JSON 不完整'],
  ])('gives a specific resource error %#', async (response, message) => {
    vi.stubGlobal('fetch', vi.fn(async () => response));
    await expect(loadModel(base, new AbortController().signal)).rejects.toThrow(message);
  });

  it('preserves cancellation instead of displaying a network error', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn(async () => { throw controller.signal.reason; }));
    await expect(loadModel(base, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('explains resource blocking on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(loadModel(base, new AbortController().signal)).rejects.toThrow('下载器/浏览器扩展');
  });
});
