export type Network =
  | 'ethereum'
  | 'bsc'
  | 'polygon'
  | 'arbitrum'
  | 'optimism'
  | 'base'
  | 'tron'
  | 'bitcoin'
  | 'solana';

export interface MetadataCheck {
  status: 'matched' | 'missing' | 'mismatch' | 'ambiguous';
  expected: string;
  detected: string[];
}
export interface MetadataVerification {
  coin: MetadataCheck;
  network: MetadataCheck;
}
export type Stage = 'preparing' | 'qr' | 'ocr-loading' | 'ocr';

export interface WalletPayload {
  coin: string;
  network: Network;
  address: string;
}

export interface Recognition {
  qrPayloads: string[];
  text: string;
}

export interface RecognitionContext {
  signal: AbortSignal;
  assetBaseUrl: string;
  onProgress: (stage: Stage, progress?: number) => void;
}

export interface Recognizer {
  recognize(file: Blob, context: RecognitionContext): Promise<Recognition>;
  dispose(): Promise<void>;
}

export interface CheckerOptions {
  coin: string;
  network: Network;
  assetBaseUrl?: string;
  onProgress?: (stage: Stage, progress?: number) => void;
  recognizer?: Recognizer;
}

export type AddressStatus = 'matched' | 'mismatched' | 'uncertain';

export type FailureReason =
  | 'no-address'
  | 'invalid-address'
  | 'unsupported-qr'
  | 'network-mismatch'
  | 'coin-mismatch'
  | 'missing-coin'
  | 'missing-network'
  | 'ambiguous-coin'
  | 'ambiguous-network'
  | 'multiple-addresses'
  | 'missing-qr'
  | 'missing-text'
  | 'address-conflict';

export type VerificationResult =
  | { status: 'matched'; addressStatus: 'matched'; payload: WalletPayload; sources: ('qr' | 'text')[]; metadata: MetadataVerification }
  | { status: 'rejected'; reason: FailureReason; addressStatus: AddressStatus; addressVerified: boolean; qrAddresses: string[]; textAddresses: string[]; ocrText: string; metadata: MetadataVerification };
