import { aggregateCandles } from '../../domain/candles/aggregate-candles';
import type { CandlesResponse } from '../../domain/candles/candle';
import type { CandleRepository } from '../../domain/candles/candle-repository';
import {
  InvalidSymbolError,
  InvalidTimeframeError,
} from '../../domain/candles/errors';
import {
  isSupportedSymbol,
  type ContractSymbol,
} from '../../domain/candles/symbol';
import {
  isSupportedTimeframe,
  type Timeframe,
} from '../../domain/candles/timeframe';

export interface GetCandlesRequest {
  readonly symbol: string;
  readonly tf: string;
}

export class GetCandlesUseCase {
  constructor(private readonly candles: CandleRepository) {}

  execute(request: GetCandlesRequest): CandlesResponse {
    const symbol = this.parseSymbol(request.symbol);
    const tf = this.parseTimeframe(request.tf);

    return {
      symbol,
      tf,
      candles: aggregateCandles(this.candles.getBySymbol(symbol), tf),
    };
  }

  private parseSymbol(value: string): ContractSymbol {
    if (!isSupportedSymbol(value)) throw new InvalidSymbolError(value);
    return value;
  }

  private parseTimeframe(value: string): Timeframe {
    if (!isSupportedTimeframe(value)) throw new InvalidTimeframeError(value);
    return value;
  }
}
