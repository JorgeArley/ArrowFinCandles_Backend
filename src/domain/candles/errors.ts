import { SUPPORTED_SYMBOLS } from './symbol';
import { TIMEFRAMES } from './timeframe';

/** Error de negocio: la peticion es invalida y se traduce a un 400. */
export class ValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ValidationError';
  }
}

export class InvalidSymbolError extends ValidationError {
  constructor(value: string) {
    super(
      'INVALID_SYMBOL',
      `symbol "${value}" must be one of the following values: ${SUPPORTED_SYMBOLS.join(', ')}`,
    );
  }
}

export class InvalidTimeframeError extends ValidationError {
  constructor(value: string) {
    super(
      'INVALID_TIMEFRAME',
      `tf "${value}" must be one of the following values: ${TIMEFRAMES.join(', ')}`,
    );
  }
}
