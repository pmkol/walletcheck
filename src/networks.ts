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
  if (networks[network].chainId) {
    const pattern = /(?<![a-zA-Z0-9])0x[a-zA-Z0-9]+(?![a-zA-Z0-9])/g;
    const candidates: string[] = text.match(pattern) ?? [];
    const lines = text.split(/\r?\n/).map((line) => line.trim());
    for (let index = 0; index < lines.length - 1; index += 1) {
      const prefix = lines[index].replace(/\s+/g, '');
      let next = index + 1;
      while (next < lines.length && !lines[next]) next += 1;
      if (next >= lines.length) continue;
      const suffix = lines[next].replace(/\s+/g, '');
      if (!/^[0O][xX][0-9a-fA-F]{8,38}$/.test(prefix)
        || !/^[0-9a-fA-F]{2,32}$/.test(suffix)
        || prefix.length + suffix.length !== 42) continue;
      // OCR commonly confuses the leading zero with an uppercase O. Normalize
      // only that prefix; the complete body still has to pass address checks.
      candidates.push(`0x${prefix.slice(2)}${suffix}`);
    }
    return [...new Set(candidates)];
  }
  const pattern = /(?<![a-zA-Z0-9])[a-zA-Z0-9]{26,110}(?![a-zA-Z0-9])/g;
  return [...new Set(text.match(pattern) ?? [])];
}

const ocrConfusions: Record<string, string[]> = {
  '0': ['o', 'O', 'd', 'D', 'l', 'L'], '1': ['i', 'I', 'l', '|'], '2': ['z', 'Z'],
  '5': ['s', 'S'], '6': ['g', 'G'], '8': ['b', 'B'],
  'C': ['(', '¢', '©'], 'x': ['X', '×', '*'],
};

const ignorableOcrAddressCharacters = new Set([
  '|', '·', '•', ',', '，', ';', '；', '_', '¢', '©', '(', ')', '×', '*',
]);

function ocrAddressCandidates(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const candidates: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const prefix = lines[index].replace(/\s+/g, '');
    if (!/^[0O][xX]/.test(prefix) || prefix.length < 10) continue;
    candidates.push(prefix);
    let next = index + 1;
    while (next < lines.length && !lines[next]) next += 1;
    if (next < lines.length) {
      const suffix = lines[next].replace(/\s+/g, '');
      if (/^[0-9a-fA-F]{2,32}$/.test(suffix)) candidates.push(prefix + suffix);
    }
  }
  return [...new Set(candidates)];
}

function matchesOcrAddress(actual: string, expected: string): boolean {
  const maxEdits = 2;
  const memo = new Map<string, number | undefined>();
  const visit = (actualIndex: number, expectedIndex: number, edits: number): number | undefined => {
    if (edits > maxEdits) return undefined;
    if (actualIndex === actual.length) return expectedIndex === expected.length ? edits : undefined;
    if (expectedIndex === expected.length) {
      return actual.slice(actualIndex).split('').every((character) =>
        ignorableOcrAddressCharacters.has(character))
        ? edits + actual.length - actualIndex <= maxEdits ? edits + actual.length - actualIndex : undefined
        : undefined;
    }
    const key = `${actualIndex}:${expectedIndex}:${edits}`;
    if (memo.has(key)) return memo.get(key);
    const actualCharacter = actual[actualIndex];
    const expectedCharacter = expected[expectedIndex];
    const same = actualCharacter.toLowerCase() === expectedCharacter.toLowerCase();
    let result: number | undefined;
    if (same) result = visit(actualIndex + 1, expectedIndex + 1, edits);
    if (result === undefined) {
      const targetClass = ocrConfusions[expectedCharacter] ?? ocrConfusions[expectedCharacter.toUpperCase()];
      if (targetClass?.includes(actualCharacter)) {
        result = visit(actualIndex + 1, expectedIndex + 1, edits + 1);
      }
    }
    if (result === undefined && ignorableOcrAddressCharacters.has(actualCharacter)) {
      result = visit(actualIndex + 1, expectedIndex, edits + 1);
    }
    memo.set(key, result);
    return result;
  };
  return visit(0, 0, 0) !== undefined;
}

/** Returns a bounded QR-guided repair for OCR text that is otherwise recoverable. */
export function correctOcrAddress(text: string, expected: string, network: Network): string | undefined {
  if (!validateAddress(expected, network)) return undefined;
  const candidates = ocrAddressCandidates(text);
  for (const candidate of candidates) {
    const prefix = candidate.slice(0, 2);
    if (!/^[0O][xX]$/.test(prefix)) continue;
    if (matchesOcrAddress(candidate.slice(2), expected.slice(2))) return expected;
  }
  return undefined;
}
