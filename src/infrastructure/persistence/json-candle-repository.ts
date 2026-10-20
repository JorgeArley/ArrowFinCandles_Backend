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
 * Valida la estructura de cada fila. Una fila invalida impide arrancar el
 * servicio en vez de devolver NaN o valores truncados mas adelante.
 */
function validateCandleRows(rows: unknown, filePath: string): Candle[] {
  if (!Array.isArray(rows)) {
    throw new Error(`"${filePath}" deberia contener un array de velas`);
  }

  return rows.map((row, index) => {
    if (typeof row !== 'object' || row === null) {
      throw new Error(`"${filePath}": la fila ${index} no es un objeto`);
    }

    const { symbol, ts, open, high, low, close, volume } = row as Candle;

    if (typeof symbol !== 'string' || symbol.length === 0) {
      throw new Error(
        `"${filePath}": la fila ${index} no tiene un symbol valido`,
      );
    }
    if (typeof ts !== 'string' || Number.isNaN(Date.parse(ts))) {
      throw new Error(`"${filePath}": la fila ${index} no tiene un ts valido`);
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
          `"${filePath}": la fila ${index} (${symbol} ${ts}) tiene "${field}" no numerico`,
        );
      }
    }

    return { symbol, ts, open, high, low, close, volume };
  });
}

/**
 * Adaptador de salida: carga el dataset del disco una sola vez al arrancar y
 * lo mantiene en memoria. Implementa el puerto CandleRepository del dominio.
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
      `Dataset cargado: ${rows.length} filas, ${candles.length} velas unicas, ` +
        `${duplicatesRemoved} duplicados descartados, ${conflicts.length} conflictos`,
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
        `Conflicto en ${conflict.symbol} ${conflict.ts}: se conserva ` +
          `${JSON.stringify(conflict.kept)} y se descartan ` +
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
        : ' ni en instruments.json';
      this.logger.warn(
        `El dataset contiene el simbolo "${symbol}" que no esta en la lista de ` +
          `simbolos soportados${inInstruments}. No sera consultable.`,
      );
    }
  }
}
