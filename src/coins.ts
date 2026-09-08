export const projectCoins = ['USDT', 'USDC'] as const;

export function isProjectCoin(value: string): boolean {
  return projectCoins.includes(value as typeof projectCoins[number]);
}
