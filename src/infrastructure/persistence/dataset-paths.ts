import { existsSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';

export const CANDLES_FILE = 'candles_1m.json';
export const INSTRUMENTS_FILE = 'instruments.json';

function containsDataset(dir: string): boolean {
  return existsSync(join(dir, 'dataset', CANDLES_FILE));
}

/**
 * Walks up the directory tree looking for the dataset folder. That way the
 * result does not depend on how deep the sources are compiled.
 */
function findDatasetDirUpwards(start: string): string | undefined {
  let current = start;

  for (;;) {
    if (containsDataset(current)) return join(current, 'dataset');
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/**
 * Locates the dataset folder. When DATASET_DIR is defined it is honoured
 * exclusively: an invalid override is an error, not a reason to fall back to
 * the default dataset.
 */
export function resolveDatasetDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env.DATASET_DIR;
  if (override) {
    const base = isAbsolute(override) ? override : resolve(override);
    const dir = existsSync(join(base, CANDLES_FILE))
      ? base
      : join(base, 'dataset');

    if (existsSync(join(dir, CANDLES_FILE))) return dir;

    throw new Error(
      `Dataset folder "dataset" not found: DATASET_DIR="${override}" does not contain "${CANDLES_FILE}"`,
    );
  }

  const upwards = findDatasetDirUpwards(__dirname);
  if (upwards) return upwards;

  const fromCwd = join(process.cwd(), 'dataset');
  if (existsSync(join(fromCwd, CANDLES_FILE))) return fromCwd;

  throw new Error(
    'Dataset folder "dataset" not found. Set DATASET_DIR to its absolute path.',
  );
}

export function readJsonFile<T>(filePath: string): T {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read "${filePath}": ${reason}`);
  }

  try {
    return JSON.parse(content) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`"${filePath}" does not contain valid JSON: ${reason}`);
  }
}
