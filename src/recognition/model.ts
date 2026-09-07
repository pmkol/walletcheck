import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const MODEL_FILE = 'lang/eng-v1.json';
const MAX_MODEL_BYTES = 24 * 1024 * 1024;
const REPAIR_HINT = '请运行 npm run assets:ocr，检查 asset-base-url 和静态资源部署后重试。';

export function decodeModel(value: unknown): Uint8Array {
  if (!value || typeof value !== 'object') throw new Error(`文字识别模型格式不正确。${REPAIR_HINT}`);
  const model = value as Record<string, unknown>;
  if (model.format !== 'walletcheck-ocr-model' || model.version !== 1
    || model.language !== 'eng' || model.encoding !== 'base64+gzip'
    || typeof model.data !== 'string' || typeof model.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(model.sha256)
    || typeof model.bytes !== 'number' || !Number.isInteger(model.bytes)
    || model.bytes < 2 || model.bytes > MAX_MODEL_BYTES
    || model.data.length !== 4 * Math.ceil(model.bytes / 3)) {
    throw new Error(`文字识别模型格式不正确或文件不完整。${REPAIR_HINT}`);
  }
  let binary: string;
  try { binary = atob(model.data); }
  catch { throw new Error(`文字识别模型编码损坏。${REPAIR_HINT}`); }
  const data = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (data.length !== model.bytes || data[0] !== 0x1f || data[1] !== 0x8b
    || bytesToHex(sha256(data)) !== model.sha256) {
    throw new Error(`文字识别模型完整性校验失败，资源可能损坏或被拦截。${REPAIR_HINT}`);
  }
  return data;
}

export async function loadModel(base: URL, signal: AbortSignal): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(new URL(MODEL_FILE, base), {
      signal,
      headers: { Accept: 'application/json' },
      cache: 'no-cache',
    });
  } catch {
    signal.throwIfAborted();
    throw new Error(`文字识别模型请求失败，请检查网络或下载器/浏览器扩展是否拦截资源。${REPAIR_HINT}`);
  }
  signal.throwIfAborted();
  if (!response.ok) throw new Error(`文字识别模型加载失败（HTTP ${response.status}）。${REPAIR_HINT}`);
  if (/attachment/i.test(response.headers.get('content-disposition') ?? '')) {
    throw new Error(`文字识别模型被配置为附件下载，请移除 Content-Disposition: attachment。${REPAIR_HINT}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^(application\/json|application\/[\w.+-]+\+json)(?:\s*;|$)/i.test(contentType)) {
    throw new Error(`文字识别模型响应不是 JSON，可能返回了网页或被拦截。${REPAIR_HINT}`);
  }
  let model: unknown;
  try { model = await response.json(); }
  catch {
    signal.throwIfAborted();
    throw new Error(`文字识别模型 JSON 不完整或已损坏。${REPAIR_HINT}`);
  }
  signal.throwIfAborted();
  return decodeModel(model);
}
