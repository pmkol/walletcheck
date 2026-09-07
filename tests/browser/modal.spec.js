import { expect, test } from '@playwright/test';

test('configuration updates the real API snippet without eagerly loading the modal or recognition', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await expect(page.locator('wallet-check')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('select#coin option')).toHaveText(['USDT', 'USDC']);
  await expect(page.locator('select#coin')).toHaveValue('USDT');
  await expect(page.locator('input#coin')).toHaveCount(0);
  await page.locator('select#coin').selectOption('USDC');
  await page.locator('select#network').selectOption('tron');
  await expect(page.locator('select#mode')).toHaveCount(0);
  await expect(page.locator('#check-metadata')).toHaveCount(0);
  await expect(page.locator('#integration-code')).toContainText('"coin": "USDC"');
  await expect(page.locator('#integration-code')).toContainText('"network": "tron"');
  await expect(page.locator('#integration-code')).not.toContainText('"mode"');
  await expect(page.locator('#integration-code')).not.toContainText('"metadataPolicy"');
  await expect(page.locator('#integration-code')).toContainText("from 'walletcheck-js/modal'");
  expect(requests.some((url) => /\/src\/(modal|element)\.ts|tesseract|walletcheck-assets/.test(url))).toBe(false);
  await page.getByRole('button', { name: '打开验证演示' }).click();
  await expect(page.getByRole('dialog', { name: '钱包地址核对弹窗' })).toBeVisible();
  await expect(page.getByRole('button', { name: '关闭核对弹窗' })).toHaveText('');
  await expect(page.getByRole('button', { name: '关闭核对弹窗' }).locator('svg')).toBeVisible();
  await expect(page.locator('wallet-check #coin')).toHaveText('USDC');
  await expect(page.locator('wallet-check #network')).toHaveText('TRON');
  await expect(page.locator('wallet-check header #coin')).toHaveText('USDC');
  await expect(page.locator('wallet-check .local')).toHaveCount(0);
  await expect(page.getByText('二维码 + 文字地址 + 币种 + 网络', { exact: true })).toHaveCount(0);
  await expect(page.locator('wallet-check select')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/walletcheck-modal.png', fullPage: true });
});

test('Escape and the close button return null, restore focus and allow reopening', async ({ page }) => {
  await page.goto('/');
  const openButton = page.getByRole('button', { name: '打开验证演示' });
  await openButton.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#output')).toHaveText('null');
  await expect(openButton).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await openButton.click();
  await page.getByRole('button', { name: '关闭核对弹窗' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#demo-status')).toContainText('没有提交钱包地址');
  await expect(openButton).toBeFocused();
});

test('closing during OCR never returns a late confirmation or reuses the previous image', async ({ page }) => {
  await page.goto('/');
  await page.route('**/walletcheck-assets/tesseract-worker.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.getByRole('button', { name: '打开验证演示' }).click();
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 100; canvas.height = 100;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, 100, 100);
    return canvas.toDataURL().split(',')[1];
  });
  await page.locator('wallet-check input[type=file]').setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await page.getByRole('button', { name: '开始核对' }).click();
  await expect(page.locator('wallet-check #status')).toContainText('文字识别引擎');
  await expect(page.locator('wallet-check #preview')).toBeHidden();
  await expect(page.getByRole('button', { name: '查看图片' })).toBeHidden();
  await page.getByRole('button', { name: '关闭核对弹窗' }).click();
  await page.getByRole('button', { name: '打开验证演示' }).click();
  await page.waitForTimeout(2500);
  await expect(page.locator('wallet-check #preview')).toBeHidden();
  await expect(page.getByRole('button', { name: '开始核对' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '确认钱包地址' })).toBeHidden();
  await expect(page.locator('#output')).toHaveText('等待弹窗内确认…');
});

test('built modal API rejects invalid options and duplicate opens without creating extra dialogs', async ({ page }) => {
  await page.goto('/');
  const error = await page.evaluate(async () => {
    const { openWalletCheck } = await import('/dist/modal.js');
    try { await openWalletCheck({ coin: '', network: 'tron' }); }
    catch (error) { return error.message; }
  });
  expect(error).toContain('币种标识不合法');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const duplicate = await page.evaluate(async () => {
    const { openWalletCheck } = await import('/dist/modal.js');
    window.modalResult = openWalletCheck({ coin: 'USDT', network: 'tron' });
    try { await openWalletCheck({ coin: 'USDT', network: 'tron' }); }
    catch (error) { return error.message; }
  });
  expect(duplicate).toContain('已有钱包核对弹窗');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.modalResult)).toBe(null);
});

test('demo and modal fit a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '打开验证演示' }).click();
  await expect(page.locator('wallet-check footer')).toHaveCount(0);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('wallet-check .drop').click();
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(false);
  expect(await chooser.element().getAttribute('accept')).toBe('image/png,image/jpeg,image/webp');
  const bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.height).toBeLessThanOrEqual(844);
  await page.getByRole('button', { name: '关闭核对弹窗' }).click();
});
