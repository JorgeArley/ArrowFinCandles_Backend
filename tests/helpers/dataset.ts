import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Candle } from '../../src/domain/candles/candle';

export interface Instrument {
  symbol: string;
  description: string;
  tick_size: number;
}

export const DATASET_DIR = join(__dirname, '..', '..', 'dataset');

/** Filas tal cual vienen en el dataset: sin ordenar y con duplicados. */
export function loadRawCandles(): Candle[] {
  const content = readFileSync(join(DATASET_DIR, 'candles_1m.json'), 'utf-8');
  return JSON.parse(content) as Candle[];
}

export function loadInstruments(): Instrument[] {
  const content = readFileSync(join(DATASET_DIR, 'instruments.json'), 'utf-8');
  return JSON.parse(content) as Instrument[];
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Barajado determinista: la misma semilla produce siempre el mismo orden. */
export function shuffle<T>(items: readonly T[], seed = 42): T[] {
  const random = mulberry32(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
