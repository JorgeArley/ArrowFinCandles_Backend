import { existsSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';

export const CANDLES_FILE = 'candles_1m.json';
export const INSTRUMENTS_FILE = 'instruments.json';

function containsDataset(dir: string): boolean {
  return existsSync(join(dir, 'dataset', CANDLES_FILE));
}

/**
 * Sube por el arbol de directorios buscando la carpeta del dataset. Asi el
 * resultado no depende de la profundidad a la que se compilen los fuentes.
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
 * Localiza la carpeta del dataset. Si se define DATASET_DIR se respeta en
 * exclusiva: un override invalido es un error, no un motivo para caer al
 * dataset por defecto.
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
      `No se encontro la carpeta "dataset": DATASET_DIR="${override}" ` +
        `no contiene "${CANDLES_FILE}"`,
    );
  }

  const upwards = findDatasetDirUpwards(__dirname);
  if (upwards) return upwards;

  const fromCwd = join(process.cwd(), 'dataset');
  if (existsSync(join(fromCwd, CANDLES_FILE))) return fromCwd;

  throw new Error(
    'No se encontro la carpeta "dataset". Define DATASET_DIR con su ruta absoluta.',
  );
}

export function readJsonFile<T>(filePath: string): T {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`No se pudo leer "${filePath}": ${reason}`);
  }

  try {
    return JSON.parse(content) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`"${filePath}" no contiene JSON valido: ${reason}`);
  }
}
