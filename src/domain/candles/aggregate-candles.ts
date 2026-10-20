import type { AggregatedCandle, Candle } from './candle';
import { TIMEFRAME_DURATION_MS, type Timeframe } from './timeframe';

function toIsoZ(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Agrega velas de 1 minuto en el timeframe pedido. Los buckets van anclados al
 * epoch UTC: floor(ts / duracion) * duracion. Las velas de entrada deben venir
 * deduplicadas y ordenadas, porque open y close toman la primera y la ultima
 * vela de cada grupo.
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
