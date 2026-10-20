export const SUPPORTED_SYMBOLS = ['MES', 'NQ'] as const;

export type ContractSymbol = (typeof SUPPORTED_SYMBOLS)[number];

export function isSupportedSymbol(value: string): value is ContractSymbol {
  return (SUPPORTED_SYMBOLS as readonly string[]).includes(value);
}
