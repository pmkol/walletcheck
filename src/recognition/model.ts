import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const MODEL_FILE = 'lang/eng-v1.json';
const MAX_MODEL_BYTES = 48 * 1024 * 1024;
const REPAIR_HINT = '请运行 npm run assets:ocr，检查 asset-base-url 和静态资源部署后重试。';

function modelError(message: string): Error {
  return new Error(`${message}${REPAIR_HINT}`);
}

function validateCommonModel(model: Record<string, unknown>, language: string): void {
  if (model.format !== 'walletcheck-ocr-model' || model.language !== language
    || typeof model.bytes !== 'number' || !Number.isInteger(model.bytes)
    || model.bytes < 2 || model.bytes > MAX_MODEL_BYTES
    || typeof model.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(model.sha256)) {
    throw modelError('文字识别模型格式不正确或文件不完整。');
  }
}

/** Decode the version 1 inline model format for existing deployments. */
export function decodeModel(value: unknown, language = 'eng'): Uint8Array {
  if (!value || typeof value !== 'object') throw modelError('文字识别模型格式不正确。');
  const model = value as Record<string, unknown>;
  validateCommonModel(model, language);
  if (model.version !== 1 || model.encoding !== 'base64+gzip' || typeof model.data !== 'string'
    || model.data.length !== 4 * Math.ceil(model.bytes as number / 3)) {
    throw modelError('文字识别模型格式不正确或文件不完整。');
  }
  let binary: string;
  try { binary = atob(model.data); }
  catch { throw modelError('文字识别模型编码损坏。'); }
  const data = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (data.length !== model.bytes || data[0] !== 0x1f || data[1] !== 0x8b
    || bytesToHex(sha256(data)) !== model.sha256) {
    throw modelError('文字识别模型完整性校验失败，资源可能损坏或被拦截。');
  }
  return data;
}

function decodeExternalModel(value: unknown, data: Uint8Array, language: string): Uint8Array {
  if (!value || typeof value !== 'object') throw modelError('文字识别模型格式不正确。');
  const model = value as Record<string, unknown>;
  validateCommonModel(model, language);
  if (model.version !== 2 || model.encoding !== 'external+gzip'
    || model.file !== `lang/${language}-v1.traineddata`) {
    throw modelError('文字识别模型格式不正确或文件不完整。');
  }
  if (data.length !== model.bytes || data[0] !== 0x1f || data[1] !== 0x8b
    || bytesToHex(sha256(data)) !== model.sha256) {
    throw modelError('文字识别模型完整性校验失败，资源可能损坏或被拦截。');
  }
  return data;
}

export async function inflateModel(data: Uint8Array, signal: AbortSignal): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw modelError("当前浏览器不支持解压文字识别模型，请升级浏览器。");
  }
  try {
    const input = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const stream = new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip'));
    const decoded = new Uint8Array(await new Response(stream).arrayBuffer());
    signal.throwIfAborted();
    if (!decoded.length || decoded.length > 96 * 1024 * 1024) {
      throw modelError('文字识别模型解压后的大小不正确。');
    }
    return decoded;
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof Error && error.message.includes(REPAIR_HINT)) throw error;
    throw modelError('文字识别模型无法解压，文件可能损坏。');
  }
}

async function fetchChecked(
  url: URL,
  signal: AbortSignal,
  accept: string,
  kind: 'JSON' | 'model',
): Promise<Response> {
  const label = kind === 'JSON' ? 'JSON' : "模型";
  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: accept }, cache: 'no-cache' });
  } catch {
    signal.throwIfAborted();
    throw modelError(`文字识别${label}请求失败，请检查网络或下载器/浏览器扩展是否拦截资源。`);
  }
  signal.throwIfAborted();
  if (!response.ok) throw modelError(`文字识别${label}加载失败（HTTP ${response.status}）。`);
  if (/attachment/i.test(response.headers.get('content-disposition') ?? '')) {
    throw modelError(`文字识别${label}被配置为附件下载，请移除 Content-Disposition: attachment。`);
  }
  return response;
}

export async function loadModel(base: URL, signal: AbortSignal, language = 'eng'): Promise<Uint8Array> {
  if (!/^[a-z_]+$/.test(language)) throw modelError("文字识别模型语言不正确。");
  const manifestResponse = await fetchChecked(
    new URL(language === 'eng' ? MODEL_FILE : `lang/${language}-v1.json`, base),
    signal,
    'application/json',
    'model',
  );
  const contentType = manifestResponse.headers.get('content-type') ?? '';
  if (!/^(application\/json|application\/[\w.+-]+\+json)(?:\s*;|$)/i.test(contentType)) {
    throw modelError('文字识别模型响应不是 JSON，可能返回了网页或被拦截。');
  }
  let manifest: unknown;
  try { manifest = await manifestResponse.json(); }
  catch {
    signal.throwIfAborted();
    throw modelError('文字识别模型 JSON 不完整或已损坏。');
  }
  signal.throwIfAborted();
  if (manifest && typeof manifest === 'object' && (manifest as Record<string, unknown>).version === 2) {
    const entry = manifest as Record<string, unknown>;
    if (entry.file !== `lang/${language}-v1.traineddata`) {
      throw modelError('文字识别模型格式不正确或文件不完整。');
    }
    const response = await fetchChecked(new URL(entry.file, base), signal, 'application/gzip, application/octet-stream', 'model');
    const binaryType = response.headers.get('content-type') ?? '';
    if (binaryType && !/^(?:application\/(?:gzip|x-gzip|octet-stream)|binary\/octet-stream)(?:\s*;|$)/i.test(binaryType)) {
      throw modelError('文字识别模型响应不是二进制数据，可能返回了网页或被拦截。');
    }
    let data: Uint8Array;
    try { data = new Uint8Array(await response.arrayBuffer()); }
    catch {
      signal.throwIfAborted();
      throw modelError('文字识别模型文件不完整或已损坏。');
    }
    signal.throwIfAborted();
    return inflateModel(decodeExternalModel(manifest, data, language), signal);
  }
  // Keep the legacy v1 return value compressed for compatibility with callers
  // that used decodeModel/loadModel directly. The new OCR engine inflates it
  // before handing it to tesseract-wasm.
  return decodeModel(manifest, language);
}
