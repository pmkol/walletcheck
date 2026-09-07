import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import QRCode from 'qrcode';

const directory = fileURLToPath(new URL('../../dist-demo/', import.meta.url));
const address = '0x1234567890123456789012345678901234567890';
const contentTypes = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.wasm': 'application/wasm',
};

for (const mount of ['/', '/walletcheck-js/']) {
  test(`static demo verifies locally when mounted at ${mount}`, async ({ page }) => {
    test.skip(!existsSync(resolve(directory, 'index.html')), 'Run npm run build:demo first');
    const server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (!pathname.startsWith(mount)) { response.writeHead(404).end(); return; }
        const file = resolve(directory, pathname.slice(mount.length) || 'index.html');
        if (!file.startsWith(directory.endsWith(sep) ? directory : directory + sep)) {
          response.writeHead(403).end(); return;
        }
        const body = await readFile(file);
        response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream' });
        response.end(body);
      } catch { response.writeHead(404).end(); }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const base = `http://127.0.0.1:${server.address().port}${mount}`;
      const requests = [];
      const failures = [];
      const downloads = [];
      page.on('request', (request) => requests.push(request.url()));
      page.on('response', (response) => { if (response.status() >= 400) failures.push(response.url()); });
      page.on('download', (download) => downloads.push(download.suggestedFilename()));
      await page.goto(base);
      await page.locator('#language').selectOption('en');
      await expect(page.locator('#integration-code')).toContainText('"assetBaseUrl": "./walletcheck-assets"');
      expect(requests.some((url) => /walletcheck-assets|\/assets\/(?:modal|ocr|qr)-/.test(url))).toBe(false);
      await page.locator('#open-demo').click();
      await expect(page.locator('wallet-check input[type=file]')).toHaveCount(1);
      const qr = await QRCode.toDataURL(address, { width: 360, margin: 4 });
      const image = await page.evaluate(async ({ qr, address }) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1300;
        canvas.height = 650;
        const drawing = canvas.getContext('2d');
        drawing.fillStyle = 'white';
        drawing.fillRect(0, 0, canvas.width, canvas.height);
        const bitmap = await createImageBitmap(await (await fetch(qr)).blob());
        drawing.drawImage(bitmap, 470, 30);
        bitmap.close();
        drawing.fillStyle = 'black';
        drawing.font = '36px monospace';
        drawing.fillText(address, 100, 490);
        drawing.font = '28px monospace';
        drawing.fillText('Coin: USDT', 100, 550);
        drawing.fillText('Network: Ethereum', 100, 600);
        return canvas.toDataURL().split(',')[1];
      }, { qr, address });
      await page.locator('wallet-check input[type=file]').setInputFiles({
        name: 'wallet.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64'),
      });
      await page.getByRole('button', { name: 'Start verification', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Confirm wallet address', exact: true })).toBeEnabled({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Confirm wallet address', exact: true }).click();
      expect(JSON.parse(await page.locator('#output').textContent())).toEqual({ coin: 'USDT', network: 'ethereum', address });
      expect(requests.some((url) => url.endsWith('/walletcheck-assets/lang/eng-v1.json'))).toBe(true);
      expect(requests.filter((url) => /^https?:/.test(url) && !url.startsWith(base))).toEqual([]);
      expect(requests.some((url) => url.includes('/src/') || url.includes('/demo/main.ts'))).toBe(false);
      expect(failures).toEqual([]);
      expect(downloads).toEqual([]);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
}
