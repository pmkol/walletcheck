import { expect, test } from '@playwright/test';
import QRCode from 'qrcode';

const address = '0x1234567890123456789012345678901234567890';

for (const scenario of [
  { languages: ['zh-CN'], saved: null, expected: 'zh-CN' },
  { languages: ['zh-TW'], saved: null, expected: 'zh-HK' },
  { languages: ['en-US'], saved: null, expected: 'en' },
  { languages: ['fr-FR', 'ja-JP'], saved: null, expected: 'en' },
  { languages: ['fr-FR', 'zh-Hant'], saved: 'invalid', expected: 'zh-HK' },
  { languages: ['en-US'], saved: 'zh-HK', expected: 'zh-HK' },
]) {
  test(`initial language uses browser ${scenario.languages} and saved ${scenario.saved}`, async ({ page }) => {
    await page.addInitScript(({ languages, saved }) => {
      Object.defineProperty(navigator, 'languages', { get: () => languages });
      Object.defineProperty(navigator, 'language', { get: () => languages[0] });
      if (saved !== null) localStorage.setItem('walletcheck-locale', saved);
    }, scenario);
    await page.goto('/');
    await expect(page.locator('#language')).toHaveValue(scenario.expected);
    await expect(page.locator('html')).toHaveAttribute('lang', scenario.expected);
    await expect(page.locator('#integration-code')).toContainText(`"locale": "${scenario.expected}"`);
    expect(await page.evaluate(() => localStorage.getItem('walletcheck-locale'))).toBe(scenario.saved);
    await page.locator('#open-demo').click();
    await expect(page.locator('wallet-check')).toHaveAttribute('lang', scenario.expected);
  });
}

test('SDK explicit language overrides browser preferences and omitted language keeps its default', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { openWalletCheck } = await import('/src/modal.ts');
    void openWalletCheck({ coin: 'USDT', network: 'ethereum', locale: 'en' });
  });
  await expect(page.getByRole('button', { name: 'Close verification dialog' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#language').selectOption('en');
  await page.evaluate(async () => {
    const { openWalletCheck } = await import('/src/modal.ts');
    void openWalletCheck({ coin: 'USDT', network: 'ethereum' });
  });
  await expect(page.getByRole('button', { name: '关闭核对弹窗' })).toBeVisible();
});

async function upload(page, coin = 'USDT') {
  const qr = await QRCode.toDataURL(address, { width: 360, margin: 4 });
  const image = await page.evaluate(async ({ qr, address, coin }) => {
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
    drawing.fillText(`Coin: ${coin}`, 100, 550);
    drawing.fillText('Network: Ethereum', 100, 600);
    return canvas.toDataURL().split(',')[1];
  }, { qr, address, coin });
  await page.locator('wallet-check input[type=file]').setInputFiles({
    name: 'wallet.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64'),
  });
}

test('language switching updates the demo, code, dialog and persisted preference', async ({ page }) => {
  await page.goto('/');
  for (const [locale, title, open, close] of [
    ['en', 'Configure. Open. Verify.', 'Open verification demo', 'Close verification dialog'],
    ['zh-HK', '設定參數，一鍵體驗核對。', '開啟驗證示範', '關閉核對彈窗'],
    ['zh-CN', '配好参数，一键体验核对。', '打开验证演示', '关闭核对弹窗'],
  ]) {
    await page.locator('#language').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('h1')).toHaveText(title);
    await expect(page.locator('#integration-code')).toContainText(`"locale": "${locale}"`);
    await page.getByRole('button', { name: open }).click();
    await expect(page.locator('wallet-check')).toHaveAttribute('lang', locale);
    await page.getByRole('button', { name: close }).click();
    await expect(page.locator('#output')).toHaveText('null');
  }
  await page.locator('#language').selectOption('en');
  await page.reload();
  await expect(page.locator('#language')).toHaveValue('en');
  await expect(page.locator('h1')).toHaveText('Configure. Open. Verify.');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { window.copied = text; } } });
  });
  await page.getByRole('button', { name: 'Copy code', exact: true }).click();
  await expect(page.locator('#copy-status')).toHaveText('Code copied');
  expect(await page.evaluate(() => window.copied)).toContain('"locale": "en"');
});

for (const settings of [
  { locale: 'en', start: 'Start verification', confirm: 'Confirm wallet address', reset: 'Start over', error: 'The detected coin does not match your selection.', passed: 'Passed', clear: 'Clear image' },
  { locale: 'zh-HK', start: '開始核對', confirm: '確認錢包地址', reset: '重新核對', error: '辨識到的幣種與目前設定不一致', passed: '核對通過', clear: '清除圖片' },
]) {
  test(`${settings.locale} localizes failure, reset and success without changing the payload`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto('/');
    await page.locator('#language').selectOption(settings.locale);
    await page.locator('#open-demo').click();
    await upload(page, 'USDC');
    await expect(page.getByRole('button', { name: settings.clear, exact: true })).toBeVisible();
    await page.getByRole('button', { name: settings.start, exact: true }).click();
    await expect(page.locator('wallet-check #status')).toContainText(settings.error, { timeout: 30_000 });
    await expect(page.locator('wallet-check #address-check .check-icon')).toHaveAttribute('aria-label', settings.passed);
    await expect(page.getByRole('button', { name: settings.confirm, exact: true })).toBeHidden();
    await page.getByRole('button', { name: settings.reset, exact: true }).click();
    await upload(page);
    await page.getByRole('button', { name: settings.start, exact: true }).click();
    await expect(page.getByRole('button', { name: settings.confirm, exact: true })).toBeEnabled({ timeout: 30_000 });
    await expect(page.locator('wallet-check #metadata [data-passed="true"]')).toHaveCount(3);
    expect(await page.locator('wallet-check .panel').evaluate((panel) => panel.scrollWidth <= panel.clientWidth)).toBe(true);
    expect(await page.locator('wallet-check #metadata p > span:first-child').evaluateAll((labels) => labels.every((label) =>
      label.getBoundingClientRect().height <= parseFloat(getComputedStyle(label).lineHeight) + 1))).toBe(true);
    await page.getByRole('dialog').screenshot({ path: `test-results/locale-${settings.locale}-mobile.png` });
    await page.getByRole('button', { name: settings.confirm, exact: true }).click();
    expect(JSON.parse(await page.locator('#output').textContent())).toEqual({ coin: 'USDT', network: 'ethereum', address });
  });
}

test('English OCR resource errors and native component language changes are localized', async ({ page }) => {
  await page.goto('/');
  await page.locator('#language').selectOption('en');
  await page.locator('#open-demo').click();
  await page.locator('wallet-check').evaluate((element) => { element.lang = 'zh-HK'; });
  await expect(page.getByRole('button', { name: '開始核對', exact: true })).toBeVisible();
  await page.locator('wallet-check').evaluate((element) => { element.lang = 'en'; });
  await page.route('**/walletcheck-assets/lang/eng-v1.json', (route) => route.fulfill({
    status: 404, contentType: 'application/json', body: '{}',
  }));
  await upload(page);
  await page.getByRole('button', { name: 'Start verification', exact: true }).click();
  await expect(page.locator('wallet-check #status')).toContainText('OCR model failed to load', { timeout: 30_000 });
  await expect(page.locator('wallet-check #status')).not.toContainText(/\p{Script=Han}/u);
  await expect(page.getByRole('button', { name: 'Start over', exact: true })).toBeEnabled();
});

test('language selection still works when browser storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-Hant'] });
  });
  await page.goto('/');
  await expect(page.locator('#language')).toHaveValue('zh-HK');
  await page.locator('#language').selectOption('en');
  await expect(page.locator('h1')).toHaveText('Configure. Open. Verify.');
  await page.locator('#open-demo').click();
  await expect(page.getByRole('button', { name: 'Close verification dialog' })).toBeVisible();
});
