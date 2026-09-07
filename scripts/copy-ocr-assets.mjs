import { copyFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const destination = resolve(process.argv[2] ?? 'public/walletcheck-assets');
const tesseract = dirname(require.resolve('tesseract.js/package.json'));
const core = dirname(require.resolve('tesseract.js-core/package.json'));
const language = dirname(require.resolve('@tesseract.js-data/eng/package.json'));
await mkdir(join(destination, 'core'), { recursive: true });
await mkdir(join(destination, 'lang'), { recursive: true });
await copyFile(new URL('./ocr-worker-bootstrap.js', import.meta.url), join(destination, 'worker-loader.js'));
await copyFile(join(tesseract, 'dist/worker.min.js'), join(destination, 'worker.min.js'));
for (const name of await readdir(core)) {
  if (name.includes('lstm') && (name.endsWith('.wasm.js') || name.endsWith('.wasm'))) {
    await copyFile(join(core, name), join(destination, 'core', name));
  }
}
const model = await readFile(join(language, '4.0.0/eng.traineddata.gz'));
gunzipSync(model);
const modelPath = join(destination, 'lang/eng-v1.json');
await writeFile(`${modelPath}.tmp`, JSON.stringify({
  format: 'walletcheck-ocr-model',
  version: 1,
  language: 'eng',
  encoding: 'base64+gzip',
  bytes: model.length,
  sha256: createHash('sha256').update(model).digest('hex'),
  data: model.toString('base64'),
}));
await rename(`${modelPath}.tmp`, modelPath);
console.log(`OCR 静态资源已复制到 ${destination}`);
