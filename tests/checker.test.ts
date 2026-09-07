import { describe, expect, it, vi } from 'vitest';
import { createWalletChecker } from '../src/checker';
import type { Recognition, Recognizer } from '../src/types';

const address = `0x${'a'.repeat(40)}`;
const recognition: Recognition = { qrPayloads: [address], text: `${address}\nCoin: USDT\nNetwork: Ethereum` };

describe('checker lifecycle', () => {
  it('normalizes configuration and does not expose an expected-address option', async () => {
    const recognizer: Recognizer = { recognize: vi.fn(async () => recognition), dispose: vi.fn(async () => undefined) };
    const checker = createWalletChecker({ coin: ' usdt ', network: 'ethereum', recognizer });
    expect(await checker.verify(new Blob())).toMatchObject({ status: 'matched', payload: { coin: 'USDT' } });
    await checker.dispose();
    await checker.dispose();
    expect(recognizer.dispose).toHaveBeenCalledTimes(1);
    await expect(checker.verify(new Blob())).rejects.toThrow('已销毁');
  });

  it('rejects invalid configuration', () => {
    expect(() => createWalletChecker({ coin: '', network: 'ethereum' })).toThrow();
    expect(() => createWalletChecker({ coin: 'A B', network: 'ethereum' })).toThrow();
  });

  it('cancels stale work and serializes recognizer calls', async () => {
    let finish: (result: Recognition) => void = () => undefined;
    let started: () => void = () => undefined;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const recognize = vi.fn<Recognizer['recognize']>()
      .mockImplementationOnce(() => { started(); return new Promise((resolve) => { finish = resolve; }); })
      .mockResolvedValue(recognition);
    const checker = createWalletChecker({ coin: 'USDT', network: 'ethereum', recognizer: { recognize, dispose: async () => undefined } });
    const first = checker.verify(new Blob());
    const firstExpectation = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await startedPromise;
    const second = checker.verify(new Blob());
    expect(recognize).toHaveBeenCalledTimes(1);
    finish(recognition);
    await firstExpectation;
    expect(await second).toMatchObject({ status: 'matched' });
    expect(recognize).toHaveBeenCalledTimes(2);
    await checker.dispose();
  });

  it('suppresses progress after cancellation', async () => {
    const progress = vi.fn();
    let release: () => void = () => undefined;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    let start: () => void = () => undefined;
    const started = new Promise<void>((resolve) => { start = resolve; });
    const checker = createWalletChecker({
      coin: 'USDT', network: 'ethereum', onProgress: progress,
      recognizer: { async recognize(_file, context) { start(); await wait; context.onProgress('ocr'); return recognition; }, async dispose() {} },
    });
    const result = checker.verify(new Blob());
    const expectation = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await started;
    checker.cancel();
    release();
    await expectation;
    expect(progress).not.toHaveBeenCalled();
    await checker.dispose();
  });
});
