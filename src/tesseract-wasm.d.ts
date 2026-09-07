declare module 'tesseract-wasm' {
  export interface TextItem {
    rect: { left: number; top: number; right: number; bottom: number };
    flags: number;
    confidence: number;
    text: string;
  }

  export interface OCRClientInit {
    createWorker?: (url: string) => Worker;
    wasmBinary?: Uint8Array | ArrayBuffer;
    workerURL?: string;
  }

  export class OCRClient {
    constructor(init?: OCRClientInit);
    destroy(): Promise<void>;
    loadModel(model: string | ArrayBuffer): Promise<void>;
    loadImage(image: ImageBitmap | ImageData): Promise<void>;
    clearImage(): Promise<void>;
    getTextBoxes(unit: 'line' | 'word', onProgress?: (progress: number) => void): Promise<TextItem[]>;
    getText(onProgress?: (progress: number) => void): Promise<string>;
  }
}
