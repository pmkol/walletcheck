import type { OCRClient, TextItem } from 'tesseract-wasm';
import type { RecognitionContext } from '../types';
import { inflateModel, loadModel } from './model';
import { findWrappedAddresses, readReflowedAddress, reflowAddressImage, replaceWrappedAddress } from './address-lines';
import type { AddressLine } from './address-lines';

const LANGUAGES = ['eng', 'chi_sim', 'chi_tra'] as const;
type Language = typeof LANGUAGES[number];
type OCRClientConstructor = new (init: { workerURL: string }) => OCRClient;

async function loadOcrClient(base: URL): Promise<OCRClientConstructor> {
  const module = await import(/* @vite-ignore */ new URL('tesseract-lib.js', base).href) as {
    OCRClient?: OCRClientConstructor;
  };
  if (!module.OCRClient) throw new Error('文字识别引擎初始化失败。请运行 npm run assets:ocr 更新整套引擎和模型，并检查浏览器扩展是否拦截资源。');
  return module.OCRClient;
}

function cropRegion(image: HTMLCanvasElement, top: number, bottom: number): HTMLCanvasElement {
  const sourceHeight = image.height * (bottom - top);
  const scale = Math.min(4, 2600 / Math.max(image.width, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('浏览器不支持 Canvas');
  drawing.fillStyle = '#fff';
  drawing.fillRect(0, 0, canvas.width, canvas.height);
  drawing.drawImage(image, 0, image.height * top, image.width, sourceHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function imageData(canvas: HTMLCanvasElement): ImageData {
  const drawing = canvas.getContext('2d', { willReadFrequently: true });
  if (!drawing) throw new Error('浏览器不支持 Canvas');
  return drawing.getImageData(0, 0, canvas.width, canvas.height);
}

function lineFromTextItem(item: TextItem): AddressLine {
  return {
    text: item.text,
    bbox: { x0: item.rect.left, y0: item.rect.top, x1: item.rect.right, y1: item.rect.bottom },
  };
}

function onlyChineseEvidence(text: string): string {
  return text.split(/\r?\n/).map((line) => {
    if (!/[\u3400-\u9fff]/.test(line)) return '';
    // Keep Chinese-only evidence and known Chinese aliases. Mixed-script lines
    // are discarded: a single misread Han glyph in an English field must not
    // turn a clear value into an unknown/ambiguous metadata value.
    const latinRemainder = line.replace(/[\u3400-\u9fff]/g, '').trim();
    if (latinRemainder && !/以太坊/.test(line)) return '';
    return line.trim();
  }).filter(Boolean).join('\n');
}

function progressValue(progress: number): number {
  return progress > 1 ? progress / 100 : progress;
}

function hasWrappedLines(text: string, lines: AddressLine[]): boolean {
  const expected = lines.map((line) => line.text.trim());
  const actual = text.split(/\r?\n/).map((line) => line.trim());
  return actual.some((line, index) => line === expected[0] && actual[index + 1] === expected[1]);
}

function asArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

export class OcrEngine {
  private clients = new Map<Language, OCRClient>();
  private context?: RecognitionContext;

  private async getClient(
    language: Language,
    base: URL,
    signal: AbortSignal,
    context: RecognitionContext,
    loading: AbortSignal,
  ): Promise<OCRClient> {
    const existing = this.clients.get(language);
    if (existing) return existing;
    context.onProgress('ocr-loading');
    const loadedModel = await loadModel(base, loading, language);
    const model = loadedModel[0] === 0x1f && loadedModel[1] === 0x8b
      ? await inflateModel(loadedModel, loading) : loadedModel;
    signal.throwIfAborted();
    const OCRClient = await loadOcrClient(base);
    const client = new OCRClient({ workerURL: new URL('tesseract-worker.js', base).href });
    try {
      await client.loadModel(asArrayBuffer(model));
    } catch (error) {
      await client.destroy();
      throw new Error(String(error).includes("文字识别")
        ? String(error) : '文字识别引擎初始化失败。请运行 npm run assets:ocr 更新整套引擎和模型，并检查浏览器扩展是否拦截资源。');
    }
    if (signal.aborted) {
      await client.destroy();
      signal.throwIfAborted();
    }
    this.clients.set(language, client);
    return client;
  }

  private async recognizeLines(
    client: OCRClient,
    canvas: HTMLCanvasElement,
    context: RecognitionContext,
  ): Promise<{ text: string; lines: AddressLine[] }> {
    await client.loadImage(imageData(canvas));
    try {
      const items = await client.getTextBoxes('line', (progress) => {
        if (!this.context?.signal.aborted) context.onProgress('ocr', progressValue(progress));
      });
      return { text: items.map((item) => item.text).join('\n'), lines: items.map(lineFromTextItem) };
    } finally {
      await client.clearImage();
    }
  }

  private async recognizeText(client: OCRClient, canvas: HTMLCanvasElement, context: RecognitionContext): Promise<string> {
    await client.loadImage(imageData(canvas));
    try {
      return await client.getText((progress) => {
        if (!this.context?.signal.aborted) context.onProgress('ocr', progressValue(progress));
      });
    } finally {
      await client.clearImage();
    }
  }

  async recognize(image: HTMLCanvasElement, context: RecognitionContext): Promise<string> {
    this.context = context;
    let terminated = false;
    const loading = new AbortController();
    let rejectAborted: (reason: unknown) => void = () => undefined;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAborted = reject; });
    const stop = (reason: unknown) => {
      if (terminated) return;
      terminated = true;
      loading.abort(reason);
      const clients = [...this.clients.values()];
      this.clients.clear();
      void Promise.all(clients.map((client) => client.destroy())).catch(() => undefined);
      rejectAborted(reason);
    };
    const abort = () => stop(context.signal.reason);
    context.signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => stop(new Error('文字识别超时，请检查模型部署或缩小图片后重试。')), 120_000);
    const work = async () => {
      context.signal.throwIfAborted();
      const base = new URL(context.assetBaseUrl.replace(/\/$/, '') + '/', document.baseURI);
      const english = await this.getClient('eng', base, context.signal, context, loading.signal);
      context.signal.throwIfAborted();
      const full = await this.recognizeLines(english, image, context);
      let text = full.text;
      const regions = [cropRegion(image, 0, 0.3), cropRegion(image, 0.45, 1)];
      const regionalTexts: string[] = [];
      try {
        for (const region of regions) {
          context.signal.throwIfAborted();
          regionalTexts.push(await this.recognizeText(english, region, context));
        }
      } finally {
        for (const region of regions) { region.width = 0; region.height = 0; }
      }
      // Replace wrapped addresses before appending regional OCR output. The
      // regional passes can repeat the same lines, while replacement requires
      // an unambiguous occurrence in the original line result.
      for (const group of findWrappedAddresses(full.lines).slice(0, 4)) {
        context.signal.throwIfAborted();
        const canvas = reflowAddressImage(image, group);
        try {
          const retryText = await this.recognizeText(english, canvas, context);
          let address = readReflowedAddress(retryText, group);
          // If the tightly cropped re-read is segmented into two lines, a
          // second independent regional pass can still confirm the exact
          // same pair without using QR contents to fill characters.
          if (!address && regionalTexts.some((regionalText) => hasWrappedLines(regionalText, group))) {
            address = readReflowedAddress(`${group[0].text}\n${group[1].text}`, group);
          }
          if (address) text = replaceWrappedAddress(text, group, address);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
      for (const regionalText of regionalTexts) text += `\n${regionalText}`;
      // tesseract-wasm loads one language model per worker. Chinese workers are
      // used as supplemental evidence while the English result remains the
      // source for address extraction and line geometry.
      for (const language of LANGUAGES.slice(1)) {
        context.signal.throwIfAborted();
        const client = await this.getClient(language, base, context.signal, context, loading.signal);
        const evidence = onlyChineseEvidence(await this.recognizeText(client, image, context));
        if (evidence) text += `\n${evidence}`;
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
    }
  }

  async dispose(): Promise<void> {
    const clients = [...this.clients.values()];
    this.clients.clear();
    await Promise.all(clients.map((client) => client.destroy()));
  }
}
