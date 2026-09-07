import './element';
import { createWalletChecker } from './checker';
import type { CheckerOptions, WalletPayload } from './types';
import { createLocalizer, resolveLocale, translate } from './i18n';
import type { Locale } from './i18n';

export type WalletCheckModalOptions = Pick<CheckerOptions, 'coin' | 'network' | 'assetBaseUrl'> & { locale?: Locale };

let active = false;

export async function openWalletCheck(options: WalletCheckModalOptions): Promise<WalletPayload | null> {
  const locale = resolveLocale(options.locale);
  if (active) throw new Error(translate('已有钱包核对弹窗打开，请先完成或关闭。', locale));
  try {
    const validator = createWalletChecker(options);
    void validator.dispose();
  } catch (error) {
    throw new Error(translate(error instanceof Error ? error.message : String(error), locale));
  }
  if (!document.body || typeof HTMLDialogElement.prototype.showModal !== 'function') {
    throw new Error(translate('请在支持原生 Dialog 的浏览器页面加载后打开弹窗。', locale));
  }
  const host = document.createElement('div');
  host.dataset.walletCheckModal = '';
  const root = host.attachShadow({ mode: 'open' });
  host.lang = locale;
  root.innerHTML = `
    <style>
      dialog { box-sizing:border-box; border:1px solid #dce8e1; border-radius:20px; padding:0; width:min(760px,calc(100% - 24px)); max-height:calc(100dvh - 32px); overflow:auto; overscroll-behavior:contain; background:var(--wallet-check-background,#fff); color:var(--wallet-check-text,#19332d); box-shadow:0 24px 100px #102e3540; }
      dialog::backdrop { background:#16372d80; backdrop-filter:blur(3px); }
      .toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 22px; font:13px/1.5 system-ui,sans-serif; border-bottom:1px solid #edf1eb; }
      button { display:grid; place-items:center; width:36px; height:36px; background:transparent; border:0; border-radius:50%; padding:8px; color:inherit; cursor:pointer; }
      button:hover { background:#edf3ee; }
      button:focus-visible { outline:3px solid #86b99b; outline-offset:2px; }
      wallet-check { display:block; padding:12px; }
      @media(max-width:480px) { wallet-check { padding:0; } .toolbar { padding:12px 16px; } }
    </style>
    <dialog aria-label="钱包地址核对弹窗">
      <div class="toolbar"><span>WalletCheck · 收款地址核对</span><button type="button" autofocus aria-label="关闭核对弹窗" title="关闭"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
    </dialog>`;
  createLocalizer(root, translate)(locale);
  const dialog = root.querySelector('dialog')!;
  const checker = document.createElement('wallet-check');
  checker.lang = locale;
  checker.setAttribute('coin', options.coin);
  checker.setAttribute('network', options.network);
  checker.setAttribute('asset-base-url', options.assetBaseUrl ?? '/walletcheck-assets');
  dialog.append(checker);
  const previousFocus = document.activeElement;
  const previousOverflow = document.body.style.overflow;

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      dialog.close();
      host.remove();
      document.body.style.overflow = previousOverflow;
      active = false;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
    const finish = (payload: WalletPayload | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload);
    };
    checker.addEventListener('wallet-confirm', (event) => {
      finish({ ...(event as CustomEvent<WalletPayload>).detail });
    });
    root.querySelector('button')!.addEventListener('click', () => finish(null));
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(null); });
    dialog.addEventListener('close', () => finish(null));
    try {
      active = true;
      document.body.append(host);
      document.body.style.overflow = 'hidden';
      dialog.showModal();
    } catch (error) {
      settled = true;
      cleanup();
      reject(error);
    }
  });
}
