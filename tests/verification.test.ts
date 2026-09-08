import { describe, expect, it } from 'vitest';
import { evaluateRecognition } from '../src/verification';
import type { CheckerOptions, FailureReason, Recognition } from '../src/types';

const address = `0x${'a'.repeat(40)}`;
const otherAddress = `0x${'b'.repeat(40)}`;
const options: CheckerOptions = { coin: 'USDT', network: 'ethereum' };
const metadata = '\nCoin: USDT\nNetwork: Ethereum';

describe('cross-check rules', () => {
  it.each([
    'USDC Ethereum', 'USDT Arbitrum', 'USDC Arbitrum', '',
    'USDT Ethereum Arbitrum',
  ])('preserves successful address verification despite metadata failure: %s', (text) => {
    expect(evaluateRecognition({ qrPayloads: [address], text: `${address}\n${text}` }, options))
      .toMatchObject({ status: 'rejected', addressVerified: true });
  });
  it.each(['123456', '0x123456', `0x${'g'.repeat(40)}`, '0x52908400098527886E0F7030069857D2E4169Ee7'])(
    'rejects identical invalid QR and text addresses: %s', (invalidAddress) => {
      const result = evaluateRecognition({ qrPayloads: [invalidAddress], text: `${invalidAddress}${metadata}` }, options);
      expect(result).toMatchObject({ status: 'rejected', reason: 'invalid-address', addressVerified: false });
      expect(result).not.toHaveProperty('payload');
    },
  );
  it('returns only the configured coin, network and normalized recognized address', () => {
    expect(evaluateRecognition({ qrPayloads: [address], text: `Address: ${address}${metadata}` }, options)).toMatchObject({
      status: 'matched', payload: { coin: options.coin, network: options.network, address }, sources: ['qr', 'text'],
    });
  });

  it.each<[Recognition, FailureReason]>([
    [{ qrPayloads: [], text: '' }, 'no-address'],
    [{ qrPayloads: [address], text: '' }, 'missing-text'],
    [{ qrPayloads: [], text: address }, 'missing-qr'],
    [{ qrPayloads: [address], text: otherAddress }, 'address-conflict'],
    [{ qrPayloads: [address, otherAddress], text: address }, 'multiple-addresses'],
    [{ qrPayloads: [address], text: `${address}\n${otherAddress}` }, 'multiple-addresses'],
    [{ qrPayloads: ['https://example.org/' + address], text: address }, 'unsupported-qr'],
    [{ qrPayloads: [address], text: `0x${'a'.repeat(39)}O` }, 'invalid-address'],
    [{ qrPayloads: [address], text: '0xaaaa...aaab' }, 'invalid-address'],
  ])('rejects unsafe or incomplete recognition %#', (recognition, reason) => {
    expect(evaluateRecognition(recognition, options)).toMatchObject({
      status: 'rejected', reason, addressVerified: false, ocrText: recognition.text,
    });
    if (reason === 'address-conflict') {
      expect(evaluateRecognition(recognition, options)).toMatchObject({ addressStatus: 'mismatched' });
    }
  });

  it('deduplicates repeated valid addresses', () => {
    expect(evaluateRecognition({ qrPayloads: [address, address], text: `${address}\n${address}${metadata}` }, options).status).toBe('matched');
  });

  it.each([
    [address, 'https://example.org/app'],
    ['https://example.org/app', address],
    ['HTTP://example.org/download', address, address],
  ])('ignores web links alongside a valid wallet QR: %j', (...qrPayloads) => {
    expect(evaluateRecognition({ qrPayloads, text: `${address}${metadata}` }, options)).toMatchObject({
      status: 'matched', payload: { address },
    });
  });

  it('ignores an empty QR payload returned alongside a valid wallet QR', () => {
    expect(evaluateRecognition({ qrPayloads: [address, ''], text: `${address}${metadata}` }, options))
      .toMatchObject({ status: 'matched', payload: { address } });
  });

  it('treats an empty-only QR result as no address', () => {
    expect(evaluateRecognition({ qrPayloads: ['', '  '], text: `${address}${metadata}` }, options))
      .toMatchObject({ status: 'rejected', reason: 'missing-qr' });
  });

  it.each<[string[], string, FailureReason]>([
    [['https://example.org/app'], address, 'unsupported-qr'],
    [[`https://example.org/?address=${address}`], address, 'unsupported-qr'],
    [[address, otherAddress, 'https://example.org/app'], address, 'multiple-addresses'],
    [[address, 'https://example.org/app'], otherAddress, 'address-conflict'],
    [[address, '123456', 'https://example.org/app'], address, 'invalid-address'],
    [[address, `ethereum:${address}@8453`, 'https://example.org/app'], address, 'network-mismatch'],
    [[address, `ethereum:${address}@1/transfer?address=${otherAddress}`], address, 'unsupported-qr'],
    [[address, 'walletapp:unknown'], address, 'unsupported-qr'],
  ])('does not bypass wallet checks when filtering web links %#', (qrPayloads, text, reason) => {
    expect(evaluateRecognition({ qrPayloads, text: `${text}${metadata}` }, options)).toMatchObject({ status: 'rejected', reason, addressVerified: false });
  });

  it('requires both address sources even if removed options are supplied', () => {
    const legacyOptions = { ...options, mode: 'single-source', metadataPolicy: 'address-only' };
    expect(evaluateRecognition({ qrPayloads: [address], text: metadata }, legacyOptions)).toMatchObject({
      status: 'rejected', reason: 'missing-text',
    });
    expect(evaluateRecognition({ qrPayloads: [], text: `${address}${metadata}` }, legacyOptions)).toMatchObject({
      status: 'rejected', reason: 'missing-qr',
    });
  });

  it('does not interpret token contract targets as recipients', () => {
    const uri = `ethereum:${address}@1/transfer?address=${otherAddress}&uint256=1000`;
    expect(evaluateRecognition({ qrPayloads: [uri], text: address }, options)).toMatchObject({
      status: 'rejected', reason: 'unsupported-qr',
    });
  });

  it('checks payment URI coin and chain id and rejects unknown parameters', () => {
    const recognition = { qrPayloads: [`ethereum:${address}@1?value=100`], text: `${address}\nCoin: ETH\nNetwork: Ethereum` };
    expect(evaluateRecognition(recognition, { ...options, coin: 'ETH' }).status).toBe('matched');
    expect(evaluateRecognition(recognition, options)).toMatchObject({ reason: 'coin-mismatch' });
    expect(evaluateRecognition(recognition, { ...options, network: 'base' })).toMatchObject({ reason: 'network-mismatch' });
    expect(evaluateRecognition({ ...recognition, qrPayloads: [`ethereum:${address}?address=${otherAddress}`] }, { ...options, coin: 'ETH' }))
      .toMatchObject({ reason: 'unsupported-qr' });
  });

  it('checks Bitcoin URI network, coin and required parameters', () => {
    const bitcoin = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
    const config: CheckerOptions = { coin: 'BTC', network: 'bitcoin' };
    const recognition = { qrPayloads: [`bitcoin:${bitcoin}?amount=0.01`], text: `${bitcoin}\nCoin: BTC\nNetwork: Bitcoin` };
    expect(evaluateRecognition(recognition, config).status).toBe('matched');
    expect(evaluateRecognition(recognition, options)).toMatchObject({ reason: 'network-mismatch' });
    expect(evaluateRecognition(recognition, { ...config, coin: 'USDT' })).toMatchObject({ reason: 'coin-mismatch' });
    expect(evaluateRecognition({ ...recognition, qrPayloads: [`bitcoin:${bitcoin}?req-extra=1`] }, config)).toMatchObject({ reason: 'unsupported-qr' });
  });
});
