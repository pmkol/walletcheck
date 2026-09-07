# WalletCheck

**English** | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-HK.md)

A browser-only TypeScript SDK for checking wallet addresses in screenshots. No Vue or React dependency. Integrate using a modal, a native Web Component, or the headless SDK.

Provide a coin and network. WalletCheck reads QR codes and text, validates the address format, compares the two address sources, and checks the displayed coin and network. No expected address is required. Images stay in the browser; OCR loads on demand.

[Live demo](https://pmkol.github.io/walletcheck/)

## Installation

Build the package in this repository with Node.js 24:

```bash
npm ci
npm run build
npm pack
```

Install the generated package in your application:

```bash
npm install /path/to/walletcheck-js-0.1.0.tgz
```

### OCR assets

Run this in the repository to copy assets into your application's public directory:

```bash
npm run assets:ocr -- /path/to/host/public/walletcheck-assets
```

Serve the complete directory at `assetBaseUrl` (default: `/walletcheck-assets`). Assets are not included in the SDK package. Same-origin hosting is recommended. Asset requests must not fall back to HTML pages or trigger attachment downloads.

## Modal integration

Call from a button click handler. Upload, recognition, and user confirmation happen inside the dialog:

```ts
async function verifyWallet() {
  try {
    const { openWalletCheck } = await import('walletcheck-js/modal');
    const result = await openWalletCheck({
      coin: 'USDT',
      network: 'arbitrum',
      assetBaseUrl: '/walletcheck-assets',
      locale: 'en',
    });
    if (result === null) return;
    console.log(result.coin, result.network, result.address);
  } catch (error) {
    console.error('Unable to open verification dialog', error);
  }
}
```

Returns `Promise<WalletPayload | null>`:

| Outcome | Behavior |
| --- | --- |
| All checks pass and the user confirms | Returns `{ coin, network, address }` and closes the dialog |
| User closes the dialog or presses Esc | Returns `null` |
| Verification fails or recognition errors occur | Displays errors; the Promise keeps waiting and no address is returned |
| Invalid options, another dialog is open, or unsupported browser | Rejects the Promise |

The SDK does not make business API requests. Your application decides whether and how to send the confirmed result to its backend.

## Options

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `coin` | `string` | Yes | For example `USDT` or `USDC`. Trimmed and uppercased; up to 20 characters, starting with a letter or digit. Remaining characters may also include `.`, `_`, and `-` |
| `network` | `Network` | Yes | Mainnet identifier below; the same identifier is returned |
| `assetBaseUrl` | `string` | No | OCR asset URL, default `/walletcheck-assets` |
| `locale` | `'en' \| 'zh-CN' \| 'zh-HK'` | No | Modal UI language only, default `zh-CN`. Does not change recognition rules or payloads |

| `network` | Network |
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

## Headless SDK

Use this when you provide your own upload and confirmation UI:

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

In addition to `coin`, `network`, and `assetBaseUrl`, the headless SDK accepts `onProgress(stage, progress?)` and a custom `recognizer`. Stages are `preparing`, `qr`, `ocr-loading`, and `ocr`; progress describes the current stage only.

- `verify(file)` returns `VerificationResult`. A `matched` result contains `payload`, `sources`, and `metadata`. A `rejected` result contains `reason`, `addressVerified`, `qrAddresses`, `textAddresses`, and `metadata`. Runtime errors reject the Promise.
- `addressVerified` reports address-format and QR/text consistency checks independently; it does not mean the coin, network, or overall verification passed.
- `metadata` contains `coin` and `network`, each with `status`, `expected`, and `detected`. Status is `matched`, `missing`, `mismatch`, or `ambiguous`.
- `cancel()` aborts the current task with `AbortError`. A new `verify()` cancels the previous task. Instances can be reused until `dispose()` releases their resources.
- `matched` is not user confirmation. Your UI must handle confirmation separately. Public types are in `src/types.ts`.

## Web Component

```html
<wallet-check
  coin="USDT"
  network="arbitrum"
  lang="en"
  asset-base-url="/walletcheck-assets"
></wallet-check>
```

```ts
import 'walletcheck-js/element';

document.querySelector('wallet-check')!.addEventListener('wallet-confirm', (event) => {
  console.log((event as CustomEvent).detail);
});
```

| Event | `detail` |
| --- | --- |
| `wallet-confirm` | User-confirmed `{ coin, network, address }` |
| `wallet-result` | `VerificationResult`, not user confirmation |
| `wallet-progress` | `{ stage, progress? }` |
| `wallet-error` | `{ message }` |

Events bubble across Shadow DOM. Import the component and modal only in a browser; use client-side dynamic imports with SSR. Without a build tool, serve the complete `dist/` directory and import its ES modules, not just a copied entry file.

## Requirements and limits

- PNG, JPEG, or WebP, up to 5 MB. Keep the full text address, QR code, coin, and network visible. The default OCR model is English; Chinese-only labels are not guaranteed to be recognized.
- Address validation checks network-specific encoding, length, and applicable checksums. Addresses are never guessed, corrected, or completed. Plain-address QR codes are recommended for token screenshots.
- Coin and network matching uses bounded keywords and supported aliases, regardless of case, order, or separators (for example, `USDC Arbitrum`). Duplicate mentions are allowed; conflicting recognized coins, networks, or testnet markers prevent confirmation. Links and explicit negative or fee notices are not positive evidence. Unknown names may not be detected.
- Adjacent, aligned two-line EVM addresses may be locally reflowed and re-read. The complete 40-character body must agree between OCR readings; QR content is never used to fill missing text.
- HTTP/HTTPS QR links, such as app download links, are ignored and never visited. A valid wallet QR is still required. Multiple different addresses, invalid addresses, or unsupported payment protocols are not bypassed.
- Checks do not prove wallet ownership, on-chain status, or asset compatibility. Your backend must independently validate inputs and business permissions.

## Local development

```bash
npm run dev
npm test
npm run build
```

Development runs at `http://localhost:21000`. An occupied port causes an error instead of silently switching. OCR assets are prepared automatically before the development server starts. To run browser tests, build and prepare the assets, install Chromium with `npx playwright install chromium`, then run `npm run test:browser`.

## Static demo

```bash
npm run build:demo
npm run preview:demo
```

Deploy the complete contents of `dist-demo/`, including `walletcheck-assets/` and `.nojekyll`, to a static host such as GitHub Pages. Relative asset paths support both domain roots and repository subdirectories. Preview at `http://localhost:21000`; use HTTP(S), not a local `file://` URL. This build is separate from the SDK output in `dist/`.
