import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTranslator, resolveLocale, translate } from '../src/i18n';

describe('UI translations', () => {
  it('covers built-in dynamic UI and recognition messages in English', () => {
    for (const file of ['element.ts', 'modal.ts', 'checker.ts', 'recognition/browser.ts', 'recognition/ocr.ts', 'recognition/model.ts', 'recognition/qr.ts']) {
      const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
      for (const match of source.matchAll(/'([^'\n]*\p{Script=Han}[^'\n]*)'/gu)) {
        expect(translate(match[1], 'en'), `${file}: ${match[1]}`).not.toMatch(/\p{Script=Han}/u);
      }
    }
  });
  it('supports three locales and preserves the existing default', () => {
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('zh-HK')).toBe('zh-HK');
    for (const value of [undefined, null, '', 'zh-CN', 'unsupported']) {
      expect(resolveLocale(value)).toBe('zh-CN');
    }
  });

  it('translates complete phrases before overlapping shorter labels', () => {
    expect(translate('网络：核对通过', 'en')).toBe('Network:Passed');
    expect(translate('未通过核对', 'en')).toBe('Not verified');
    expect(translate('确认钱包地址', 'zh-HK')).toBe('確認錢包地址');
    expect(translate('确认钱包地址', 'zh-CN')).toBe('确认钱包地址');
  });

  it('preserves progress, error details, and payload values', () => {
    expect(translate('正在加载本地文字识别引擎 42%', 'en')).toBe('Loading on-device OCR engine 42%');
    expect(translate('文字识别引擎错误：initialization failed', 'en')).toBe('OCR engine error: initialization failed');
    expect(translate('USDC arbitrum 0xabcdef', 'en')).toBe('USDC arbitrum 0xabcdef');
    const errors = translate('文字识别模型格式不正确。请运行 npm run assets:ocr，检查 asset-base-url 和静态资源部署后重试。', 'en');
    expect(errors).not.toMatch(/\p{Script=Han}/u);
    expect(errors).toContain('npm run assets:ocr');
  });

  it('escapes dictionary punctuation and preserves unknown messages', () => {
    const localize = createTranslator({ '中文 (a+b)': ['English', '繁體'] });
    expect(localize('中文 (a+b)', 'en')).toBe('English');
    expect(localize('unrecognized message', 'en')).toBe('unrecognized message');
  });
});
