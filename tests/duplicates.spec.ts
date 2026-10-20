import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateCandles } from '../src/domain/candles/aggregate-candles';
import { deduplicateCandles } from '../src/domain/candles/deduplicate-candles';
import type { Candle } from '../src/domain/candles/candle';
import { TIMEFRAMES } from '../src/domain/candles/timeframe';
import { loadRawCandles, shuffle } from './helpers/dataset';

const SYMBOLS = ['MES', 'NQ'] as const;

function candle(overrides: Partial<Candle> = {}): Candle {
  return {
    symbol: 'MES',
    ts: '2026-08-25T14:00:00Z',
    open: 5635.75,
    high: 5636.75,
    low: 5627.5,
    close: 5628.75,
    volume: 100,
    ...overrides,
  };
}

describe('duplicate rows do not alter the result', () => {
  describe('the volume is not counted twice', () => {
    it('a candle with volume 100 repeated does not produce a volume of 200', () => {
      const original = candle({ volume: 100 });
      const polluted = [original, { ...original }, { ...original }];

      const [aggregated] = aggregateCandles(
        deduplicateCandles(polluted).candles,
        '1m',
      );

      assert.equal(aggregated.v, 100);
      assert.notEqual(aggregated.v, 200);
    });

    it('discards the resends and reports it', () => {
      const original = candle({ volume: 100 });
      const result = deduplicateCandles([original, { ...original }]);

      assert.equal(result.candles.length, 1);
      assert.equal(result.duplicatesRemoved, 1);
      assert.equal(result.conflicts.length, 0);
    });
  });

  describe('invariance over the real dataset', () => {
    const rows = loadRawCandles();

    for (const symbol of SYMBOLS) {
      for (const tf of TIMEFRAMES) {
        it(`the result of ${symbol} in ${tf} does not change when duplicates are injected`, () => {
          const symbolRows = rows.filter((row) => row.symbol === symbol);

          const baseline = aggregateCandles(
            deduplicateCandles(symbolRows).candles,
            tf,
          );

          // Every row is sent again three times and the set is shuffled.
          const polluted = shuffle([
            ...symbolRows,
            ...symbolRows.map((row) => ({ ...row })),
            ...symbolRows.map((row) => ({ ...row })),
            ...symbolRows.map((row) => ({ ...row })),
          ]);

          const result = aggregateCandles(
            deduplicateCandles(polluted).candles,
            tf,
          );

          assert.deepEqual(result, baseline);
        });
      }
    }

    it('resending the whole dataset does not change any aggregated volume', () => {
      const baseline = aggregateCandles(deduplicateCandles(rows).candles, '5m');
      const polluted = aggregateCandles(
        deduplicateCandles([...rows, ...rows]).candles,
        '5m',
      );

      assert.deepEqual(polluted, baseline);
      for (const c of polluted) {
        const original = baseline.find((b) => b.t === c.t);
        assert.equal(c.v, original!.v, `the volume of ${c.t} has changed`);
      }
    });

    it('the result does not depend on the order the rows arrive in', () => {
      const symbolRows = rows.filter((row) => row.symbol === 'MES');

      const baseline = aggregateCandles(
        deduplicateCandles(symbolRows).candles,
        '5m',
      );
      const shuffled = aggregateCandles(
        deduplicateCandles(shuffle(symbolRows, 7)).candles,
        '5m',
      );

      assert.deepEqual(shuffled, baseline);
    });
  });

  describe('the actual duplicates of the dataset', () => {
    const { candles, duplicatesRemoved } = deduplicateCandles(loadRawCandles());

    it('the dataset has 3 resends and 772 unique candles', () => {
      assert.equal(duplicatesRemoved, 3);
      assert.equal(candles.length, 772);
    });

    it('the duplicated minute MES 14:11 keeps its volume', () => {
      const candle = candles.find((c) => c.ts === '2026-08-25T14:11:00Z');

      assert.equal(candle!.volume, 2065);
    });

    it('the MES 14:10 group in 5m does not add up the resended minutes', () => {
      const aggregated = aggregateCandles(
        candles.filter((c) => c.symbol === 'MES'),
        '5m',
      );
      const at1410 = aggregated.find((c) => c.t === '2026-08-25T14:10:00Z');

      assert.equal(at1410!.v, 9896);
      assert.notEqual(at1410!.v, 13635);
    });

    it('the duplicated minute NQ 15:22 keeps its volume', () => {
      const candle = candles.find(
        (c) => c.symbol === 'NQ' && c.ts === '2026-08-25T15:22:00Z',
      );

      assert.equal(candle!.volume, 354);
    });
  });

  describe('rows that share a minute but are not the same candle', () => {
    it('they are not merged as duplicates and their volumes are not summed', () => {
      const original = candle({ volume: 100 });
      const conflicting = candle({ volume: 150, close: 5630 });

      const result = deduplicateCandles([original, conflicting]);

      assert.equal(result.conflicts.length, 1);
      assert.equal(result.duplicatesRemoved, 0);
      assert.equal(result.candles.length, 1);
      assert.equal(result.candles[0].volume, 150);
    });
  });
});
