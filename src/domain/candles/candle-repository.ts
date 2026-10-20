import type { Candle } from './candle';

export const CANDLE_REPOSITORY = Symbol('CandleRepository');

/**
 * Puerto de salida del dominio. La infraestructura implementa este contrato;
 * el dominio no sabe de ficheros, de Nest ni de donde vienen los datos.
 */
export interface CandleRepository {
  getBySymbol(symbol: string): readonly Candle[];
}
