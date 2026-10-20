import type { Candle } from './candle';

export const CANDLE_REPOSITORY = Symbol('CandleRepository');

/**
 * Outbound port of the domain. The infrastructure implements this contract; the
 * domain knows nothing about files, Nest or where the data comes from.
 */
export interface CandleRepository {
  getBySymbol(symbol: string): readonly Candle[];
}
