import pino, { type Logger, type LoggerOptions } from 'pino';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface CreateLoggerOptions {
  name: string;
  level?: LogLevel;
  pretty?: boolean;
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const { name, level = 'info', pretty = process.env.NODE_ENV !== 'production' } = options;

  const config: LoggerOptions = {
    name,
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: undefined,
  };

  if (pretty) {
    return pino({
      ...config,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(config);
}

export type { Logger };
