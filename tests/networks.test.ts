import { describe, expect, it } from 'vitest';
import { base58, base58check, bech32, bech32m } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { extractTextCandidates, networks, normalizeAddress, validateAddress } from '../src/networks';
import type { Network } from '../src/types';

describe('network address formats', () => {
  it.each(Object.keys(networks) as Network[])('rejects short fake addresses on %s', (network) => {
    for (const address of ['123456', '0x123456', '', 'not-a-wallet']) {
      expect(validateAddress(address, network)).toBe(false);
    }
  });
  it('checks EVM lengths, alphabet and mixed-case checksum', () => {
    expect(validateAddress('0x52908400098527886E0F7030069857D2E4169EE7', 'ethereum')).toBe(true);
    expect(validateAddress('0x5Aeda56215b167893e80B4fE645BA6d5Bab767DE', 'ethereum')).toBe(false);
    expect(validateAddress('0x52908400098527886E0F7030069857D2E4169Ee7', 'ethereum')).toBe(false);
    expect(validateAddress(`0x${'a'.repeat(40)}`, 'ethereum')).toBe(true);
    expect(validateAddress(`0x${'g'.repeat(40)}`, 'ethereum')).toBe(false);
    expect(validateAddress(`0x${'a'.repeat(39)}`, 'ethereum')).toBe(false);
  });

  it('validates TRON version and base58 checksum', () => {
    const address = base58check(sha256).encode(Uint8Array.from([0x41, ...new Array(20).fill(7)]));
    expect(validateAddress(address, 'tron')).toBe(true);
    expect(validateAddress(address.slice(0, -1) + (address.endsWith('1') ? '2' : '1'), 'tron')).toBe(false);
    expect(normalizeAddress(address, 'tron')).toBe(address);
  });

  it('validates legacy Bitcoin checksums and network version', () => {
    const encode = (version: number) => base58check(sha256).encode(Uint8Array.from([version, ...new Array(20).fill(7)]));
    expect(validateAddress(encode(0), 'bitcoin')).toBe(true);
    expect(validateAddress(encode(5), 'bitcoin')).toBe(true);
    expect(validateAddress(encode(111), 'bitcoin')).toBe(false);
  });

  it('validates Bitcoin witness versions, lengths and checksum families', () => {
    const words = bech32.toWords(new Uint8Array(20).fill(9));
    const address = bech32.encode('bc', [0, ...words]);
    expect(validateAddress(address, 'bitcoin')).toBe(true);
    expect(validateAddress(address.toUpperCase(), 'bitcoin')).toBe(true);
    expect(normalizeAddress(address.toUpperCase(), 'bitcoin')).toBe(address);
    expect(validateAddress(`BC${address.slice(2)}`, 'bitcoin')).toBe(false);
    expect(validateAddress(bech32m.encode('bc', [0, ...words]), 'bitcoin')).toBe(false);
    expect(validateAddress(bech32.encode('bc', [1, ...words]), 'bitcoin')).toBe(false);
    expect(validateAddress(bech32m.encode('bc', [1, ...bech32m.toWords(new Uint8Array(32))]), 'bitcoin')).toBe(true);
    expect(validateAddress(bech32.encode('bc', [0, ...bech32.toWords(new Uint8Array(21))]), 'bitcoin')).toBe(false);
    expect(validateAddress(bech32m.encode('bc', [17, ...words]), 'bitcoin')).toBe(false);
    expect(validateAddress(bech32.encode('tb', [0, ...words]), 'bitcoin')).toBe(false);
  });

  it('checks Solana decoded length without changing case', () => {
    const address = base58.encode(new Uint8Array(32).fill(11));
    expect(validateAddress(address, 'solana')).toBe(true);
    expect(normalizeAddress(address, 'solana')).toBe(address);
    expect(validateAddress(base58.encode(new Uint8Array(31).fill(11)), 'solana')).toBe(false);
  });

  it('never extracts a valid substring out of an overlong EVM token', () => {
    const address = `0x${'a'.repeat(41)}`;
    expect(extractTextCandidates(`Address: ${address}`, 'ethereum')).toEqual([address]);
    expect(validateAddress(address, 'ethereum')).toBe(false);
    expect(extractTextCandidates(`prefix0x${'a'.repeat(40)}`, 'ethereum')).toEqual([]);
  });

  it('joins a strictly shaped wrapped EVM address and normalizes an OCR O prefix', () => {
    expect(extractTextCandidates('Oxa359b7e6b5b23dd23cb11f644d2367\n\n6de02987ff', 'arbitrum'))
      .toContain('0xa359b7e6b5b23dd23cb11f644d23676de02987ff');
  });
});
