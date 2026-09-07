import type { Recognition, RecognitionContext, Recognizer } from '../types';
import type { OcrEngine } from './ocr';
import { prepareOcrImage } from './preprocess';
import { MAX_FILE_BYTES } from '../image-limits';

const MAX_PIXELS = 24_000_000;
const MAX_EDGE = 3200;

export class BrowserRecognizer implements Recognizer {
  private ocr?: OcrEngine;

  async recognize(file: Blob, context: RecognitionContext): Promise<Recognition> {
    context.signal.throwIfAborted();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      throw new Error('请上传 PNG、JPEG 或 WebP 图片');
    }
    if (!file.size || file.size > MAX_FILE_BYTES) throw new Error('图片不能为空，且不能超过 5 MB');
    context.onProgress('preparing');
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    let canvas: HTMLCanvasElement | undefined;
    let ocrCanvas: HTMLCanvasElement | undefined;
    try {
      context.signal.throwIfAborted();
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS) {
        throw new Error('图片像素不能超过 2400 万，请先裁剪或缩小');
      }
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const drawing = canvas.getContext('2d');
      if (!drawing) throw new Error('浏览器不支持 Canvas');
      drawing.fillStyle = '#ffffff';
      drawing.fillRect(0, 0, canvas.width, canvas.height);
      drawing.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      context.onProgress('qr');
      const { scanQr } = await import('./qr');
      context.signal.throwIfAborted();
      const qrPayloads = await scanQr(canvas, context.signal);
      context.signal.throwIfAborted();
      if (!this.ocr) {
        context.onProgress('ocr-loading');
        const { OcrEngine } = await import('./ocr');
        context.signal.throwIfAborted();
        this.ocr = new OcrEngine();
      }
      ocrCanvas = prepareOcrImage(canvas);
      context.signal.throwIfAborted();
      const text = await this.ocr.recognize(ocrCanvas, context);
      return { qrPayloads, text };
    } finally {
      bitmap.close();
      if (ocrCanvas && ocrCanvas !== canvas) { ocrCanvas.width = 0; ocrCanvas.height = 0; }
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
  }

  async dispose(): Promise<void> {
    await this.ocr?.dispose();
    this.ocr = undefined;
  }
}
