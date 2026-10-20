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

describe('las filas duplicadas no alteran el resultado', () => {
  describe('el volumen no se cuenta dos veces', () => {
    it('una vela con volumen 100 repetida no produce un volumen de 200', () => {
      const original = candle({ volume: 100 });
      const polluted = [original, { ...original }, { ...original }];

      const [aggregated] = aggregateCandles(
        deduplicateCandles(polluted).candles,
        '1m',
      );

      assert.equal(aggregated.v, 100);
      assert.notEqual(aggregated.v, 200);
    });

    it('descarta los reenvios y lo deja registrado', () => {
      const original = candle({ volume: 100 });
      const result = deduplicateCandles([original, { ...original }]);

      assert.equal(result.candles.length, 1);
      assert.equal(result.duplicatesRemoved, 1);
      assert.equal(result.conflicts.length, 0);
    });
  });

  describe('invariancia sobre el dataset real', () => {
    const rows = loadRawCandles();

    for (const symbol of SYMBOLS) {
      for (const tf of TIMEFRAMES) {
        it(`el resultado de ${symbol} en ${tf} no cambia al inyectar duplicados`, () => {
          const symbolRows = rows.filter((row) => row.symbol === symbol);

          const baseline = aggregateCandles(
            deduplicateCandles(symbolRows).candles,
            tf,
          );

          // Cada fila se reenvia tres veces y el conjunto se baraja.
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

    it('reenviar el dataset entero no altera ningun volumen agregado', () => {
      const baseline = aggregateCandles(deduplicateCandles(rows).candles, '5m');
      const polluted = aggregateCandles(
        deduplicateCandles([...rows, ...rows]).candles,
        '5m',
      );

      assert.deepEqual(polluted, baseline);
      for (const c of polluted) {
        const original = baseline.find((b) => b.t === c.t);
        assert.equal(c.v, original!.v, `el volumen de ${c.t} ha cambiado`);
      }
    });

    it('el resultado no depende del orden en que llegan las filas', () => {
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

  describe('los duplicados concretos del dataset', () => {
    const { candles, duplicatesRemoved } = deduplicateCandles(loadRawCandles());

    it('el dataset tiene 3 reenvios y 772 velas unicas', () => {
      assert.equal(duplicatesRemoved, 3);
      assert.equal(candles.length, 772);
    });

    it('el minuto duplicado de MES 14:11 conserva su volumen', () => {
      const candle = candles.find((c) => c.ts === '2026-08-25T14:11:00Z');

      assert.equal(candle!.volume, 2065);
    });

    it('el grupo de MES 14:10 en 5m no suma los minutos reenviados', () => {
      const aggregated = aggregateCandles(
        candles.filter((c) => c.symbol === 'MES'),
        '5m',
      );
      const at1410 = aggregated.find((c) => c.t === '2026-08-25T14:10:00Z');

      assert.equal(at1410!.v, 9896);
      assert.notEqual(at1410!.v, 13635);
    });

    it('el minuto duplicado de NQ 15:22 conserva su volumen', () => {
      const candle = candles.find(
        (c) => c.symbol === 'NQ' && c.ts === '2026-08-25T15:22:00Z',
      );

      assert.equal(candle!.volume, 354);
    });
  });

  describe('filas que comparten minuto pero no son la misma vela', () => {
    it('no se fusionan como duplicados ni suman sus volumenes', () => {
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
