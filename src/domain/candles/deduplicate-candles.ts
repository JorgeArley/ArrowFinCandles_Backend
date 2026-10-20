import type { Candle } from './candle';

/**
 * Dos filas con el mismo (symbol, ts) pero distinto OHLCV no son duplicados:
 * son observaciones contradictorias del mismo minuto. El README del dataset
 * garantiza una sola vela por simbolo y minuto, asi que un conflicto es una
 * anomalia, no informacion legitima que se pueda descartar en silencio.
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
 * Orden total e independiente del orden del archivo: primero las velas bien
 * formadas, luego la de mayor volumen y por ultimo un desempate lexicografico.
 * Asi el resultado no depende de como venga ordenado el JSON.
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
 * Identidad de duplicado segun el README del dataset: un duplicado es "la misma
 * vela reenviada", es decir, una fila identica en todos sus campos. La copia
 * repetida no aporta volumen, asi que se conserva una sola vez.
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
      // Mismo minuto y mismo contenido: la misma vela reenviada.
      // Se conserva una sola copia para que el volumen se cuente una vez.
      candles.push(group[0]);
      duplicatesRemoved += group.length - 1;
      continue;
    }

    // Conflicto: no son duplicados. Se conserva la observacion mas completa,
    // se reporta el conflicto y los volumenes nunca se suman.
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
