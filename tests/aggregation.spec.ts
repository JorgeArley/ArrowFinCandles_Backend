import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateCandles } from '../src/domain/candles/aggregate-candles';
import { deduplicateCandles } from '../src/domain/candles/deduplicate-candles';
import type { Candle } from '../src/domain/candles/candle';
import type { Timeframe } from '../src/domain/candles/timeframe';
import { loadRawCandles } from './helpers/dataset';

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

/** 1 minute candles within the same 5 minute group, with known values. */
const MINUTE_GROUP: readonly Candle[] = [
  candle({
    ts: '2026-08-25T14:00:00Z',
    open: 10,
    high: 12,
    low: 9,
    close: 11,
    volume: 100,
  }),
  candle({
    ts: '2026-08-25T14:01:00Z',
    open: 11,
    high: 15,
    low: 8,
    close: 14,
    volume: 200,
  }),
  candle({
    ts: '2026-08-25T14:02:00Z',
    open: 14,
    high: 16,
    low: 13,
    close: 15,
    volume: 300,
  }),
];

describe('aggregation calculations', () => {
  describe('open, high, low, close and volume rules', () => {
    const [aggregated] = aggregateCandles(MINUTE_GROUP, '5m');

    it('open is the open of the first candle of the group', () => {
      assert.equal(aggregated.o, 10);
    });

    it('close is the close of the last candle of the group', () => {
      assert.equal(aggregated.c, 15);
    });

    it('high is the highest high of the group', () => {
      assert.equal(aggregated.h, 16);
    });

    it('low is the lowest low of the group', () => {
      assert.equal(aggregated.l, 8);
    });

    it('volume is the sum of the volumes of the group', () => {
      assert.equal(aggregated.v, 600);
    });
  });

  describe('time boundaries of each group', () => {
    it('groups minutes anchored to the UTC epoch', () => {
      const aggregated = aggregateCandles(
        [
          candle({ ts: '2026-08-25T14:00:00Z' }),
          candle({ ts: '2026-08-25T14:04:00Z' }),
        ],
        '5m',
      );

      assert.equal(aggregated.length, 1);
      assert.equal(aggregated[0].t, '2026-08-25T14:00:00Z');
    });

    it('a candle at 14:05 opens the next group', () => {
      const aggregated = aggregateCandles(
        [
          candle({ ts: '2026-08-25T14:04:00Z' }),
          candle({ ts: '2026-08-25T14:05:00Z' }),
        ],
        '5m',
      );

      assert.deepEqual(
        aggregated.map((c) => c.t),
        ['2026-08-25T14:00:00Z', '2026-08-25T14:05:00Z'],
      );
    });

    it('the hourly group holds every minute of that hour', () => {
      const aggregated = aggregateCandles(
        [
          candle({ ts: '2026-08-25T13:58:00Z' }),
          candle({ ts: '2026-08-25T13:59:00Z' }),
          candle({ ts: '2026-08-25T14:00:00Z' }),
        ],
        '1h',
      );

      assert.deepEqual(
        aggregated.map((c) => c.t),
        ['2026-08-25T13:00:00Z', '2026-08-25T14:00:00Z'],
      );
    });

    it('in 1m every candle keeps its own group', () => {
      const aggregated = aggregateCandles(MINUTE_GROUP, '1m');

      assert.deepEqual(
        aggregated.map((c) => c.t),
        [
          '2026-08-25T14:00:00Z',
          '2026-08-25T14:01:00Z',
          '2026-08-25T14:02:00Z',
        ],
      );
      assert.deepEqual(
        aggregated.map((c) => c.v),
        [100, 200, 300],
      );
    });
  });

  describe('ordering and incomplete groups', () => {
    it('returns the candles from oldest to newest', () => {
      const aggregated = aggregateCandles(MINUTE_GROUP, '1m');
      const timestamps = aggregated.map((c) => c.t);

      assert.deepEqual(timestamps, [...timestamps].sort());
    });

    it('a group with missing minutes is aggregated with the minutes that exist', () => {
      const aggregated = aggregateCandles(
        [
          candle({ ts: '2026-08-25T15:45:00Z', volume: 10 }),
          candle({ ts: '2026-08-25T15:46:00Z', volume: 20 }),
          candle({ ts: '2026-08-25T15:49:00Z', volume: 30 }),
        ],
        '5m',
      );

      assert.equal(aggregated.length, 1);
      assert.equal(aggregated[0].v, 60);
    });

    it('returns an empty array when there are no candles', () => {
      assert.deepEqual(aggregateCandles([], '5m'), []);
    });

    it('never produces NaN nor Infinity', () => {
      const aggregated = aggregateCandles(
        deduplicateCandles(loadRawCandles()).candles,
        '15m',
      );

      for (const c of aggregated) {
        assert.ok(Number.isFinite(c.o), `o is not finite at ${c.t}`);
        assert.ok(Number.isFinite(c.h), `h is not finite at ${c.t}`);
        assert.ok(Number.isFinite(c.l), `l is not finite at ${c.t}`);
        assert.ok(Number.isFinite(c.c), `c is not finite at ${c.t}`);
        assert.ok(Number.isFinite(c.v), `v is not finite at ${c.t}`);
      }
    });
  });

  describe('over the real dataset', () => {
    const rows = loadRawCandles();
    const candles = deduplicateCandles(rows).candles;

    const aggregateFor = (symbol: string, tf: Timeframe) =>
      aggregateCandles(
        candles.filter((c) => c.symbol === symbol),
        tf,
      );

    it('produces the expected number of candles on every timeframe', () => {
      const expected: Record<string, number> = {
        'MES/1m': 388,
        'MES/5m': 78,
        'MES/15m': 26,
        'MES/1h': 7,
        'NQ/1m': 384,
        'NQ/5m': 78,
        'NQ/15m': 26,
        'NQ/1h': 7,
      };

      for (const [key, count] of Object.entries(expected)) {
        const [symbol, tf] = key.split('/') as [string, Timeframe];
        assert.equal(
          aggregateFor(symbol, tf).length,
          count,
          `${key} should have ${count} candles`,
        );
      }
    });

    it('aggregates MES in 5m with the expected values', () => {
      const aggregated = aggregateFor('MES', '5m');

      assert.deepEqual(aggregated[0], {
        t: '2026-08-25T13:30:00Z',
        o: 5630,
        h: 5635.25,
        l: 5629.75,
        c: 5635,
        v: 13195,
      });
    });

    it('aggregates the 14:00 group with the expected values', () => {
      const aggregated = aggregateFor('MES', '5m');
      const at1400 = aggregated.find((c) => c.t === '2026-08-25T14:00:00Z');

      assert.deepEqual(at1400, {
        t: '2026-08-25T14:00:00Z',
        o: 5635.75,
        h: 5636.75,
        l: 5627.5,
        c: 5628.75,
        v: 9940,
      });
    });

    it('the first hourly group only covers the minutes of the session', () => {
      const aggregated = aggregateFor('MES', '1h');

      assert.equal(aggregated[0].t, '2026-08-25T13:00:00Z');
      assert.equal(aggregated[0].o, 5630);
      assert.equal(aggregated[0].v, 68982);
    });

    it('the last group of the session closes with the close of the last minute', () => {
      const aggregated = aggregateFor('MES', '5m');
      const last = aggregated[aggregated.length - 1];

      assert.equal(last.t, '2026-08-25T19:55:00Z');
      assert.equal(last.c, 5652.75);
      assert.equal(last.v, 12737);
    });
  });
});
