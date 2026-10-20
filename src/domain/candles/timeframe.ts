export const TIMEFRAMES = ['1m', '5m', '15m', '1h'] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

export const TIMEFRAME_DURATION_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
};

export function isSupportedTimeframe(value: string): value is Timeframe {
  return (TIMEFRAMES as readonly string[]).includes(value);
}
