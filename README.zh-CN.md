# WalletCheck

[English](README.md) | **简体中文** | [繁體中文](README.zh-HK.md)

基于 TypeScript 的纯前端钱包地址核对 SDK，不依赖 Vue / React，提供弹窗、原生组件和无界面三种接入方式。

接入方指定币种和网络，SDK 在浏览器中识别截图中的二维码与文字，核对地址格式、地址一致性、币种和网络。无需传入预期地址，不上传图片，OCR 按需加载。

[在线演示](https://pmkol.github.io/walletcheck/)

## 安装

在本仓库使用 Node.js 24 构建安装包：

```bash
npm ci
npm run build
npm pack
```

在接入项目中安装生成的文件：

```bash
npm install /path/to/walletcheck-js-0.1.0.tgz
```

### OCR 资源

在本仓库执行，将 OCR 资源复制到接入项目的静态目录：

```bash
npm run assets:ocr -- /path/to/host/public/walletcheck-assets
```

该目录需可通过 `assetBaseUrl` 访问，默认 `/walletcheck-assets`。资源不包含在 SDK 安装包中，必须整套部署，建议同源提供；资源路径不能回退为 HTML 页面或附件下载。

## 弹窗接入

在按钮点击事件中调用，上传、识别及人工确认均在弹窗内完成：

```ts
async function verifyWallet() {
  try {
    const { openWalletCheck } = await import('walletcheck-js/modal');
    const result = await openWalletCheck({
      coin: 'USDT',
      network: 'arbitrum',
      assetBaseUrl: '/walletcheck-assets',
      locale: 'zh-CN',
    });
    if (result === null) return;
    console.log(result.coin, result.network, result.address);
  } catch (error) {
    console.error('无法打开核对弹窗', error);
  }
}
```

返回类型为 `Promise<WalletPayload | null>`：

| 情况 | 返回行为 |
| --- | --- |
| 核对通过并由用户确认 | 返回 `{ coin, network, address }`，关闭弹窗 |
| 用户关闭或按 Esc | 返回 `null` |
| 核对失败或识别异常 | 弹窗内显示原因，Promise 继续等待，不返回地址 |
| 参数错误、重复打开或浏览器不支持弹窗 | Promise 拒绝 |

SDK 不提交业务请求，由接入程序收到确认结果后自行发送后端。

## 参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `coin` | `string` | 是 | 如 `USDT`、`USDC`；去除首尾空白并转大写，最多 20 字符，首位为字母或数字，其余可含 `.`、`_`、`-` |
| `network` | `Network` | 是 | 下表中的主网标识，返回结果使用相同标识 |
| `assetBaseUrl` | `string` | 否 | OCR 静态资源路径，默认 `/walletcheck-assets` |
| `locale` | `'en' \| 'zh-CN' \| 'zh-HK'` | 否 | 仅弹窗界面语言，默认 `zh-CN`；不改变识别规则或返回参数 |

| `network` | 网络 |
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

### 币种选项

`src/coins.ts` 中的 `projectCoins` 会打包进 `walletcheck-js/modal` 和 `walletcheck-js/element`。它同时定义演示页下拉选项，并控制弹窗和 Web Component 在币种不匹配时显示的候选币种：只显示 OCR 结果中存在于 `projectCoins` 的币种，没有交集则留空。每次核对仍只有一个目标 `coin`；无界面 SDK 的 `metadata.coin.detected` 保留完整 OCR 结果。修改列表后需重新执行 `npm run build`。

## 无界面 SDK

适用于自行实现上传及确认界面的项目：

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

除 `coin`、`network`、`assetBaseUrl` 外，`createWalletChecker` 支持 `onProgress(stage, progress?)` 和自定义 `recognizer`。进度仅表示当前阶段；阶段为 `preparing`、`qr`、`ocr-loading`、`ocr`。

- `verify(file)` 返回 `VerificationResult`：通过时为 `matched`，包含 `payload`、`sources`、`metadata`；失败时为 `rejected`，包含 `reason`、`addressVerified`、`qrAddresses`、`textAddresses`、`metadata`。运行异常会拒绝 Promise。
- `addressVerified` 表示地址格式及二维码与文字地址核对是否通过，不代表币种、网络或整体验证通过。
- `metadata` 包含币种与网络各自的 `status`、`expected`、`detected`；状态为 `matched`、`missing`、`mismatch` 或 `ambiguous`。
- `cancel()` 取消当前任务，以 `AbortError` 拒绝 Promise；新 `verify()` 自动取消旧任务。同一实例可复用，`dispose()` 释放后不可再使用。
- `matched` 不代表用户已确认，自定义界面需自行完成确认。公开类型见 `src/types.ts`。

## 原生组件

```html
<wallet-check
  coin="USDT"
  network="arbitrum"
  lang="zh-CN"
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
| `wallet-confirm` | 用户确认后的 `{ coin, network, address }` |
| `wallet-result` | `VerificationResult`，不代表用户确认 |
| `wallet-progress` | `{ stage, progress? }` |
| `wallet-error` | `{ message }` |

事件冒泡并穿透 Shadow DOM。组件及弹窗须在浏览器端加载，SSR 项目使用客户端动态导入。无构建工具的项目可直接导入构建后的 ES 模块，但必须部署完整 `dist/`，不能只复制入口文件。

## 使用要求

- 支持 PNG / JPEG / WebP，最大 5 MB；截图须包含完整文字地址、二维码、币种和网络。默认 OCR 使用英文模型，不保证识别纯中文标识。
- 地址按网络检查编码、长度及适用的校验和；不猜测、纠错或补全地址。代币截图建议使用纯地址二维码。
- 币种和网络按截图文字中的独立关键词及已支持别名匹配，不区分大小写，不要求固定顺序、括号或分隔符（例如 `USDC Arbitrum`）。重复出现同一项不影响结果，出现其他已识别币种、网络或测试网标识则不通过；链接及明确否定、手续费提示不作为正向证据，未收录的名称不保证识别。
- 对位置相邻、对齐且符合长度条件的两行 EVM 地址，默认 OCR 会局部重排并重新识别。只有两次 OCR 的 40 位正文完全一致才接受结果，不使用二维码内容补写字符。
- 多二维码图片中的 HTTP/HTTPS 链接（如 APP 下载页）不作为钱包地址，不访问链接或从中提取地址；仍要求存在有效钱包二维码。多个不同钱包地址、无效地址或不支持的支付协议不会因此放行。
- 核对仅确认地址格式和截图内容一致，不证明钱包归属、链上状态或资产接收能力。后端仍需独立检查参数和业务权限。

## 本地开发

```bash
npm run dev
npm test
npm run build
```

默认开发地址为 `http://localhost:21000`，端口被占用时直接报错，不自动切换。开发服务启动前自动准备 OCR 资源。浏览器测试需先构建并准备资源，以 `npx playwright install chromium` 安装 Chromium 后执行 `npm run test:browser`。

## 静态演示页

```bash
npm run build:demo
npm run preview:demo
```

将 `dist-demo/` 中的全部内容（包括 `walletcheck-assets/` 和 `.nojekyll`）部署至 GitHub Pages 等静态托管服务。相对资源路径兼容域名根目录和仓库子目录。本地预览地址为 `http://localhost:21000`，请通过 HTTP(S) 访问，不要直接用 `file://` 打开。该构建与 `dist/` 中的 SDK 产物相互独立。
