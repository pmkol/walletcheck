import { describe, expect, it } from 'vitest';
import { selectDemoLocale } from '../demo/locale-preference';

describe('demo language preference', () => {
  it.each(['en', 'zh-CN', 'zh-HK'] as const)('uses the saved manual choice %s first', (locale) => {
    expect(selectDemoLocale(locale, ['fr-FR', 'en-US', 'zh-CN'])).toBe(locale);
  });

  it.each([
    ['zh-CN', 'zh-CN'], ['zh-SG', 'zh-CN'], ['zh', 'zh-CN'],
    ['zh-Hans', 'zh-CN'], ['zh-Hans-HK', 'zh-CN'],
    ['zh-HK', 'zh-HK'], ['zh-MO', 'zh-HK'], ['zh-TW', 'zh-HK'],
    ['zh-Hant', 'zh-HK'], ['zh-Hant-CN', 'zh-HK'], ['ZH-hk', 'zh-HK'],
    ['en-US', 'en'], ['en-GB', 'en'], ['fr-FR', 'en'],
  ])('maps browser preference %s to %s', (preference, locale) => {
    expect(selectDemoLocale(null, [preference])).toBe(locale);
  });

  it('honors supported browser preference order and ignores invalid saved choices', () => {
    expect(selectDemoLocale('invalid', ['fr', 'zh-HK', 'en'])).toBe('zh-HK');
    expect(selectDemoLocale(null, ['en-US', 'zh-HK'])).toBe('en');
    expect(selectDemoLocale(null, [])).toBe('en');
  });
});
