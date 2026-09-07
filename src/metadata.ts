import type { CheckerOptions, FailureReason, MetadataCheck, MetadataVerification, Network } from './types';

const aliases: Record<Network, string[]> = {
  'ethereum': ['ethereum mainnet', 'ethereum', '以太坊'],
  'bsc': ['bnb smart chain', 'binance smart chain', 'bnb chain', 'bsc', 'bep20', 'bep 20'],
  'polygon': ['polygon pos', 'polygon'],
  'arbitrum': ['arbitrum one', 'arbitrum', 'arb one'],
  'optimism': ['op mainnet', 'optimism'],
  'base': ['base mainnet', 'base'],
  'tron': ['tron mainnet', 'tron', 'trc20', 'trc 20'],
  'bitcoin': ['bitcoin mainnet', 'bitcoin'],
  'solana': ['solana mainnet beta', 'solana mainnet', 'solana'],
};
const labelledAliases: Partial<Record<Network, string[]>> = {
  'ethereum': ['eth'], 'bitcoin': ['btc'], 'solana': ['sol'],
  'tron': ['trx'], 'optimism': ['op'], 'polygon': ['matic'],
};
const knownCoins = ['USDT', 'USDT0', 'USDC', 'USDC.E', 'DAI', 'ETH', 'BTC', 'TRX', 'SOL', 'BNB', 'POL', 'MATIC', 'ARB', 'OP', 'DOGE', 'LTC', 'XRP', 'TON'];
const networkLabel = /^(?:network|blockchain|chain|网络名称|收款网络|网络|链)(?:\s*[:：]\s*|\s+|$)(.*)$/i;
const coinLabel = /^(?:coin|asset|currency|token|币种|资产)(?:\s*[:：]\s*|\s+|$)(.*)$/i;
const unsupportedNetwork = /test\s*net|sepolia|goerli|holesky|hoodi|dev\s*net|signet|amoy|mumbai|nile|shasta|nova|orbit|zk\s*evm|beacon|bep\s*2(?!0)|\bop\s*bnb\b/i;
const warningText = /\b(?:not|don't|never|unsupported|avoid|fee|fees)\b|请勿|不支持|不要/i;

function fold(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasPattern(alias: string, flags = 'i'): RegExp {
  return new RegExp(`(?<![a-z0-9])${alias.split(' ').map(escape).join('\\s*')}(?![a-z0-9])`, flags);
}

function identifyNetworks(raw: string, labelled: boolean): string[] {
  const value = fold(raw);
  const mentionsNetwork = Object.values(aliases).flat().some((alias) => aliasPattern(alias).test(value));
  if (unsupportedNetwork.test(value)) return labelled || mentionsNetwork || unsupportedNetwork.exec(value)?.[0] === value ? [value] : [];
  if (warningText.test(value)) return labelled ? [value] : [];
  if (/^(?:erc\s*20|evm)$/.test(value)) return ['ambiguous:evm'];
  const withoutParentheses = value;
  const found: string[] = [];
  for (const [network, names] of Object.entries(aliases) as [Network, string[]][]) {
    for (const alias of [...names, ...(labelled ? labelledAliases[network] ?? [] : [])]) {
      const pattern = aliasPattern(alias);
      if (!pattern.test(withoutParentheses)) continue;
      found.push(network);
      break;
    }
  }
  if (found.length && labelled) {
    let remainder = withoutParentheses;
    for (const network of found as Network[]) {
      for (const alias of [...aliases[network], ...(labelledAliases[network] ?? [])]) {
        remainder = remainder.replace(aliasPattern(alias), '');
      }
    }
    for (const coin of knownCoins) {
      remainder = remainder.replace(new RegExp(`(?<![a-z0-9._-])${escape(coin)}(?![a-z0-9._-])`, 'ig'), '');
    }
    remainder = remainder.replace(/\(usdt[0o]*\)/g, '');
    remainder = remainder.replace(/\b(?:erc\s*20|evm)\b/g, '');
    remainder = remainder.replace(/\b(?:mainnet|network|chain|and|or)\b|主网|网络|[()/&,]/g, '').trim();
    if (remainder) return [value];
  }
  return found.length ? [...new Set(found)] : labelled && value ? [value] : [];
}

function labelledValues(lines: string[], label: RegExp): string[] {
  return lines.flatMap((line, index) => {
    const match = label.exec(line);
    return match ? [match[1].trim() || lines[index + 1] || ''] : [];
  });
}

function stripNetworkNames(value: string): string {
  for (const alias of Object.values(aliases).flat().filter((name) => name.includes(' '))) {
    value = value.replace(aliasPattern(alias, 'ig'), '');
  }
  return value;
}

function stripNetworkAnnotations(value: string): string {
  return value.replace(/[（(]\s*usdt0\s*[）)]/ig, '');
}

function noisyCoinMentions(lines: string[], symbols: string[]): string[] {
  const occurrences = new Map<string, Set<string>>();
  const ordered = [...symbols].sort((first, second) => second.length - first.length);
  for (const line of lines) {
    if (warningText.test(line) || networkLabel.test(line) || identifyNetworks(line, false).length) continue;
    if (/^[0o]x[0-9a-f]/i.test(line.replace(/\s+/g, ''))) continue;
    const value = fold(line);
    for (const symbol of ordered) {
      const needle = symbol.toLowerCase();
      const index = value.indexOf(needle);
      if (index < 0) continue;
      // A longer known symbol owns its substring (USDT0 must not become USDT).
      if (ordered.some((other) => other.length > symbol.length && value.includes(other.toLowerCase()))) continue;
      const before = value[index - 1] ?? '';
      const after = value[index + needle.length] ?? '';
      if (!/[a-z0-9]/i.test(before) && !/[a-z0-9]/i.test(after)) continue;
      const values = occurrences.get(symbol) ?? new Set<string>();
      values.add(value);
      occurrences.set(symbol, values);
    }
  }
  // Require repeated evidence before accepting a noisy OCR substring.
  return [...occurrences.entries()].filter(([, values]) => values.size >= 2).map(([symbol]) => symbol);
}

function check(expected: string, detected: string[]): MetadataCheck {
  const distinct = [...new Set(detected)];
  return {
    expected, detected: distinct,
    status: !distinct.length ? 'missing'
      : distinct.length > 1 || distinct[0].startsWith('ambiguous:') ? 'ambiguous'
      : distinct[0] === expected ? 'matched' : 'mismatch',
  };
}

export function verifyMetadata(text: string, options: CheckerOptions): MetadataVerification {
  const expectedCoin = options.coin.trim().toUpperCase();
  const lines = text.normalize('NFKC').replace(/https?:\/\/\S+/gi, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const networkFields = labelledValues(lines, networkLabel);
  const detectedNetworks = [
    ...networkFields.flatMap((value) => identifyNetworks(value, true)),
    ...lines.filter((line) => !networkLabel.test(line) && !networkFields.includes(line))
      .flatMap((line) => identifyNetworks(line, false)),
  ];
  const coinFields = labelledValues(lines, coinLabel);
  const coinLines = lines.filter((line) => !coinLabel.test(line) && !coinFields.includes(line)
    && !warningText.test(line)).map((line) => {
      const value = stripNetworkAnnotations(stripNetworkNames(networkLabel.exec(line)?.[1] ?? line));
      return networkLabel.test(line) || networkFields.includes(line)
        ? value.replace(/^(?:eth|btc|sol|trx|op|matic)$/i, '') : value;
    });
  const symbols = [...new Set([...knownCoins, expectedCoin])];
  const detectedCoins = coinLines.flatMap((line) => {
    const found = symbols.filter((symbol) => new RegExp(`(?<![A-Z0-9._-])${escape(symbol)}(?![A-Z0-9._-])`, 'i')
      .test(stripNetworkAnnotations(line)));
    return found;
  });
  detectedCoins.push(...coinFields.filter(Boolean).flatMap((value) => {
    if (warningText.test(value)) return [value.toUpperCase()];
    const found = symbols.filter((symbol) => new RegExp(`(?<![A-Z0-9._-])${escape(symbol)}(?![A-Z0-9._-])`, 'i')
      .test(stripNetworkAnnotations(stripNetworkNames(value))));
    return found.length ? found : [value.toUpperCase()];
  }));
  detectedCoins.push(...noisyCoinMentions(coinLines, symbols));
  return { coin: check(expectedCoin, detectedCoins), network: check(options.network, detectedNetworks) };
}

export function metadataFailure(metadata: MetadataVerification): FailureReason | undefined {
  for (const field of ['network', 'coin'] as const) {
    const status = metadata[field].status;
    if (status === 'missing') return `missing-${field}`;
    if (status === 'ambiguous') return `ambiguous-${field}`;
    if (status === 'mismatch') return `${field}-mismatch`;
  }
}
