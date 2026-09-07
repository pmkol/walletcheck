import { defineConfig } from '@playwright/test';

const port = Number(process.env.WALLETCHECK_TEST_PORT ?? 21000);

export default defineConfig({
  testDir: './tests/browser',
  timeout: 120_000,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true, locale: 'zh-CN' },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
