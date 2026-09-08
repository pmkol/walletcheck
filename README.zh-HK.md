# WalletCheck

[English](README.md) | [简体中文](README.zh-CN.md) | **繁體中文**

以 TypeScript 實作的純前端錢包地址核對 SDK，不依賴 Vue / React，提供彈窗、原生元件和無介面三種整合方式。

接入方指定幣種和網路，SDK 在瀏覽器中辨識截圖中的 QR 碼與文字，核對地址格式、地址一致性、幣種和網路。無需傳入預期地址，不上傳圖片，OCR 按需載入。

[線上示範](https://pmkol.github.io/walletcheck/)

## 安裝

在本儲存庫使用 Node.js 24 建置安裝套件：

```bash
npm ci
npm run build
npm pack
```

在接入專案中安裝產生的檔案：

```bash
npm install /path/to/walletcheck-js-0.1.0.tgz
```

### OCR 資源

在本儲存庫執行，將 OCR 資源複製到接入專案的靜態目錄：

```bash
npm run assets:ocr -- /path/to/host/public/walletcheck-assets
```

該目錄須可透過 `assetBaseUrl` 存取，預設 `/walletcheck-assets`。資源不包含在 SDK 安裝套件中，必須整套部署，建議使用同源服務；資源路徑不能回傳 HTML 頁面或觸發附件下載。

## 彈窗整合

在按鈕點擊事件中呼叫，上傳、辨識及人工確認均在彈窗內完成：

```ts
async function verifyWallet() {
  try {
    const { openWalletCheck } = await import('walletcheck-js/modal');
    const result = await openWalletCheck({
      coin: 'USDT',
      network: 'arbitrum',
      assetBaseUrl: '/walletcheck-assets',
      locale: 'zh-HK',
    });
    if (result === null) return;
    console.log(result.coin, result.network, result.address);
  } catch (error) {
    console.error('無法開啟核對彈窗', error);
  }
}
```

回傳型別為 `Promise<WalletPayload | null>`：

| 情況 | 回傳行為 |
| --- | --- |
| 核對通過並由使用者確認 | 回傳 `{ coin, network, address }`，關閉彈窗 |
| 使用者關閉或按 Esc | 回傳 `null` |
| 核對失敗或辨識異常 | 彈窗內顯示原因，Promise 繼續等待，不回傳地址 |
| 參數錯誤、重複開啟或瀏覽器不支援彈窗 | Promise 拒絕 |

SDK 不提交業務請求，由接入程式收到確認結果後自行傳送至後端。

## 參數

| 參數 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `coin` | `string` | 是 | 如 `USDT`、`USDC`；去除首尾空白並轉大寫，最多 20 字元，首位為字母或數字，其餘可含 `.`、`_`、`-` |
| `network` | `Network` | 是 | 下表中的主網標識，回傳結果使用相同標識 |
| `assetBaseUrl` | `string` | 否 | OCR 靜態資源路徑，預設 `/walletcheck-assets` |
| `locale` | `'en' \| 'zh-CN' \| 'zh-HK'` | 否 | 僅彈窗介面語言，預設 `zh-CN`；不改變辨識規則或回傳參數 |

| `network` | 網路 |
| --- | --- |
| `ethereum` | Ethereum |
| `bsc` | BNB Smart Chain |
| `polygon` | Polygon |
| `arbitrum` | Arbitrum One |
| `optimism` | Optimism |
| `base` | Base |
| `tron` | TRON |
| `bitcoin` | Bitcoin |
| `solana` | Solana |

### 幣種選項

`src/coins.ts` 中的 `projectCoins` 會打包進 `walletcheck-js/modal` 和 `walletcheck-js/element`。它同時定義示範頁下拉選項，並控制彈窗和 Web Component 在幣種不匹配時顯示的候選幣種：只顯示 OCR 結果中存在於 `projectCoins` 的幣種，沒有交集則留空。每次核對仍只有一個目標 `coin`；無介面 SDK 的 `metadata.coin.detected` 保留完整 OCR 結果。修改列表後須重新執行 `npm run build`。

## 無介面 SDK

適用於自行實作上傳及確認介面的專案：

```ts
import { createWalletChecker } from 'walletcheck-js';

async function checkImage(file: Blob) {
  const checker = createWalletChecker({
    coin: 'USDT',
    network: 'arbitrum',
    onProgress(stage, progress) {
      console.log(stage, progress);
    },
  });
  try {
    const result = await checker.verify(file);
    console.log(result.status === 'matched' ? result.payload : result.reason);
    return result;
  } finally {
    await checker.dispose();
  }
}
```

除 `coin`、`network`、`assetBaseUrl` 外，`createWalletChecker` 支援 `onProgress(stage, progress?)` 和自訂 `recognizer`。進度僅表示目前階段；階段為 `preparing`、`qr`、`ocr-loading`、`ocr`。

- `verify(file)` 回傳 `VerificationResult`：通過時為 `matched`，包含 `payload`、`sources`、`metadata`；失敗時為 `rejected`，包含 `reason`、`addressVerified`、`qrAddresses`、`textAddresses`、`metadata`。執行異常會拒絕 Promise。
- `addressVerified` 表示地址格式及 QR 碼與文字地址核對是否通過，不代表幣種、網路或整體驗證通過。
- `metadata` 包含幣種與網路各自的 `status`、`expected`、`detected`；狀態為 `matched`、`missing`、`mismatch` 或 `ambiguous`。
- `cancel()` 取消目前工作，以 `AbortError` 拒絕 Promise；新的 `verify()` 自動取消舊工作。同一實例可重複使用，`dispose()` 釋放後不可再使用。
- `matched` 不代表使用者已確認，自訂介面須自行完成確認。公開型別見 `src/types.ts`。

## 原生元件

```html
<wallet-check
  coin="USDT"
  network="arbitrum"
  lang="zh-HK"
  asset-base-url="/walletcheck-assets"
></wallet-check>
```

```ts
import 'walletcheck-js/element';

document.querySelector('wallet-check')!.addEventListener('wallet-confirm', (event) => {
  console.log((event as CustomEvent).detail);
});
```

| 事件 | `detail` |
| --- | --- |
| `wallet-confirm` | 使用者確認後的 `{ coin, network, address }` |
| `wallet-result` | `VerificationResult`，不代表使用者確認 |
| `wallet-progress` | `{ stage, progress? }` |
| `wallet-error` | `{ message }` |

事件冒泡並穿透 Shadow DOM。元件及彈窗須在瀏覽器端載入，SSR 專案使用用戶端動態匯入。無建置工具的專案可直接匯入建置後的 ES 模組，但必須部署完整 `dist/`，不能只複製入口檔案。

## 使用要求

- 支援 PNG / JPEG / WebP，最大 5 MB；截圖須包含完整文字地址、QR 碼、幣種和網路。預設 OCR 使用英文模型，不保證辨識純中文標識。
- 地址按網路檢查編碼、長度及適用的檢查碼；不猜測、修正或補全地址。代幣截圖建議使用純地址 QR 碼。
- 幣種和網路按截圖文字中的獨立關鍵詞及已支援別名匹配，不區分大小寫，不要求固定順序、括號或分隔符（例如 `USDC Arbitrum`）。重複出現同一項不影響結果，出現其他已辨識幣種、網路或測試網標識則不通過；連結及明確否定、手續費提示不作為正向證據，未收錄的名稱不保證辨識。
- 對位置相鄰、對齊且符合長度條件的兩行 EVM 地址，預設 OCR 會局部重排並重新辨識。只有兩次 OCR 的 40 位正文完全一致才接受結果，不使用 QR 碼內容補寫字元。
- 多 QR 碼圖片中的 HTTP/HTTPS 連結（如 App 下載頁）不作為錢包地址，不存取連結或從中擷取地址；仍要求存在有效錢包 QR 碼。多個不同錢包地址、無效地址或不支援的支付協定不會因此放行。
- 核對僅確認地址格式和截圖內容一致，不證明錢包歸屬、鏈上狀態或資產接收能力。後端仍須獨立檢查參數和業務權限。

## 本機開發

```bash
npm run dev
npm test
npm run build
```

預設開發地址為 `http://localhost:21000`，連接埠被占用時直接報錯，不自動切換。開發服務啟動前自動準備 OCR 資源。瀏覽器測試須先建置並準備資源，以 `npx playwright install chromium` 安裝 Chromium 後執行 `npm run test:browser`。

## 靜態示範頁

```bash
npm run build:demo
npm run preview:demo
```

將 `dist-demo/` 中的全部內容（包括 `walletcheck-assets/` 和 `.nojekyll`）部署至 GitHub Pages 等靜態託管服務。相對資源路徑相容於網域根目錄和儲存庫子目錄。本機預覽地址為 `http://localhost:21000`，請透過 HTTP(S) 存取，不要直接用 `file://` 開啟。該建置與 `dist/` 中的 SDK 產物相互獨立。
