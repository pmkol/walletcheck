import { networks } from '../src/index';
import type { WalletCheckModalOptions } from '../src/modal';
import { createLocalizer, resolveLocale } from '../src/i18n';
import { translateDemo } from './locales';
import { selectDemoLocale } from './locale-preference';

const language = document.querySelector<HTMLSelectElement>('#language')!;
const localize = createLocalizer(document, translateDemo);
let savedLocale: string | null = null;
try { savedLocale = localStorage.getItem('walletcheck-locale'); } catch {}
language.value = selectDemoLocale(savedLocale, navigator.languages?.length ? navigator.languages : [navigator.language]);
const t = (message: string) => translateDemo(message, resolveLocale(language.value));

function updateLanguage(persist = false) {
  const locale = resolveLocale(language.value);
  document.documentElement.lang = locale;
  localize(locale);
  if (persist) {
    try { localStorage.setItem('walletcheck-locale', locale); } catch {}
  }
  updateCode();
}

language.addEventListener('change', () => updateLanguage(true));

const form = document.querySelector<HTMLFormElement>('#configuration')!;
const coinSelect = document.querySelector<HTMLSelectElement>('#coin')!;
const networkSelect = document.querySelector<HTMLSelectElement>('#network')!;
const openButton = document.querySelector<HTMLButtonElement>('#open-demo')!;
const copyButton = document.querySelector<HTMLButtonElement>('#copy-code')!;
const code = document.querySelector<HTMLElement>('#integration-code')!;
const output = document.querySelector<HTMLElement>('#output')!;
const status = document.querySelector<HTMLElement>('#demo-status')!;
const copyStatus = document.querySelector<HTMLElement>('#copy-status')!;
const debugMode = document.querySelector<HTMLInputElement>('#debug-mode')!;
const debugOutput = document.querySelector<HTMLElement>('#debug-output')!;

for (const [value, config] of Object.entries(networks)) {
  networkSelect.add(new Option(config.label, value));
}

function getOptions(): WalletCheckModalOptions {
  return {
    coin: coinSelect.value,
    network: networkSelect.value as WalletCheckModalOptions['network'],
    assetBaseUrl: `${import.meta.env.BASE_URL}walletcheck-assets`,
    locale: resolveLocale(language.value),
  };
}

function updateCode() {
  const options = getOptions();
  code.textContent = `import { openWalletCheck } from 'walletcheck-js/modal';\n\nconst result = await openWalletCheck(${JSON.stringify(options, null, 2)});\n\nif (result) {\n  const { coin, network, address } = result;\n  console.log({ coin, network, address });\n}`;
  copyStatus.textContent = '';
  status.textContent = t('参数准备好后，点击演示按钮体验完整流程。');
  output.textContent = t('尚无确认结果');
  debugOutput.hidden = true;
  debugOutput.textContent = '';
}

form.addEventListener('input', updateCode);
form.addEventListener('change', updateCode);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (openButton.disabled || !form.reportValidity()) return;
  const options = getOptions();
  openButton.disabled = true;
  output.textContent = t('等待弹窗内确认…');
  status.textContent = t('正在打开核对弹窗…');
  try {
    const { openWalletCheck } = await import('../src/modal');
    const result = await openWalletCheck(options, (debugResult) => {
      if (!debugMode.checked) return;
      debugOutput.hidden = false;
      debugOutput.textContent = JSON.stringify(debugResult, null, 2);
    });
    output.textContent = result ? JSON.stringify(result, null, 2) : 'null';
    if (debugMode.checked && result) {
      debugOutput.hidden = false;
      debugOutput.textContent = JSON.stringify({
        reason: result.status === 'rejected' ? result.reason : null,
        addressVerified: result.status === 'rejected' ? result.addressVerified : true,
        qrAddresses: result.status === 'rejected' ? result.qrAddresses : [result.payload.address],
        textAddresses: result.status === 'rejected' ? result.textAddresses : [result.payload.address],
        ocrText: result.status === 'rejected' ? result.ocrText : undefined,
        metadata: result.metadata,
      }, null, 2);
    }
    status.textContent = t(result ? '已确认：弹窗已关闭，三项参数已返回宿主。' : '用户已取消，没有提交钱包地址。');
  } catch (error) {
    output.textContent = t('未返回结果');
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    openButton.disabled = false;
    openButton.focus();
  }
});

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(code.textContent ?? '');
    copyStatus.textContent = t('代码已复制');
  } catch {
    copyStatus.textContent = t('浏览器不允许自动复制，请选中代码后手动复制。');
  }
});

updateLanguage();
