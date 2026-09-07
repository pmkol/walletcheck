import { createWalletChecker } from './checker';
import type { WalletChecker } from './checker';
import { isNetwork, networks } from './networks';
import type { FailureReason, Stage, VerificationResult } from './types';
import { styles } from './ui/styles';
import { MAX_FILE_BYTES } from './image-limits';
import { createLocalizer, resolveLocale, translate } from './i18n';
import type { Locale } from './i18n';

const failures: Record<FailureReason, string> = {
  'no-address': '没有识别到完整地址，请上传更清晰的图片。',
  'invalid-address': '识别出的地址未通过格式或校验和检查，可能存在文字识别误差。请检查完整地址或换用清晰图片。',
  'unsupported-qr': '二维码不是支持的地址格式。请使用纯地址二维码。',
  'network-mismatch': '识别到的网络与当前配置不一致，请检查截图和所选网络。',
  'coin-mismatch': '识别到的币种与当前配置不一致，请检查截图和所选币种。',
  'missing-coin': '未识别到截图中的币种标识，请保留币种名称后重新核对。',
  'missing-network': '未识别到明确的网络名称，请保留网络信息后重新核对。',
  'ambiguous-coin': '截图包含多个或有歧义的币种标识，无法确认。',
  'ambiguous-network': '截图中的网络信息不唯一或有歧义，无法确认。',
  'multiple-addresses': '检测到多个不同地址，请裁剪到一个收款区域。',
  'missing-qr': '没有识别到二维码，双重核对不能通过。',
  'missing-text': '没有识别到完整文字地址。请上传清晰原图，并保留完整地址及二维码。',
  'address-conflict': '文字地址与二维码地址不一致，请勿确认。',
};

const stages: Record<Stage, string> = {
  preparing: '正在处理图片', qr: '正在识别二维码',
  'ocr-loading': '正在加载本地文字识别引擎', ocr: '正在识别地址、币种和网络',
};

export class WalletCheckElement extends HTMLElement {
  static observedAttributes = ['coin', 'network', 'asset-base-url', 'lang'];
  private readonly root: ShadowRoot;
  private readonly localize: (locale: Locale) => void;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly buttonPositions = new Map<HTMLButtonElement, Comment>();
  private checker?: WalletChecker;
  private file?: Blob;
  private previewUrl?: string;
  private generation = 0;
  private result?: Extract<VerificationResult, { status: 'matched' }>;
  private selection?: { left: number; top: number; width: number; height: number };
  private pointerStart?: { left: number; top: number };

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>${styles}</style>
      <section class="panel" aria-label="钱包地址核对">
        <header><span class="mark" aria-hidden="true">↗</span><div><h2>核对收款地址</h2><p>图片识别 · 本地处理 · 隐私优先</p></div><div class="configuration" aria-label="待核对币种和网络"><span id="coin"></span><span id="network"></span></div></header>
        <div class="drop" tabindex="0" role="button" aria-label="选择图片，也可以拖拽或粘贴图片">
          <span class="upload-icon" aria-hidden="true">＋</span><strong>选择一张收款图片</strong>
          <span>拖拽至此，或聚焦后粘贴图片</span><small>PNG / JPEG / WebP · 最大 5 MB</small>
        </div>
        <input id="file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
        <div id="preview" hidden><div class="image-stage"><img alt="待核对的收款图片" draggable="false"><div class="selection" hidden></div></div>
          <div class="crop-tools"><span>框选时保留币种、网络、完整地址及二维码</span><button id="crop" type="button" disabled>应用裁剪</button></div>
        </div>
        <div class="actions"><button id="verify" type="button" disabled>开始核对</button><button id="toggle-preview" type="button" aria-controls="preview" aria-expanded="false" hidden>查看图片</button><button id="clear" type="button" title="清除当前图片" hidden>清除图片</button></div>
        <div id="metadata" hidden aria-label="核对结果">
          <p id="coin-check"><span>币种：</span><span class="check-icon" role="img"></span><span class="check-detail" id="result-coin"></span></p>
          <p id="network-check"><span>网络：</span><span class="check-icon" role="img"></span><span class="check-detail" id="result-network"></span></p>
          <p id="address-check"><span id="address-label">地址：</span><span class="check-icon" role="img"></span><code class="check-detail" id="address" aria-labelledby="address-label"></code></p>
        </div>
        <div id="status" role="status" aria-live="polite">请上传包含币种、网络、钱包地址和二维码的图片。</div>
        <div id="result" hidden>
          <button id="confirm" type="button">确认钱包地址</button>
        </div>
      </section>`;
    this.localize = createLocalizer(this.root, translate);
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button')) {
      this.buttons.set(`#${button.id}`, button);
    }
    this.get<HTMLInputElement>('#file').addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      if (input.files?.[0]) this.acceptFile(input.files[0]);
      input.value = '';
    });
    const drop = this.get('.drop');
    drop.addEventListener('click', () => { if (!this.file) this.get<HTMLInputElement>('#file').click(); });
    drop.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!this.file) this.get<HTMLInputElement>('#file').click();
      }
    });
    this.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = this.file ? 'none' : 'copy';
    });
    this.addEventListener('drop', (event) => {
      event.preventDefault();
      if (event.dataTransfer?.files[0]) this.acceptFile(event.dataTransfer.files[0]);
    });
    this.addEventListener('paste', (event) => {
      const file = [...(event.clipboardData?.items ?? [])]
        .find((item) => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
      if (file) { event.preventDefault(); this.acceptFile(file); }
    });
    this.get('#verify').addEventListener('click', () => { void this.verify(); });
    this.get('#clear').addEventListener('click', () => this.clear());
    this.get('#toggle-preview').addEventListener('click', () => this.showPreview(Boolean(this.get('#preview').hidden)));
    this.get('#confirm').addEventListener('click', () => this.confirm());
    this.get('#crop').addEventListener('click', () => { void this.crop(); });
    const imageStage = this.get('.image-stage');
    imageStage.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !this.file) return;
      this.get<HTMLButtonElement>('#confirm').disabled = true;
      imageStage.setPointerCapture(event.pointerId);
      this.pointerStart = this.position(event);
      this.selection = undefined;
      this.get('.selection').hidden = true;
      this.get<HTMLButtonElement>('#crop').disabled = true;
    });
    imageStage.addEventListener('pointermove', (event) => {
      if (!this.pointerStart) return;
      const end = this.position(event);
      this.selection = {
        left: Math.min(end.left, this.pointerStart.left), top: Math.min(end.top, this.pointerStart.top),
        width: Math.abs(end.left - this.pointerStart.left), height: Math.abs(end.top - this.pointerStart.top),
      };
      const selection = this.get('.selection');
      selection.hidden = false;
      for (const [key, value] of Object.entries(this.selection)) {
        selection.style.setProperty(key, `${value * 100}%`);
      }
    });
    imageStage.addEventListener('pointerup', () => {
      if (!this.pointerStart) return;
      this.invalidate();
      this.status('正在框选收款区域，应用裁剪后需要重新核对。');
      this.pointerStart = undefined;
      this.get<HTMLButtonElement>('#crop').disabled = !this.selection
        || this.selection.width < 0.01 || this.selection.height < 0.01;
    });
    imageStage.addEventListener('pointercancel', () => { this.pointerStart = undefined; this.invalidate(); });
  }

  connectedCallback() { this.configure(); }

  disconnectedCallback() {
    this.clear();
    void this.checker?.dispose().catch(() => undefined);
    this.checker = undefined;
  }

  attributeChangedCallback() { if (this.isConnected) this.configure(); }

  private get<ElementType extends HTMLElement = HTMLElement>(selector: string): ElementType {
    return (this.root.querySelector<ElementType>(selector) ?? this.buttons.get(selector)) as ElementType;
  }

  private removeButtons() {
    for (const button of this.buttons.values()) {
      const position = document.createComment('');
      button.replaceWith(position);
      this.buttonPositions.set(button, position);
    }
  }

  private restoreButtons() {
    for (const [button, position] of this.buttonPositions) position.replaceWith(button);
    this.buttonPositions.clear();
  }

  private configure() {
    this.restoreButtons();
    this.localize(resolveLocale(this.getAttribute('lang')));
    this.invalidate();
    void this.checker?.dispose().catch(() => undefined);
    this.checker = undefined;
    const coin = this.getAttribute('coin') ?? '';
    const network = this.getAttribute('network') ?? '';
    this.get('#coin').textContent = coin.toUpperCase() || this.t('未设置币种');
    this.get('#network').textContent = isNetwork(network) ? networks[network].label : this.t('未设置有效网络');
    try {
      if (!isNetwork(network)) throw new Error('请由宿主设置有效的 network 属性。');
      this.checker = createWalletChecker({
        coin, network,
        assetBaseUrl: this.getAttribute('asset-base-url') ?? '/walletcheck-assets',
        onProgress: (stage, progress) => {
          this.status(`${stages[stage]}${progress === undefined ? '…' : ` ${Math.round(progress * 100)}%`}`);
          this.emit('wallet-progress', { stage, progress });
        },
      });
      this.status('请上传包含币种、网络、钱包地址和二维码的图片。');
    } catch (error) { this.status(this.message(error), true); }
    this.get<HTMLButtonElement>('#verify').disabled = !this.file || !this.checker;
  }

  private invalidate() {
    this.generation += 1;
    this.checker?.cancel();
    this.restoreButtons();
    this.result = undefined;
    this.get('#result').hidden = true;
    this.get('#address').textContent = '';
    this.get('#result-coin').textContent = '';
    this.get('#result-network').textContent = '';
    this.get('#metadata').hidden = true;
    this.get('.actions').hidden = false;
    this.get('#toggle-preview').hidden = true;
    if (this.file) this.showPreview(true);
    this.setResetAction(false);
    this.get<HTMLButtonElement>('#verify').disabled = !this.file || !this.checker;
    this.get<HTMLButtonElement>('#confirm').disabled = true;
  }

  private acceptFile(file: Blob) {
    if (this.file) return;
    this.setFile(file);
  }

  private setResetAction(started: boolean) {
    const button = this.get('#clear');
    const actions = this.get('.actions');
    button.textContent = this.t(started ? '重新核对' : '清除图片');
    button.title = this.t(started ? '清空图片并开始新的核对' : '清除当前图片');
    this.get('#verify').hidden = started;
    if (started) actions.prepend(button);
    else actions.append(button);
  }

  private setFile(file: Blob) {
    this.invalidate();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > MAX_FILE_BYTES) {
      this.clear(); this.status('请选择不超过 5 MB 的 PNG、JPEG 或 WebP 图片。', true); return;
    }
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.file = file;
    this.get('.drop').hidden = true;
    this.get<HTMLInputElement>('#file').disabled = true;
    this.previewUrl = URL.createObjectURL(file);
    this.get<HTMLImageElement>('img').src = this.previewUrl;
    this.showPreview(true);
    this.get('#clear').hidden = false;
    this.get<HTMLButtonElement>('#verify').disabled = !this.checker;
    this.selection = undefined;
    this.pointerStart = undefined;
    this.get('.selection').hidden = true;
    this.get<HTMLButtonElement>('#crop').disabled = true;
    this.status('图片已就绪。可直接核对，或先裁剪收款区域。');
  }

  private clear() {
    this.file = undefined;
    this.get('.drop').hidden = false;
    this.get<HTMLInputElement>('#file').disabled = false;
    this.invalidate();
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = undefined;
    this.get<HTMLImageElement>('img').removeAttribute('src');
    this.showPreview(false);
    this.get('#clear').hidden = true;
    this.selection = undefined;
    this.pointerStart = undefined;
    this.status('请上传包含币种、网络、钱包地址和二维码的图片。');
  }

  private async verify() {
    if (!this.file || !this.checker) return;
    this.invalidate();
    this.setResetAction(true);
    const generation = this.generation;
    this.get<HTMLButtonElement>('#verify').disabled = true;
    this.get('.actions').hidden = true;
    this.showPreview(false);
    this.get('#toggle-preview').hidden = true;
    this.removeButtons();
    try {
      const result = await this.checker.verify(this.file);
      if (generation !== this.generation) return;
      this.emit('wallet-result', result);
      if (generation !== this.generation) return;
      this.showChecks(result);
      if (result.status === 'rejected') {
        const reasons = new Set<FailureReason>([result.reason]);
        for (const field of ['coin', 'network'] as const) {
          const status = result.metadata[field].status;
          if (status !== 'matched') reasons.add(status === 'mismatch' ? `${field}-mismatch` : `${status}-${field}`);
        }
        this.status([...reasons].map((reason) => failures[reason]).join('\n'), true);
        return;
      }
      this.result = result;
      this.get('#result').hidden = false;
      this.get<HTMLButtonElement>('#confirm').disabled = false;
      this.status('地址核对通过，请检查完整地址及币种、网络后确认。');
    } catch (error) {
      if (generation !== this.generation) return;
      this.status(this.message(error), true);
      this.emit('wallet-error', { message: this.message(error) });
    } finally {
      if (generation === this.generation) {
        this.restoreButtons();
        this.get('.actions').hidden = false;
        this.get('#toggle-preview').hidden = !this.file;
        this.get<HTMLButtonElement>('#verify').disabled = Boolean(this.get('#verify').hidden) || !this.file || !this.checker;
      }
    }
  }

  private showPreview(visible: boolean) {
    this.get('#preview').hidden = !visible;
    this.get('#toggle-preview').textContent = this.t(visible ? '收起图片' : '查看图片');
    this.get('#toggle-preview').setAttribute('aria-expanded', String(visible));
  }

  private confirm() {
    if (!this.result || this.get<HTMLButtonElement>('#confirm').disabled) return;
    const payload = { ...this.result.payload };
    this.result = undefined;
    this.get<HTMLButtonElement>('#confirm').disabled = true;
    this.status('已确认，地址信息已交给宿主项目。');
    this.emit('wallet-confirm', payload);
  }

  private showChecks(result: VerificationResult) {
    const labels = { matched: '核对通过', missing: '未识别到', mismatch: '不一致', ambiguous: '有歧义' };
    this.get('#metadata').hidden = false;
    for (const field of ['coin', 'network'] as const) {
      const check = result.metadata[field];
      const detected = check.detected.map((value) => isNetwork(value) ? networks[value].label : value).join('、');
      this.showCheck(field, check.status === 'matched', labels[check.status]);
      this.get(`#result-${field}`).textContent = detected;
    }
    const passed = result.status === 'matched' || result.addressVerified;
    this.showCheck('address', passed, passed ? '核对通过' : '未通过核对');
    this.get('#address').textContent = result.status === 'matched' ? result.payload.address
      : [...new Set([...result.qrAddresses, ...result.textAddresses])].join(' / ');
  }

  private showCheck(field: string, passed: boolean, label: string) {
    const row = this.get(`#${field}-check`);
    row.dataset.passed = String(passed);
    const icon = row.querySelector<HTMLElement>('.check-icon')!;
    icon.textContent = passed ? '✓' : '✕';
    icon.setAttribute('aria-label', this.t(label));
  }

  private position(event: PointerEvent) {
    const rectangle = this.get('img').getBoundingClientRect();
    return {
      left: Math.max(0, Math.min(1, (event.clientX - rectangle.left) / rectangle.width)),
      top: Math.max(0, Math.min(1, (event.clientY - rectangle.top) / rectangle.height)),
    };
  }

  private async crop() {
    if (!this.file || !this.selection) return;
    const selection = { ...this.selection };
    this.invalidate();
    const generation = this.generation;
    const canvas = document.createElement('canvas');
    try {
      const bitmap = await createImageBitmap(this.file, { imageOrientation: 'from-image' });
      try {
        if (generation !== this.generation) return;
        if (bitmap.width * bitmap.height > 24_000_000) throw new Error('图片像素过大，请先在设备上缩小图片。');
        const left = Math.floor(selection.left * bitmap.width);
        const top = Math.floor(selection.top * bitmap.height);
        canvas.width = Math.max(1, Math.floor(selection.width * bitmap.width));
        canvas.height = Math.max(1, Math.floor(selection.height * bitmap.height));
        const drawing = canvas.getContext('2d');
        if (!drawing) throw new Error('浏览器不支持 Canvas');
        drawing.drawImage(bitmap, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      } finally { bitmap.close(); }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (generation !== this.generation) return;
      if (!blob) throw new Error('裁剪失败，请重试');
      this.setFile(blob);
    } catch (error) { if (generation === this.generation) this.status(this.message(error), true); }
    finally { canvas.width = 0; canvas.height = 0; }
  }

  private status(message: string, error = false) {
    const status = this.get('#status');
    status.textContent = this.t(message);
    status.dataset.error = String(error);
  }

  private t(message: string) { return translate(message, resolveLocale(this.getAttribute('lang'))); }

  private message(error: unknown) { return this.t(error instanceof Error ? error.message : String(error)); }

  private emit(name: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail: structuredClone(detail), bubbles: true, composed: true }));
  }
}

if (!customElements.get('wallet-check')) customElements.define('wallet-check', WalletCheckElement);

declare global {
  interface HTMLElementTagNameMap { 'wallet-check': WalletCheckElement }
}
