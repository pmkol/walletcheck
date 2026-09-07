import { base58, base58check, bech32, bech32m } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Network } from './types';

const checkedBase58 = base58check(sha256);

export const networks: Record<Network, { label: string; chainId?: string }> = {
  'ethereum': { label: 'Ethereum', chainId: '1' },
  'bsc': { label: 'BNB Smart Chain', chainId: '56' },
  'polygon': { label: 'Polygon', chainId: '137' },
  'arbitrum': { label: 'Arbitrum One', chainId: '42161' },
  'optimism': { label: 'Optimism', chainId: '10' },
  'base': { label: 'Base', chainId: '8453' },
  'tron': { label: 'TRON' },
  'bitcoin': { label: 'Bitcoin' },
  'solana': { label: 'Solana' },
};

export function isNetwork(value: string): value is Network {
  return Object.hasOwn(networks, value);
}

export function validateAddress(address: string, network: Network): boolean {
  if (!isNetwork(network)) return false;
  try {
    if (networks[network].chainId) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
      const body = address.slice(2);
      if (body === body.toLowerCase() || body === body.toUpperCase()) return true;
      const hash = bytesToHex(keccak_256(new TextEncoder().encode(body.toLowerCase())));
      return [...body].every((character, index) => {
        if (!/[a-fA-F]/.test(character)) return true;
        return character === (parseInt(hash[index], 16) >= 8
          ? character.toUpperCase() : character.toLowerCase());
      });
    }
    if (network === 'tron') {
      if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return false;
      const decoded = checkedBase58.decode(address);
      return decoded.length === 21 && decoded[0] === 0x41;
    }
    if (network === 'solana') {
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
        && base58.decode(address).length === 32;
    }
    if (/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address)) {
      const decoded = checkedBase58.decode(address);
      return decoded.length === 21 && (decoded[0] === 0 || decoded[0] === 5);
    }
    if (!/^bc1/i.test(address) || address.length > 90) return false;
    const codec = address.toLowerCase().startsWith('bc1q') ? bech32 : bech32m;
    const decoded = codec.decode(address as `${string}1${string}`, 90);
    const version = decoded.words[0];
    const program = codec.fromWords(decoded.words.slice(1));
    return decoded.prefix === 'bc' && version >= 0 && version <= 16
      && program.length >= 2 && program.length <= 40
      && (version !== 0 || program.length === 20 || program.length === 32);
  } catch {
    return false;
  }
}

export function normalizeAddress(address: string, network: Network): string {
  if (!validateAddress(address, network)) throw new Error('地址格式不合法');
  if (networks[network].chainId || (network === 'bitcoin' && /^bc1/i.test(address))) {
    return address.toLowerCase();
  }
  return address;
}

export function extractTextCandidates(text: string, network: Network): string[] {
  const pattern = networks[network].chainId
    ? /(?<![a-zA-Z0-9])0x[a-zA-Z0-9]+(?![a-zA-Z0-9])/g
    : /(?<![a-zA-Z0-9])[a-zA-Z0-9]{26,110}(?![a-zA-Z0-9])/g;
  return [...new Set(text.match(pattern) ?? [])];
}
