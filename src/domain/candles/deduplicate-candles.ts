import type { Candle } from './candle';

/**
 * Two rows sharing the same (symbol, ts) but with a different OHLCV are not
 * duplicates: they are contradictory observations of the same minute. The
 * dataset README guarantees a single candle per symbol and minute, so a
 * conflict is an anomaly, not legitimate data that can be discarded silently.
 */
export interface CandleConflict {
  readonly symbol: string;
  readonly ts: string;
  readonly kept: Candle;
  readonly discarded: readonly Candle[];
}

export interface DeduplicationResult {
  readonly candles: readonly Candle[];
  readonly duplicatesRemoved: number;
  readonly conflicts: readonly CandleConflict[];
}

function contentKey(candle: Candle): string {
  return [
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.volume,
  ].join('|');
}

function isWellFormed(candle: Candle): boolean {
  return (
    candle.low <= candle.open &&
    candle.open <= candle.close &&
    candle.close <= candle.high &&
    candle.volume >= 0
  );
}

/**
 * Total order that does not depend on the order of the file: well formed
 * candles first, then the one with the highest volume, and finally a
 * lexicographic tiebreak. The result is the same no matter how the JSON is
 * ordered.
 */
function compareCandidates(a: Candle, b: Candle): number {
  if (isWellFormed(a) !== isWellFormed(b)) return isWellFormed(a) ? -1 : 1;
  if (a.volume !== b.volume) return b.volume - a.volume;
  if (a.high !== b.high) return b.high - a.high;
  if (a.low !== b.low) return a.low - b.low;
  if (a.open !== b.open) return a.open - b.open;
  return a.close - b.close;
}

/**
 * Duplicate identity according to the dataset README: a duplicate is "the same
 * candle sent again", that is, a row identical in every field. The repeated
 * copy carries no volume, so only one of them is kept.
 */
export function deduplicateCandles(
  rows: readonly Candle[],
): DeduplicationResult {
  const byMinute = new Map<string, Candle[]>();

  for (const row of rows) {
    const key = `${row.symbol}|${row.ts}`;
    const group = byMinute.get(key);
    if (group) group.push(row);
    else byMinute.set(key, [row]);
  }

  const candles: Candle[] = [];
  const conflicts: CandleConflict[] = [];
  let duplicatesRemoved = 0;

  for (const group of byMinute.values()) {
    const variants = new Map<string, Candle>();
    for (const row of group) {
      const key = contentKey(row);
      if (!variants.has(key)) variants.set(key, row);
    }

    if (variants.size === 1) {
      // Same minute and same content: the same candle sent again.
      // A single copy is kept so the volume is counted once.
      candles.push(group[0]);
      duplicatesRemoved += group.length - 1;
      continue;
    }

    // Conflict: not duplicates. The most complete observation is kept, the
    // conflict is reported and the volumes are never summed.
    const candidates = [...variants.values()].sort(compareCandidates);
    const kept = candidates[0];
    const keptCopies = group.filter(
      (row) => contentKey(row) === contentKey(kept),
    ).length;

    candles.push(kept);
    duplicatesRemoved += keptCopies - 1;
    conflicts.push({
      symbol: kept.symbol,
      ts: kept.ts,
      kept,
      discarded: candidates.slice(1),
    });
  }

  candles.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  return { candles, duplicatesRemoved, conflicts };
}
