import type { Locale } from '../src/i18n';

export function selectDemoLocale(saved: string | null, languages: readonly string[]): Locale {
  if (saved === 'en' || saved === 'zh-CN' || saved === 'zh-HK') return saved;
  for (const language of languages) {
    const parts = language.toLowerCase().split('-');
    if (parts[0] === 'en') return 'en';
    if (parts[0] !== 'zh') continue;
    if (parts.includes('hant')) return 'zh-HK';
    if (parts.includes('hans')) return 'zh-CN';
    return parts.some((part) => ['hk', 'mo', 'tw'].includes(part)) ? 'zh-HK' : 'zh-CN';
  }
  return 'en';
}
