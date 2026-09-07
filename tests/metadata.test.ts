import { describe, expect, it } from 'vitest';
import { verifyMetadata } from '../src/metadata';
import { evaluateRecognition } from '../src/verification';
import type { Network } from '../src/types';

describe('network name matching', () => {
  it.each([
    'USDT\nBNB Chain', 'USDT 收款\n仅支持接收 BNB Chain 网络资产',
    'USDT KFR\nIZ BNB Chain [4&7', 'usdt bnbchain',
    'USDT BNB Chain BNB Chain', 'Coin: USDT (BNB Chain)',
    'USDT\nNetwork: BNB Chain',
  ])('recognizes BNB Chain as a network, not a second coin: %s', (text) => {
    expect(verifyMetadata(text, { coin: 'USDT', network: 'bsc' })).toMatchObject({
      coin: { status: 'matched', detected: ['USDT'] }, network: { status: 'matched', detected: ['bsc'] },
    });
  });

  it.each(['USDT BNB BNB Chain', 'Coin: USDT BNB\nBNB Chain', 'USDT\nCoin: BNB\nBNB Chain'])(
    'still rejects a genuine second BNB coin: %s', (text) => {
      expect(verifyMetadata(text, { coin: 'USDT', network: 'bsc' }).coin.status).toBe('ambiguous');
    },
  );

  it('can verify BNB itself when it is explicitly the coin', () => {
    expect(verifyMetadata('Coin: BNB\nNetwork: BNB Chain', { coin: 'BNB', network: 'bsc' })).toMatchObject({
      coin: { status: 'matched' }, network: { status: 'matched' },
    });
  });

  it.each(['USDT BNB Chain opBNB', 'USDT BNB Chain\nopBNB', 'USDT BNB Chain Testnet', 'USDT BNB Beacon Chain'])(
    'does not confuse other BNB networks with BSC: %s', (text) => {
      expect(verifyMetadata(text, { coin: 'USDT', network: 'bsc' }).network.status).not.toBe('matched');
    },
  );
  it.each<[string, Network]>([
    ['USDC arb one', 'arbitrum'], ['USDC OP Mainnet', 'optimism'],
    ['USDC BNB Smart Chain', 'bsc'],
  ])('does not mistake a network name component for a separate coin: %s', (text, network) => {
    expect(verifyMetadata(text, { coin: 'USDC', network })).toMatchObject({
      coin: { status: 'matched' }, network: { status: 'matched' },
    });
  });
  it.each([
    'USDC Arbitrum', 'USDC - Arbitrum One', 'USDC / Arbitrum One',
    'USDC · Arbitrum One', 'USDC [Arbitrum One]', 'Arbitrum One (USDC)',
    'Receive USDC (Arbitrum One)', '% USDC (Arbitrum One)',
    'USDC\n网络名称：Arbitrum One', 'USDC\n收款网络：Arbitrum One',
    'USDC\nArbitrum\nOne', 'usdc ARBITRUM', 'USDC Arbitrum One\nUSDC Arbitrum',
    'Coin: USDC Arbitrum One', 'Network: USDC Arbitrum One',
  ])('accepts unique coin and network words regardless of layout: %s', (text) => {
    expect(verifyMetadata(text, { coin: 'USDC', network: 'arbitrum' })).toMatchObject({
      coin: { status: 'matched' }, network: { status: 'matched' },
    });
  });

  it('ignores a token annotation inside a network heading', () => {
    expect(verifyMetadata('USDT\nArbitrum One (USDT0)', { coin: 'USDT', network: 'arbitrum' })).toMatchObject({
      coin: { status: 'matched', detected: ['USDT'] }, network: { status: 'matched' },
    });
  });

  it.each([
    'USDC USDT Arbitrum', 'Coin: USDC\nUSDT\nNetwork: Arbitrum',
    'USDC Arbitrum\nUSDC.E', 'USDC Arbitrum\nUSDT0',
  ])('rejects competing coin words anywhere: %s', (text) => {
    expect(verifyMetadata(text, { coin: 'USDC', network: 'arbitrum' }).coin.status).toBe('ambiguous');
  });

  it.each([
    'USDC Arbitrum Ethereum', 'USDC\nNetwork: Arbitrum\nEthereum',
    'USDC\nNetwork: Arbitrum\nNova', 'USDC\nNetwork: Arbitrum\nSepolia',
    'USDC Arbitrum\ntestnet', 'USDC Arbitrum (BEP20)',
  ])('rejects competing or unsupported network words anywhere: %s', (text) => {
    expect(verifyMetadata(text, { coin: 'USDC', network: 'arbitrum' }).network.status).toBe('ambiguous');
  });

  it.each(['USDC.E Arbitrum', 'XUSDC Arbitrum', 'USDC ArbitrumOneNova', 'USDC Coinbase'])(
    'never substitutes partial words for both expected fields: %s', (text) => {
      const result = verifyMetadata(text, { coin: 'USDC', network: 'arbitrum' });
      expect([result.coin.status, result.network.status]).not.toEqual(['matched', 'matched']);
    },
  );

  it('does not extract coin or network words from links', () => {
    expect(verifyMetadata('USDC Arbitrum\nhttps://base.example/USDT', {
      coin: 'USDC', network: 'arbitrum',
    })).toMatchObject({ coin: { status: 'matched' }, network: { status: 'matched' } });
  });
  it.each(['USDC (Arbitrum One)', 'usdc(arbitrum one)', 'USDC（Arbitrum One）'])(
    'reads both fields from a combined heading: %s', (text) => {
      expect(verifyMetadata(text, { coin: 'USDC', network: 'arbitrum' })).toMatchObject({
        coin: { status: 'matched' }, network: { status: 'matched' },
      });
    },
  );

  it.each(['USDC (Arbitrum Nova)', 'USDC (Arbitrum Sepolia)', 'USDC (not Arbitrum One)', 'Do not use USDC (Arbitrum One)'])(
    'does not accept unsupported or negated combined headings: %s', (text) => {
      expect(verifyMetadata(text, { coin: 'USDC', network: 'arbitrum' }).network.status).not.toBe('matched');
    },
  );

  it('keeps conflicts between combined headings and explicit fields', () => {
    expect(verifyMetadata('USDC (Arbitrum One)\nNetwork: Ethereum\nCoin: USDT', {
      coin: 'USDC', network: 'arbitrum',
    })).toMatchObject({ coin: { status: 'ambiguous' }, network: { status: 'ambiguous' } });
  });
  it.each<[string, Network]>([
    ['arbitrum', 'arbitrum'], ['ARBITRUM ONE', 'arbitrum'],
    ['arbitrum_one', 'arbitrum'], ['ArbitrumOne (USDT0)', 'arbitrum'],
    ['Network: Arbitrum One (USDTO0)', 'arbitrum'],
    ['Network:\nETH', 'ethereum'], ['Ethereum (ERC20)', 'ethereum'],
    ['ethereum-mainnet', 'ethereum'], ['BSC', 'bsc'],
    ['bnb smart chain', 'bsc'], ['TRC-20', 'tron'],
    ['TrOn', 'tron'], ['SOLANA MAINNET BETA', 'solana'],
    ['Polygon PoS', 'polygon'], ['OP MAINNET', 'optimism'],
    ['Network: Base', 'base'], ['bitcoin', 'bitcoin'],
  ])('matches explicit bounded aliases: %s', (text, network) => {
    expect(verifyMetadata(`Coin: USDT\n${text}`, { coin: 'USDT', network }).network.status).toBe('matched');
  });

  it.each([
    'Arbitrum Nova', 'Arbitrum Sepolia', 'Arbitrum Orbit', 'Network: Arbitrum Two',
    'Network: Arbitrum (Two)', 'Network: ArbitrumOneNova', 'Arbitrum testnet',
    'Network: Arbit', 'Network: not-arbitrum',
  ])('never accepts a different or incomplete Arbitrum network: %s', (text) => {
    expect(verifyMetadata(text, { coin: 'USDT', network: 'arbitrum' }).network.status).not.toBe('matched');
  });

  it.each([
    ['Network: Ethereum Sepolia', 'ethereum'],
    ['Network: Polygon zkEVM', 'polygon'],
    ['Network: Solana devnet', 'solana'],
    ['Coinbase', 'base'], ['Database', 'base'], ['Base fee', 'base'],
    ['Network: BNB Beacon Chain', 'bsc'],
  ] as [string, Network][])('avoids substring and testnet collisions: %s', (text, network) => {
    expect(verifyMetadata(text, { coin: 'USDT', network }).network.status).not.toBe('matched');
  });

  it('rejects ambiguous network standards and conflicting network fields', () => {
    expect(verifyMetadata('Network: ERC20', { coin: 'USDT', network: 'ethereum' }).network.status).toBe('ambiguous');
    expect(verifyMetadata('Network: Ethereum\nNetwork: Base', { coin: 'USDT', network: 'ethereum' }).network.status).toBe('ambiguous');
    expect(verifyMetadata('Network: Ethereum / Base', { coin: 'USDT', network: 'ethereum' }).network.status).toBe('ambiguous');
  });
});

describe('coin symbol checks', () => {
  it('ignores symbol case but not symbol suffixes', () => {
    expect(verifyMetadata('Coin: usdt', { coin: 'USDT', network: 'ethereum' }).coin.status).toBe('matched');
    for (const coin of ['USDT0', 'USDTO', 'USDC', 'XUSDT', 'USDT.E']) {
      expect(verifyMetadata(`Coin: ${coin}`, { coin: 'USDT', network: 'ethereum' }).coin.status).toBe('mismatch');
    }
  });

  it('distinguishes coin fields from network abbreviations and network annotations', () => {
    expect(verifyMetadata('Receive USDT\nNetwork:\nETH', { coin: 'USDT', network: 'ethereum' }).coin.status).toBe('matched');
    const metadata = verifyMetadata('Receive USDT\nArbitrum One (USDT0)', { coin: 'USDT', network: 'arbitrum' });
    expect(metadata.coin.detected).toEqual(['USDT']);
    expect(metadata.coin.status).toBe('matched');
    expect(metadata.network.status).toBe('matched');
    expect(verifyMetadata('Coin: USDT0\nNetwork: Arbitrum One', { coin: 'USDT', network: 'arbitrum' }).coin.status).toBe('mismatch');
  });

  it('does not use an address substring or missing fields as metadata evidence', () => {
    expect(verifyMetadata('0xabcdef0123456789012345678901234567890123', { coin: 'USDT', network: 'ethereum' }).coin.status).toBe('missing');
    expect(verifyMetadata('Coin: USDT\nCoin: USDC', { coin: 'USDT', network: 'ethereum' }).coin.status).toBe('ambiguous');
  });

  it('does not treat warning text or negated fields as a verified coin', () => {
    expect(verifyMetadata('Do not deposit USDT\nNetwork: Ethereum', { coin: 'USDT', network: 'ethereum' }).coin.status).toBe('missing');
    expect(verifyMetadata('Coin: not USDT', { coin: 'USDT', network: 'ethereum' }).coin.status).toBe('mismatch');
  });
});

describe('full verification integration', () => {
  const address = `0x${'a'.repeat(40)}`;
  const options = { coin: 'USDT', network: 'arbitrum' as const };

  it('requires network and coin text by default even when addresses match', () => {
    expect(evaluateRecognition({ qrPayloads: [address], text: address }, options)).toMatchObject({ status: 'rejected', reason: 'missing-network' });
    expect(evaluateRecognition({ qrPayloads: [address], text: `${address}\nArbitrum` }, options)).toMatchObject({ status: 'rejected', reason: 'missing-coin' });
  });

  it('rejects the same EVM address on a conflicting displayed network', () => {
    expect(evaluateRecognition({ qrPayloads: [address], text: `${address}\nCoin: USDT\nNetwork: Ethereum` }, options))
      .toMatchObject({ status: 'rejected', reason: 'network-mismatch' });
  });

  it('returns the three unchanged payload fields only after full verification', () => {
    const result = evaluateRecognition({ qrPayloads: [address], text: `${address}\nCoin: usdt\nNetwork: arbitrum ONE` }, options);
    expect(result).toMatchObject({ status: 'matched', metadata: { coin: { status: 'matched' }, network: { status: 'matched' } } });
    if (result.status === 'matched') expect(result.payload).toEqual({ ...options, address });
  });

  it('requires metadata even if removed opt-out options are supplied', () => {
    const legacyOptions = { ...options, mode: 'single-source', metadataPolicy: 'address-only' };
    expect(evaluateRecognition({ qrPayloads: [address], text: address }, legacyOptions))
      .toMatchObject({ status: 'rejected', reason: 'missing-network', metadata: { coin: { status: 'missing' }, network: { status: 'missing' } } });
  });
});

describe('OCR address correction', () => {
  it('corrects a unique C-like OCR symbol using the QR address', () => {
    const result = evaluateRecognition({
      qrPayloads: ['0x1234567890123456789012345678901234567890'],
      text: 'USDT\nArbitrum One\n0x1234567890123456789012345678901234567890',
    }, { coin: 'USDT', network: 'arbitrum', assetBaseUrl: '' });
    expect(result.status).toBe('matched');
  });
});
