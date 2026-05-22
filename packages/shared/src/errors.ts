export type ErrorMetadata = Readonly<Record<string, unknown>>;

export class DirectorAIError extends Error {
  public readonly code: string;
  public readonly meta?: ErrorMetadata;

  constructor(code: string, message: string, options?: { cause?: unknown; meta?: ErrorMetadata }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    this.code = code;
    this.meta = options?.meta;
    if (typeof Error.captureStackTrace === 'function') {
      (Error.captureStackTrace as (t: object, c?: unknown) => void)(this, this.constructor);
    }
  }
}

export class ValidationError extends DirectorAIError {
  constructor(message: string, meta?: ErrorMetadata) {
    super('VALIDATION_ERROR', message, { meta });
  }
}

export class NotFoundError extends DirectorAIError {
  constructor(resource: string, id?: string) {
    super('NOT_FOUND', `${resource}${id ? ` "${id}"` : ''} not found`);
  }
}

export class AdapterError extends DirectorAIError {
  constructor(adapter: string, message: string, cause?: unknown) {
    super('ADAPTER_ERROR', `[${adapter}] ${message}`, { cause });
  }
}

export class ConfigError extends DirectorAIError {
  constructor(message: string, meta?: ErrorMetadata) {
    super('CONFIG_ERROR', message, { meta });
  }
}

export class TimeoutError extends DirectorAIError {
  constructor(operation: string, ms: number) {
    super('TIMEOUT', `Operation "${operation}" timed out after ${ms}ms`, { meta: { ms } });
  }
}
