import { correctOcrAddress, extractTextCandidates, networks, normalizeAddress, validateAddress } from './networks';
import type { CheckerOptions, FailureReason, Recognition, VerificationResult } from './types';
import { metadataFailure, verifyMetadata } from './metadata';

type ParsedQr = { address: string } | { error: FailureReason } | { ignored: true };

function parseQr(raw: string, options: CheckerOptions): ParsedQr {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      new URL(value);
      return { ignored: true };
    } catch { return { error: 'unsupported-qr' }; }
  }
  if (validateAddress(value, options.network)) return { address: value };
  if (/^ethereum:/i.test(value)) {
    const match = /^ethereum:(?:pay-)?(0x[0-9a-fA-F]{40})(?:@([0-9]+))?(?:\?([^#]*))?$/i.exec(value);
    if (!match) return { error: 'unsupported-qr' };
    if (!networks[options.network].chainId
      || (match[2] ?? '1') !== networks[options.network].chainId) {
      return { error: 'network-mismatch' };
    }
    const nativeCoin = options.network === 'bsc' ? 'BNB'
      : options.network === 'polygon' ? 'POL' : 'ETH';
    if (options.coin !== nativeCoin) return { error: 'coin-mismatch' };
    const params = new URLSearchParams(match[3]);
    if ([...params.keys()].some((key) => !['value', 'gas', 'gasLimit', 'gasPrice'].includes(key))) {
      return { error: 'unsupported-qr' };
    }
    return validateAddress(match[1], options.network)
      ? { address: match[1] } : { error: 'invalid-address' };
  }
  if (/^bitcoin:/i.test(value)) {
    if (options.network !== 'bitcoin') return { error: 'network-mismatch' };
    if (options.coin !== 'BTC') return { error: 'coin-mismatch' };
    const match = /^bitcoin:([^?#/]+)(?:\?([^#]*))?$/i.exec(value);
    if (!match) return { error: 'unsupported-qr' };
    const params = new URLSearchParams(match[2]);
    if ([...params.keys()].some((key) => !['amount', 'label', 'message'].includes(key))) {
      return { error: 'unsupported-qr' };
    }
    return validateAddress(match[1], options.network)
      ? { address: match[1] } : { error: 'invalid-address' };
  }
  return { error: value.includes(':') ? 'unsupported-qr' : 'invalid-address' };
}

export function evaluateRecognition(
  recognition: Recognition,
  options: CheckerOptions,
): VerificationResult {
  const metadata = verifyMetadata(recognition.text, options);
  const parsed = recognition.qrPayloads.map((payload) => parseQr(payload, options));
  const textCandidates = extractTextCandidates(recognition.text, options.network);
  const distinct = (addresses: string[]) => [...new Set(addresses.map(
    (address) => normalizeAddress(address, options.network),
  ))];
  const qrAddresses = distinct(parsed.flatMap((entry) => 'address' in entry ? [entry.address] : []));
  const textAddresses = distinct(textCandidates.filter((address) => validateAddress(address, options.network)));
  if (qrAddresses.length === 1 && !textAddresses.length) {
    const corrected = correctOcrAddress(recognition.text, qrAddresses[0], options.network);
    if (corrected) textAddresses.push(normalizeAddress(corrected, options.network));
  }
  const reject = (reason: FailureReason, addressVerified = false): VerificationResult => ({
    status: 'rejected', reason, addressVerified, qrAddresses, textAddresses, ocrText: recognition.text, metadata,
  });
  const invalidQr = parsed.find((entry) => 'error' in entry);
  if (invalidQr && 'error' in invalidQr) return reject(invalidQr.error);
  if (!qrAddresses.length && parsed.some((entry) => 'ignored' in entry)) return reject('unsupported-qr');
  const hasInvalidText = textCandidates.some((address) => !validateAddress(address, options.network));
  if (hasInvalidText && !textAddresses.length && qrAddresses.length === 1) {
    const corrected = correctOcrAddress(recognition.text, qrAddresses[0], options.network);
    if (corrected) textAddresses.push(normalizeAddress(corrected, options.network));
  }
  if (hasInvalidText && !textAddresses.length) return reject('invalid-address');
  if (qrAddresses.length > 1 || textAddresses.length > 1) return reject('multiple-addresses');
  if (!qrAddresses.length && !textAddresses.length) return reject('no-address');
  if (qrAddresses.length && textAddresses.length && qrAddresses[0] !== textAddresses[0]) {
    return reject('address-conflict');
  }
  if (!qrAddresses.length) return reject('missing-qr');
  if (!textAddresses.length) return reject('missing-text');
  const failure = metadataFailure(metadata);
  if (failure) return reject(failure, true);
  return {
    status: 'matched',
    metadata,
    payload: {
      coin: options.coin,
      network: options.network,
      address: qrAddresses[0],
    },
    sources: ['qr', 'text'],
  };
}
