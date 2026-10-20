import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  deduplicateCandles,
  type CandleConflict,
} from '../../domain/candles/deduplicate-candles';
import type { Candle } from '../../domain/candles/candle';
import type { CandleRepository } from '../../domain/candles/candle-repository';
import { SUPPORTED_SYMBOLS } from '../../domain/candles/symbol';
import {
  CANDLES_FILE,
  INSTRUMENTS_FILE,
  readJsonFile,
  resolveDatasetDir,
} from './dataset-paths';

interface Instrument {
  symbol: string;
  description: string;
  tick_size: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validates the shape of every row. An invalid row prevents the service from
 * starting instead of returning NaN or truncated values further down.
 */
function validateCandleRows(rows: unknown, filePath: string): Candle[] {
  if (!Array.isArray(rows)) {
    throw new Error(`"${filePath}" should contain an array of candles`);
  }

  return rows.map((row, index) => {
    if (typeof row !== 'object' || row === null) {
      throw new Error(`"${filePath}": row ${index} is not an object`);
    }

    const { symbol, ts, open, high, low, close, volume } = row as Candle;

    if (typeof symbol !== 'string' || symbol.length === 0) {
      throw new Error(`"${filePath}": row ${index} has no valid symbol`);
    }
    if (typeof ts !== 'string' || Number.isNaN(Date.parse(ts))) {
      throw new Error(`"${filePath}": row ${index} has no valid ts`);
    }
    for (const [field, value] of Object.entries({
      open,
      high,
      low,
      close,
      volume,
    })) {
      if (!isFiniteNumber(value)) {
        throw new Error(
          `"${filePath}": row ${index} (${symbol} ${ts}) has a non-numeric "${field}"`,
        );
      }
    }

    return { symbol, ts, open, high, low, close, volume };
  });
}

/**
 * Outbound adapter: loads the dataset from disk once at startup and keeps it
 * in memory. Implements the CandleRepository port of the domain.
 */
@Injectable()
export class JsonCandleRepository implements CandleRepository, OnModuleInit {
  private readonly logger = new Logger(JsonCandleRepository.name);
  private readonly index = new Map<string, Candle[]>();

  onModuleInit(): void {
    const dir = resolveDatasetDir();
    const candlesPath = `${dir}/${CANDLES_FILE}`;
    const instrumentsPath = `${dir}/${INSTRUMENTS_FILE}`;

    const rows = validateCandleRows(
      readJsonFile<unknown>(candlesPath),
      candlesPath,
    );
    const instruments = readJsonFile<Instrument[]>(instrumentsPath);

    this.warnOnUnknownSymbols(rows, instruments);

    const { candles, duplicatesRemoved, conflicts } = deduplicateCandles(rows);
    this.reportConflicts(conflicts);
    this.buildIndex(candles);

    this.logger.log(
      `Dataset loaded: ${rows.length} rows, ${candles.length} unique candles, ` +
        `${duplicatesRemoved} duplicates discarded, ${conflicts.length} conflicts`,
    );
  }

  getBySymbol(symbol: string): readonly Candle[] {
    return this.index.get(symbol) ?? [];
  }

  private buildIndex(candles: readonly Candle[]): void {
    for (const candle of candles) {
      const existing = this.index.get(candle.symbol);
      if (existing) existing.push(candle);
      else this.index.set(candle.symbol, [candle]);
    }
  }

  private reportConflicts(conflicts: readonly CandleConflict[]): void {
    for (const conflict of conflicts) {
      this.logger.warn(
        `Conflict on ${conflict.symbol} ${conflict.ts}: keeping ` +
          `${JSON.stringify(conflict.kept)} and discarding ` +
          `${JSON.stringify(conflict.discarded)}`,
      );
    }
  }

  private warnOnUnknownSymbols(
    rows: readonly Candle[],
    instruments: readonly Instrument[],
  ): void {
    const declared = new Set(
      instruments.map((instrument) => instrument.symbol),
    );
    const known = new Set<string>(SUPPORTED_SYMBOLS);
    const unknown = new Set(
      rows.map((row) => row.symbol).filter((symbol) => !known.has(symbol)),
    );

    for (const symbol of unknown) {
      const inInstruments = declared.has(symbol)
        ? ''
        : ' nor in instruments.json';
      this.logger.warn(
        `The dataset contains the symbol "${symbol}" which is not in the list of ` +
          `supported symbols${inInstruments}. It will not be queryable.`,
      );
    }
  }
}
