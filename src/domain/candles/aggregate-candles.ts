import type { AggregatedCandle, Candle } from './candle';
import { TIMEFRAME_DURATION_MS, type Timeframe } from './timeframe';

function toIsoZ(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Aggregates 1 minute candles into the requested timeframe. Buckets are anchored
 * to the UTC epoch: floor(ts / duration) * duration. The input candles must come
 * deduplicated and sorted, because open and close take the first and the last
 * candle of each group.
 */
export function aggregateCandles(
  candles: readonly Candle[],
  tf: Timeframe,
): readonly AggregatedCandle[] {
  const bucketMs = TIMEFRAME_DURATION_MS[tf];
  const buckets = new Map<number, Candle[]>();

  for (const candle of candles) {
    const bucketStart = Math.floor(Date.parse(candle.ts) / bucketMs) * bucketMs;
    const bucket = buckets.get(bucketStart);
    if (bucket) bucket.push(candle);
    else buckets.set(bucketStart, [candle]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucketStart, rows]) => ({
      t: toIsoZ(bucketStart),
      o: rows[0].open,
      h: rows.reduce((max, row) => Math.max(max, row.high), -Infinity),
      l: rows.reduce((min, row) => Math.min(min, row.low), Infinity),
      c: rows[rows.length - 1].close,
      v: rows.reduce((sum, row) => sum + row.volume, 0),
    }));
}
