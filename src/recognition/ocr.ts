import { createWorker, OEM, PSM } from 'tesseract.js';
import type { Worker } from 'tesseract.js';
import type { RecognitionContext } from '../types';
import { loadModel } from './model';
import { findWrappedAddresses, readReflowedAddress, reflowAddressImage } from './address-lines';

export class OcrEngine {
  private worker?: Worker;
  private context?: RecognitionContext;
  private reportError?: (error: unknown) => void;

  async recognize(image: HTMLCanvasElement, context: RecognitionContext): Promise<string> {
    this.context = context;
    let terminated = false;
    let terminationReason: unknown;
    const loading = new AbortController();
    let rejectAborted: (reason: unknown) => void = () => undefined;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAborted = reject; });
    const stop = (reason: unknown) => {
      if (terminated) return;
      terminated = true;
      terminationReason = reason;
      loading.abort(reason);
      const worker = this.worker;
      this.worker = undefined;
      void worker?.terminate().catch(() => undefined);
      rejectAborted(reason);
    };
    this.reportError = (error) => stop(new Error(String(error).includes('initialization failed')
      ? '文字识别引擎初始化失败。请运行 npm run assets:ocr 更新整套引擎和模型，并检查浏览器扩展是否拦截资源。'
      : `文字识别引擎错误：${String(error)}`));
    const abort = () => stop(context.signal.reason);
    context.signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => stop(new Error('文字识别超时，请检查模型部署或缩小图片后重试。')), 120_000);
    const work = async () => {
      context.signal.throwIfAborted();
      if (!this.worker) {
        context.onProgress('ocr-loading');
        const base = new URL(context.assetBaseUrl.replace(/\/$/, '') + '/', document.baseURI);
        const data = await loadModel(base, loading.signal);
        if (terminated) throw terminationReason;
        context.signal.throwIfAborted();
        const worker = await createWorker([{ code: 'eng', data }], OEM.LSTM_ONLY, {
          workerPath: new URL('worker-loader.js', base).href,
          corePath: new URL('core/', base).href,
          cacheMethod: 'none',
          workerBlobURL: false,
          logger: (message) => {
            if (!terminated && !this.context?.signal.aborted) {
              this.context?.onProgress(message.status === 'recognizing text' ? 'ocr' : 'ocr-loading', message.progress);
            }
          },
          errorHandler: (error: unknown) => { if (!terminated) this.reportError?.(error); },
        });
        if (terminated) { await worker.terminate(); throw terminationReason; }
        this.worker = worker;
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          preserve_interword_spaces: '1',
        });
      }
      context.signal.throwIfAborted();
      context.onProgress('ocr');
      const worker = this.worker;
      const result = await worker.recognize(image, {}, { text: true, blocks: true });
      context.signal.throwIfAborted();
      let text = result.data.text;
      const lines = result.data.blocks?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)) ?? [];
      for (const group of findWrappedAddresses(lines).slice(0, 4)) {
        context.signal.throwIfAborted();
        const canvas = reflowAddressImage(image, group);
        try {
          await worker.setParameters({ tessedit_pageseg_mode: PSM.RAW_LINE });
          const retry = await worker.recognize(canvas);
          context.signal.throwIfAborted();
          let address = readReflowedAddress(retry.data.text, group);
          if (!address) {
            await worker.setParameters({
              tessedit_pageseg_mode: PSM.RAW_LINE,
              tessedit_char_whitelist: '0123456789abcdefABCDEFx',
            });
            const constrained = await worker.recognize(canvas);
            context.signal.throwIfAborted();
            address = readReflowedAddress(constrained.data.text, group);
          }
          if (address) {
            const pattern = group.map((line) => line.text.trim()).join('\\s+');
            text = text.replace(new RegExp(pattern), address);
          }
        } finally {
          canvas.width = 0;
          canvas.height = 0;
          if (!terminated) await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, tessedit_char_whitelist: '' });
        }
      }
      return text;
    };
    try {
      return await Promise.race([work(), aborted]);
    } catch (error) {
      await this.dispose();
      throw error;
    } finally {
      clearTimeout(timeout);
      context.signal.removeEventListener('abort', abort);
      this.context = undefined;
      this.reportError = undefined;
    }
  }

  async dispose(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    await worker?.terminate();
  }
}
