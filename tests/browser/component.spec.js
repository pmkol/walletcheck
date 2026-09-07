import { expect, test } from '@playwright/test';
import QRCode from 'qrcode';

const address = '0x1234567890123456789012345678901234567890';
const otherAddress = '0x9876543210987654321098765432109876543210';

async function uploadImage(page, { qr = address, text = address, secondQr, dark = false, coin = 'USDT', network = 'Ethereum', wrapped = false } = {}) {
  if (await page.locator('wallet-check').count() === 0) {
    await page.getByRole('button', { name: '打开验证演示' }).click();
  }
  const qrImage = qr ? await QRCode.toDataURL(qr, { width: 360, margin: 4 }) : null;
  const secondImage = secondQr ? await QRCode.toDataURL(secondQr, { width: 360, margin: 4 }) : null;
  const image = await page.evaluate(async ({ qrImage, secondImage, text, dark, coin, network, wrapped }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1300;
    canvas.height = 650;
    const drawing = canvas.getContext('2d');
    drawing.fillStyle = dark ? '#101010' : '#ffffff';
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    async function draw(source, left) {
      const image = new Image();
      image.src = source;
      await image.decode();
      drawing.drawImage(image, left, 30);
    }
    if (qrImage) await draw(qrImage, secondImage ? 200 : 470);
    if (secondImage) await draw(secondImage, 700);
    drawing.fillStyle = dark ? '#ffffff' : '#000000';
    drawing.font = '36px monospace';
    if (wrapped) {
      drawing.textAlign = 'right';
      drawing.fillText(text.slice(0, 28), 1200, 465);
      drawing.fillText(text.slice(28), 1200, 505);
      drawing.textAlign = 'left';
    } else drawing.fillText(text, 100, 490);
    drawing.font = '28px monospace';
    if (coin) drawing.fillText(`Coin: ${coin}`, 100, 550);
    if (network) drawing.fillText(`Network: ${network}`, 100, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { qrImage, secondImage, text, dark, coin, network, wrapped });
  await page.locator('wallet-check input[type=file]').setInputFiles({
    name: 'wallet.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64'),
  });
}

test('full verification stays local, confirms once, closes and resets for new configuration', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  expect(requests.some((url) => /tesseract|walletcheck-assets/.test(url))).toBe(false);
  await page.evaluate(() => {
    window.confirmations = [];
    document.addEventListener('wallet-confirm', (event) => {
      window.confirmations.push(event.detail);
    });
  });
  await uploadImage(page);
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #address')).toHaveText(address);
  await expect(page.locator('wallet-check #result-coin')).toHaveText('USDT');
  await expect(page.locator('wallet-check #result-network')).toHaveText('Ethereum');
  await expect(page.locator('wallet-check .result-tag')).toHaveCount(0);
  await expect(page.locator('wallet-check #address-label')).toHaveText('地址：');
  await page.setViewportSize({ width: 390, height: 700 });
  expect(await page.locator('wallet-check #metadata').evaluate((result) => result.scrollWidth <= result.clientWidth)).toBe(true);
  await page.getByRole('dialog').screenshot({ path: 'test-results/result-tags-mobile.png' });
  await expect(page.locator('wallet-check #metadata .check-icon[aria-label="核对通过"]')).toHaveCount(3);
  await expect(page.locator('wallet-check #metadata [data-passed="true"]')).toHaveCount(3);
  await expect(page.locator('wallet-check #verify')).toBeHidden();
  await expect(page.locator('wallet-check #verify')).toBeDisabled();
  await page.getByRole('button', { name: '确认钱包地址' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#output')).toContainText(address);
  expect(await page.evaluate(() => window.confirmations)).toEqual([{ coin: 'USDT', network: 'ethereum', address }]);
  expect(requests.some((url) => url.includes('walletcheck-assets/tesseract-lib.js'))).toBe(true);
  expect(requests.filter((url) => /^https?:/.test(url) && new URL(url).hostname !== '127.0.0.1')).toEqual([]);
  await page.screenshot({ path: 'test-results/walletcheck.png', fullPage: true });
  await page.locator('select#coin').selectOption('USDC');
  await page.getByRole('button', { name: '打开验证演示' }).click();
  await expect(page.locator('wallet-check #coin')).toHaveText('USDC');
  await expect(page.locator('wallet-check #result-coin')).toBeEmpty();
  await expect(page.locator('wallet-check #result-network')).toBeEmpty();
  await expect(page.getByRole('button', { name: '开始核对' })).toBeVisible();
  await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeHidden();
  await expect(page.locator('wallet-check #preview')).toBeHidden();
});

test('real OCR cross-check uses self-hosted resources and matches the QR address', async ({ page }) => {
  const requests = [];
  const downloads = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.goto('/');
  await uploadImage(page);
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #address')).toHaveText(address, { timeout: 90_000 });
  await expect(page.locator('wallet-check #metadata [data-passed="true"]')).toHaveCount(3);
  expect(requests.some((url) => url.includes('walletcheck-assets/tesseract-worker.js'))).toBe(true);
  expect(requests.some((url) => url.includes('walletcheck-assets/lang/eng-v1.json'))).toBe(true);
  expect(requests.some((url) => url.includes('walletcheck-assets/lang/eng-v1.traineddata'))).toBe(true);
  expect(downloads).toEqual([]);
  expect(requests.filter((url) => /^https?:/.test(url) && new URL(url).hostname !== '127.0.0.1')).toEqual([]);
});

test('identical fake addresses are rejected and verification fits a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/');
  await uploadImage(page, { qr: '123456', text: '123456' });
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #preview')).toBeHidden();
  await expect(page.locator('wallet-check #status')).toContainText('未通过格式或校验和检查');
  await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeHidden();
  expect(await page.getByRole('dialog').evaluate((dialog) => dialog.scrollHeight <= dialog.clientHeight + 1)).toBe(true);
  await expect(page.locator('#output')).toHaveText('等待弹窗内确认…');
});

test('real OCR conflicting address cannot be confirmed', async ({ page }) => {
  await page.goto('/');
  await uploadImage(page, { text: otherAddress });
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #status')).toContainText('不一致', { timeout: 90_000 });
  await expect(page.locator('wallet-check #address-check')).toHaveAttribute('data-passed', 'false');
  await expect(page.locator('wallet-check #address-check .check-icon')).toHaveText('✕');
  await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeHidden();
  await expect(page.getByRole('button', { name: '开始核对' })).toBeHidden();
  await expect(page.getByRole('button', { name: '重新核对' })).toHaveCount(1);
  await expect(page.locator('wallet-check .actions button').first()).toHaveText('重新核对');
  await expect(page.locator('wallet-check #verify')).toBeDisabled();
  await expect(page.getByRole('button', { name: '重新核对' })).toBeEnabled();
  await expect(page.locator('wallet-check #preview')).toBeHidden();
  await page.getByRole('button', { name: '查看图片' }).click();
  await expect(page.locator('wallet-check #preview')).toBeVisible();
  await page.getByRole('button', { name: '收起图片' }).click();
  await expect(page.locator('wallet-check #preview')).toBeHidden();
  await expect(page.locator('wallet-check #verify')).toBeHidden();
  await page.getByRole('button', { name: '重新核对' }).click();
  await expect(page.getByRole('button', { name: '开始核对' })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始核对' })).toBeDisabled();
  await uploadImage(page);
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #address')).toHaveText(address);
});

test('wrapped text addresses are independently recognized and conflicts stay rejected', async ({ page }) => {
  await page.goto('/');
  await uploadImage(page, { wrapped: true });
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #address')).toHaveText(address);
  await page.getByRole('button', { name: '重新核对' }).click();
  await uploadImage(page, { wrapped: true, qr: otherAddress });
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #status')).toContainText('文字地址与二维码地址不一致');
  await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeHidden();
});

test('dark screenshot preprocessing preserves actual address conflicts', async ({ page }) => {
  await page.goto('/');
  await uploadImage(page, { text: otherAddress, dark: true });
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #status')).toContainText('不一致', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeHidden();
});

for (const scenario of [
  { name: 'wrong network', coin: 'USDT', network: 'Arbitrum One', error: '网络与当前配置不一致' },
  { name: 'wrong coin', coin: 'USDC', network: 'Ethereum', error: '币种与当前配置不一致' },
  { name: 'missing network', coin: 'USDT', network: '', error: '未识别到明确的网络名称' },
  { name: 'missing coin', coin: '', network: 'Ethereum', error: '未识别到截图中的币种标识' },
  { name: 'testnet', coin: 'USDT', network: 'Ethereum Sepolia', error: '网络与当前配置不一致' },
]) {
  test(`matching addresses cannot bypass ${scenario.name}`, async ({ page }) => {
    await page.goto('/');
    await uploadImage(page, scenario);
    await page.getByRole('button', { name: '开始核对' }).click();
    await expect(page.locator('wallet-check #status')).toContainText(scenario.error, { timeout: 30_000 });
    const field = scenario.name.includes('coin') ? 'coin' : 'network';
    await expect(page.locator(`wallet-check #${field}-check`)).toHaveAttribute('data-passed', 'false');
    await expect(page.locator(`wallet-check #${field}-check .check-icon`)).toHaveText('✕');
    await expect(page.locator('wallet-check #address-check')).toHaveAttribute('data-passed', 'true');
    await expect(page.locator('wallet-check #metadata')).not.toContainText(/不一致|未识别到|未通过|有歧义/);
    expect(await page.locator('wallet-check #metadata').evaluate((element) =>
      element.nextElementSibling.id)).toBe('status');
    await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeHidden();
  });
}

test('all metadata errors appear below independent result rows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/');
  await uploadImage(page, { coin: 'USDC', network: 'Arbitrum One' });
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #status')).toContainText('网络与当前配置不一致', { timeout: 30_000 });
  await expect(page.locator('wallet-check #status')).toContainText('币种与当前配置不一致');
  await expect(page.locator('wallet-check #address-check')).toHaveAttribute('data-passed', 'true');
  await expect(page.locator('wallet-check #metadata [data-passed="false"]')).toHaveCount(2);
  await expect(page.locator('wallet-check .check-status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeHidden();
  await page.getByRole('dialog').screenshot({ path: 'test-results/independent-checks-mobile.png' });
});

test('fixed verification reads metadata and accepts a bounded case-insensitive network alias', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await page.locator('select#network').selectOption('arbitrum');
  await uploadImage(page, { coin: 'usdt', network: 'ARBITRUM' });
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #coin-check')).toHaveAttribute('data-passed', 'true', { timeout: 30_000 });
  await expect(page.locator('wallet-check #network-check')).toHaveAttribute('data-passed', 'true');
  await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeEnabled();
  expect(requests.some((url) => url.includes('walletcheck-assets/tesseract-worker.js'))).toBe(true);
});

for (const scenario of [
  { name: 'QR without text address', qr: address, text: '', error: '没有识别到完整文字地址' },
  { name: 'text address without QR', qr: null, text: address, error: '没有识别到二维码' },
]) {
  test(`removed attributes cannot bypass ${scenario.name}`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '打开验证演示' }).click();
    await page.locator('wallet-check').evaluate((element) => {
      element.setAttribute('mode', 'single-source');
      element.setAttribute('metadata-policy', 'address-only');
    });
    await uploadImage(page, scenario);
    await page.getByRole('button', { name: '开始核对' }).click();
    await expect(page.locator('wallet-check #status')).toContainText(scenario.error, { timeout: 30_000 });
    await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeHidden();
  });
}

test('multiple different QR addresses are rejected', async ({ page }) => {
  await page.goto('/');
  await uploadImage(page, { secondQr: otherAddress });
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #status')).toContainText('多个不同地址');
  await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeHidden();
});

for (const webFirst of [false, true]) {
  test(`wallet QR plus app link passes regardless of QR placement: ${webFirst}`, async ({ page }) => {
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/');
    await uploadImage(page, {
      qr: webFirst ? 'https://example.org/app' : address,
      secondQr: webFirst ? address : 'https://example.org/app',
    });
    await page.getByRole('button', { name: '开始核对' }).click();
    await expect(page.locator('wallet-check #address')).toHaveText(address);
    await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeEnabled();
    expect(requests.some((url) => url.startsWith('https://example.org'))).toBe(false);
  });
}

test('an app QR alone cannot substitute for a wallet QR', async ({ page }) => {
  await page.goto('/');
  await uploadImage(page, { qr: 'https://example.org/app' });
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #status')).toContainText('二维码不是支持的地址格式');
  await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeHidden();
});

test('missing OCR language asset reports an error rather than waiting forever', async ({ page }) => {
  await page.goto('/');
  await page.route('**/walletcheck-assets/lang/**', (route) => route.fulfill({ status: 404, body: 'Not found' }));
  await uploadImage(page);
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #status')).toContainText('文字识别模型加载失败（HTTP 404）', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeHidden();
});

test('invalid model response is rejected before worker initialization', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await page.route('**/walletcheck-assets/lang/**', (route) => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><html>Missing asset fallback</html>',
  }));
  await uploadImage(page);
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #status')).toContainText('文字识别模型响应不是 JSON', { timeout: 15_000 });
  expect(requests.some((url) => url.includes('walletcheck-assets/tesseract-worker.js'))).toBe(false);
  await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeHidden();
});

test('corrupt legacy IndexedDB model cache is ignored', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('keyval');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('keyval', 'readwrite');
        for (const key of ['./eng.traineddata', `${location.origin}/walletcheck-assets//eng.traineddata`]) {
          transaction.objectStore('keyval').put(new TextEncoder().encode('<html>broken cached model</html>'), key);
        }
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    });
  });
  await uploadImage(page);
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #address')).toHaveText(address, { timeout: 90_000 });
});

test('corrupted JSON model is rejected and retry works after the resource is repaired', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await page.route('**/walletcheck-assets/lang/eng-v1.json', async (route) => {
    const response = await route.fetch();
    const model = await response.json();
    model.sha256 = '0'.repeat(64);
    await route.fulfill({ json: model });
  });
  await uploadImage(page);
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #status')).toContainText('完整性校验失败');
  expect(requests.some((url) => url.includes('walletcheck-assets/tesseract-worker.js'))).toBe(false);
  await page.unroute('**/walletcheck-assets/lang/eng-v1.json');
  await expect(page.locator('wallet-check #verify')).toBeHidden();
  await page.getByRole('button', { name: '重新核对' }).click();
  await uploadImage(page);
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #address')).toHaveText(address, { timeout: 90_000 });
});

test('cancelling a pending model request never starts an OCR worker', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await page.route('**/walletcheck-assets/lang/eng-v1.json', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({ status: 503, body: 'unavailable' });
  });
  await uploadImage(page);
  const requested = page.waitForRequest('**/walletcheck-assets/lang/eng-v1.json');
  await page.getByRole('button', { name: '开始核对' }).click();
  await requested;
  await expect(page.locator('wallet-check button')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭核对弹窗' }).click();
  await page.waitForTimeout(1500);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#output')).toHaveText('null');
  expect(requests.some((url) => url.includes('walletcheck-assets/tesseract-worker.js'))).toBe(false);
});

test('cancelling OCR prevents stale success', async ({ page }) => {
  await page.goto('/');
  await page.route('**/walletcheck-assets/tesseract-worker.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await uploadImage(page);
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #status')).toContainText('文字识别引擎');
  await expect(page.locator('wallet-check #verify')).toBeHidden();
  await expect(page.locator('wallet-check button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '关闭核对弹窗' })).toBeEnabled();
  await page.getByRole('button', { name: '关闭核对弹窗' }).click();
  await page.waitForTimeout(2500);
  await expect(page.locator('#output')).toHaveText('null');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.unroute('**/walletcheck-assets/tesseract-worker.js');
  await uploadImage(page);
  await expect(page.locator('wallet-check .actions')).toBeVisible();
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #address')).toHaveText(address, { timeout: 90_000 });
});

test('upload size is capped at 5 MB and a tall preview fits a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/');
  await page.getByRole('button', { name: '打开验证演示' }).click();
  await page.locator('wallet-check input[type=file]').setInputFiles({
    name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.locator('wallet-check #status')).toContainText('不超过 5 MB');
  await expect(page.locator('wallet-check #verify')).toBeDisabled();
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 500;
    canvas.height = 2000;
    return canvas.toDataURL().split(',')[1];
  });
  await page.locator('wallet-check input[type=file]').setInputFiles({
    name: 'tall.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64'),
  });
  await page.locator('wallet-check img').evaluate((image) => image.decode());
  const bounds = await page.locator('wallet-check img').boundingBox();
  expect(bounds.height).toBeLessThanOrEqual(210);
  expect(bounds.width / bounds.height).toBeCloseTo(0.25, 2);
  expect(await page.getByRole('dialog').evaluate((dialog) => dialog.scrollHeight <= dialog.clientHeight + 1)).toBe(true);
  await expect(page.locator('wallet-check #verify')).toBeEnabled();
});

test('cropping invalidates a match and the cropped image can be checked again', async ({ page }) => {
  await page.goto('/');
  await uploadImage(page);
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #address')).toHaveText(address);
  await expect(page.locator('wallet-check #verify')).toBeHidden();
  await expect(page.locator('wallet-check #preview')).toBeHidden();
  await page.getByRole('button', { name: '查看图片' }).click();
  await expect(page.locator('wallet-check #toggle-preview')).toHaveAttribute('aria-expanded', 'true');
  const rectangle = await page.locator('wallet-check img').boundingBox();
  await page.mouse.move(rectangle.x + rectangle.width * 0.02, rectangle.y + rectangle.height * 0.02);
  await page.mouse.down();
  await page.mouse.move(rectangle.x + rectangle.width * 0.95, rectangle.y + rectangle.height * 0.95);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeHidden();
  await page.getByRole('button', { name: '应用裁剪' }).click();
  await expect(page.locator('wallet-check #status')).toContainText('图片已就绪');
  await expect(page.getByRole('button', { name: '开始核对' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '重新核对' })).toHaveCount(0);
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #address')).toHaveText(address);
});

test('one uploaded image locks all upload paths until explicitly cleared', async ({ page }) => {
  await page.goto('/');
  await uploadImage(page);
  await expect(page.locator('wallet-check #preview')).toBeVisible();
  await expect(page.locator('wallet-check #toggle-preview')).toBeHidden();
  await expect(page.getByRole('button', { name: '重新核对' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '清除图片' })).toBeEnabled();
  await expect(page.locator('wallet-check .actions button').last()).toHaveText('清除图片');
  await page.getByRole('button', { name: '清除图片' }).click();
  await expect(page.locator('wallet-check .drop')).toBeVisible();
  await expect(page.getByRole('button', { name: '开始核对' })).toBeDisabled();
  await uploadImage(page);
  await expect(page.locator('wallet-check .drop')).toBeHidden();
  await expect(page.locator('wallet-check input[type=file]')).toBeDisabled();
  const preview = await page.locator('wallet-check img').getAttribute('src');
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.getByRole('button', { name: '清除图片' })).toHaveCount(0);
  await expect(page.locator('wallet-check #verify')).toBeHidden();
  await expect(page.locator('wallet-check #address')).toHaveText(address);
  await expect(page.locator('wallet-check .actions button').first()).toHaveText('重新核对');
  await expect(page.locator('wallet-check .actions')).toBeVisible();
  await expect(page.getByRole('button', { name: '重新核对' })).toBeVisible();
  await page.getByRole('button', { name: '查看图片' }).click();
  await expect(page.locator('wallet-check #preview')).toBeVisible();
  await page.getByRole('button', { name: '收起图片' }).click();
  await expect(page.locator('wallet-check #preview')).toBeHidden();
  await page.locator('wallet-check').evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['replacement'], 'replacement.png', { type: 'image/png' }));
    element.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    const input = element.shadowRoot.querySelector('input[type=file]');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('wallet-check img')).toHaveAttribute('src', preview);
  await expect(page.locator('wallet-check #address')).toHaveText(address);
  await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeEnabled();
  await page.getByRole('button', { name: '重新核对' }).click();
  await expect(page.locator('wallet-check .drop')).toBeVisible();
  await expect(page.locator('wallet-check input[type=file]')).toBeEnabled();
  await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeHidden();
  await uploadImage(page, { qr: otherAddress, text: otherAddress });
  await expect(page.locator('wallet-check #preview')).toBeVisible();
  await expect(page.locator('wallet-check #toggle-preview')).toBeHidden();
  await expect(page.getByRole('button', { name: '重新核对' })).toHaveCount(0);
  await expect(page.locator('wallet-check .actions button').last()).toHaveText('清除图片');
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #address')).toHaveText(otherAddress);
});

test('built library works in plain HTML on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/browser/host.html');
  await uploadImage(page);
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #address')).toHaveText(address);
  await page.getByRole('button', { name: '确认钱包地址' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
