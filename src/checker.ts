import { isNetwork } from './networks';
import { evaluateRecognition } from './verification';
import type { CheckerOptions, Recognizer, VerificationResult } from './types';

export function createWalletChecker(input: CheckerOptions) {
  if (!isNetwork(input.network)) throw new Error('不支持的网络');
  const coin = input.coin.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(coin)) throw new Error('币种标识不合法');
  const options = { ...input, coin };
  let recognizer: Recognizer | undefined = input.recognizer;
  let controller: AbortController | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let disposed = false;
  let disposal: Promise<void> | undefined;

  return {
    verify(file: Blob): Promise<VerificationResult> {
      if (disposed) return Promise.reject(new Error('组件已销毁'));
      controller?.abort();
      const task = new AbortController();
      controller = task;
      const result = queue.catch(() => undefined).then(async () => {
        task.signal.throwIfAborted();
        if (!recognizer) {
          const { BrowserRecognizer } = await import('./recognition/browser');
          task.signal.throwIfAborted();
          recognizer = new BrowserRecognizer();
        }
        const recognition = await recognizer.recognize(file, {
          signal: task.signal,
          assetBaseUrl: options.assetBaseUrl ?? '/walletcheck-assets',
          onProgress(stage, progress) {
            if (!task.signal.aborted) options.onProgress?.(stage, progress);
          },
        });
        task.signal.throwIfAborted();
        return evaluateRecognition(recognition, options);
      });
      queue = result;
      return result;
    },
    cancel() {
      controller?.abort();
    },
    dispose(): Promise<void> {
      if (!disposal) {
        disposed = true;
        controller?.abort();
        disposal = queue.catch(() => undefined).then(async () => { await recognizer?.dispose(); });
      }
      return disposal;
    },
  };
}

export type WalletChecker = ReturnType<typeof createWalletChecker>;
