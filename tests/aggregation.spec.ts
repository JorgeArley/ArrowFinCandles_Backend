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

/** Velas de 1 minuto dentro del mismo grupo de 5 minutos, con valores conocidos. */
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

describe('calculos de agregacion', () => {
  describe('reglas open, high, low, close y volume', () => {
    const [aggregated] = aggregateCandles(MINUTE_GROUP, '5m');

    it('open es el open de la primera vela del grupo', () => {
      assert.equal(aggregated.o, 10);
    });

    it('close es el close de la ultima vela del grupo', () => {
      assert.equal(aggregated.c, 15);
    });

    it('high es el maximo de los high del grupo', () => {
      assert.equal(aggregated.h, 16);
    });

    it('low es el minimo de los low del grupo', () => {
      assert.equal(aggregated.l, 8);
    });

    it('volume es la suma de los volumenes del grupo', () => {
      assert.equal(aggregated.v, 600);
    });
  });

  describe('limites temporales de cada grupo', () => {
    it('agrupa por minutos anchored al epoch UTC', () => {
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

    it('una vela de las 14:05 abre el grupo siguiente', () => {
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

    it('el grupo horario contiene todos los minutos de esa hora', () => {
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

    it('en 1m cada vela conserva su propio grupo', () => {
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

  describe('orden y grupos incompletos', () => {
    it('devuelve las velas de la mas antigua a la mas reciente', () => {
      const aggregated = aggregateCandles(MINUTE_GROUP, '1m');
      const timestamps = aggregated.map((c) => c.t);

      assert.deepEqual(timestamps, [...timestamps].sort());
    });

    it('un grupo con minutos ausentes se agrega con los minutos que existen', () => {
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

    it('sin velas devuelve un array vacio', () => {
      assert.deepEqual(aggregateCandles([], '5m'), []);
    });

    it('nunca produce NaN ni Infinity', () => {
      const aggregated = aggregateCandles(
        deduplicateCandles(loadRawCandles()).candles,
        '15m',
      );

      for (const c of aggregated) {
        assert.ok(Number.isFinite(c.o), `o no finito en ${c.t}`);
        assert.ok(Number.isFinite(c.h), `h no finito en ${c.t}`);
        assert.ok(Number.isFinite(c.l), `l no finito en ${c.t}`);
        assert.ok(Number.isFinite(c.c), `c no finito en ${c.t}`);
        assert.ok(Number.isFinite(c.v), `v no finito en ${c.t}`);
      }
    });
  });

  describe('sobre el dataset real', () => {
    const rows = loadRawCandles();
    const candles = deduplicateCandles(rows).candles;

    const aggregateFor = (symbol: string, tf: Timeframe) =>
      aggregateCandles(
        candles.filter((c) => c.symbol === symbol),
        tf,
      );

    it('produce el numero de velas esperado en cada timeframe', () => {
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
          `${key} deberia tener ${count} velas`,
        );
      }
    });

    it('agrega MES en 5m con los valores esperados', () => {
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

    it('agrega el grupo de las 14:00 con los valores esperados', () => {
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

    it('el grupo horario inicial cubre solo los minutos de la sesion', () => {
      const aggregated = aggregateFor('MES', '1h');

      assert.equal(aggregated[0].t, '2026-08-25T13:00:00Z');
      assert.equal(aggregated[0].o, 5630);
      assert.equal(aggregated[0].v, 68982);
    });

    it('el ultimo grupo de la sesion cierra con el cierre del ultimo minuto', () => {
      const aggregated = aggregateFor('MES', '5m');
      const last = aggregated[aggregated.length - 1];

      assert.equal(last.t, '2026-08-25T19:55:00Z');
      assert.equal(last.c, 5652.75);
      assert.equal(last.v, 12737);
    });
  });
});
