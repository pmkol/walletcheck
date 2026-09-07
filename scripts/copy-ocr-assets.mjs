import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const destination = resolve(process.argv[2] ?? 'public/walletcheck-assets');
const tesseractWasmDist = dirname(require.resolve('tesseract-wasm'));
const languages = [
  ['eng', '@tesseract.js-data/eng'],
  ['chi_sim', '@tesseract.js-data/chi_sim'],
  ['chi_tra', '@tesseract.js-data/chi_tra'],
];
const variant = process.env.WALLETCHECK_OCR_VARIANT ?? '4.0.0_best_int';
if (!/^[a-zA-Z0-9._-]+$/.test(variant)) throw new Error('WALLETCHECK_OCR_VARIANT contains invalid characters');

await mkdir(join(destination, 'lang'), { recursive: true });
await copyFile(join(tesseractWasmDist, 'lib.js'), join(destination, 'tesseract-lib.js'));
await copyFile(join(tesseractWasmDist, 'tesseract-worker.js'), join(destination, 'tesseract-worker.js'));
await copyFile(join(tesseractWasmDist, 'tesseract-core.wasm'), join(destination, 'tesseract-core.wasm'));
await copyFile(join(tesseractWasmDist, 'tesseract-core-fallback.wasm'), join(destination, 'tesseract-core-fallback.wasm'));

// Remove files produced by the former tesseract.js asset pipeline. This keeps a
// previously generated public directory from continuing to ship the old core.
await Promise.all([
  rm(join(destination, 'worker-loader.js'), { force: true }),
  rm(join(destination, 'worker.min.js'), { force: true }),
  rm(join(destination, 'core'), { recursive: true, force: true }),
  ...languages.flatMap(([code]) => [
    rm(join(destination, 'lang', `${code}-v1.json`), { force: true }),
    rm(join(destination, 'lang', `${code}-v1.traineddata`), { force: true }),
    rm(join(destination, 'lang', `${code}-v1.traineddata.gz`), { force: true }),
  ]),
]);

for (const [code, packageName] of languages) {
  const languageRoot = dirname(require.resolve(`${packageName}/package.json`));
  const source = join(languageRoot, variant, `${code}.traineddata.gz`);
  // Keep the gzip bytes but use a neutral extension. Some static servers
  // transparently decode `.gz` files as Content-Encoding: gzip, which would
  // invalidate the manifest hash before the browser-side decompression step.
  const targetName = `lang/${code}-v1.traineddata`;
  const target = join(destination, targetName);
  const data = await readFile(source);
  await copyFile(source, target);
  const manifestPath = join(destination, 'lang', `${code}-v1.json`);
  await writeFile(`${manifestPath}.tmp`, JSON.stringify({
    format: 'walletcheck-ocr-model',
    version: 2,
    language: code,
    encoding: 'external+gzip',
    file: targetName,
    bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
  }));
  await rename(`${manifestPath}.tmp`, manifestPath);
}

console.log(`OCR 静态资源已复制到 ${destination}（模型变体：${variant}）`);
