import type { Timeframe } from './timeframe';

export interface Candle {
  readonly symbol: string;
  readonly ts: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface AggregatedCandle {
  readonly t: string;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
}

export interface CandlesResponse {
  readonly symbol: string;
  readonly tf: Timeframe;
  readonly candles: readonly AggregatedCandle[];
}
