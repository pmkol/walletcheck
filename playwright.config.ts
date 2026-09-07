import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 120_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:21000', headless: true, locale: 'zh-CN' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:21000',
    reuseExistingServer: !process.env.CI,
  },
});
