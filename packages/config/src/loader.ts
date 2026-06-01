import { config as loadDotenv } from 'dotenv';
import { ConfigError } from '@directorai/shared';
import { AppConfigSchema, type AppConfig } from './schema.js';

export interface LoadConfigOptions {
  envPath?: string;
  overrides?: Partial<AppConfig>;
}

export function loadConfig(options: LoadConfigOptions = {}): AppConfig {
  if (options.envPath) {
    loadDotenv({ path: options.envPath });
  } else {
    loadDotenv();
  }

  // Treat empty strings the same as undefined so an inherited but-empty env
  // var doesn't break schema validation (e.g. ANTHROPIC_API_KEY="" → undefined).
  const env = (k: string): string | undefined => {
    const v = process.env[k];
    return v && v.length > 0 ? v : undefined;
  };

  const raw = {
    env: env('NODE_ENV'),
    logLevel: env('LOG_LEVEL'),
    server: {
      host: env('SERVER_HOST'),
      port: env('SERVER_PORT') ? Number(env('SERVER_PORT')) : undefined,
      wsPort: env('WS_PORT') ? Number(env('WS_PORT')) : undefined,
    },
    llm: {
      provider: env('LLM_PROVIDER') as 'anthropic' | 'openai' | 'gemini' | undefined,
      apiKey: env('ANTHROPIC_API_KEY') ?? env('LLM_API_KEY'),
      model: env('LLM_MODEL'),
      maxTokens: env('LLM_MAX_TOKENS') ? Number(env('LLM_MAX_TOKENS')) : undefined,
    },
    context: {
      url: process.env.CONTEXT_ENGINE_URL,
      whisperModel: process.env.WHISPER_MODEL,
    },
    premiere: {
      version: process.env.PREMIERE_VERSION,
    },
    sentry: {
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE
        ? Number(process.env.SENTRY_TRACES_SAMPLE_RATE)
        : undefined,
      release: process.env.SENTRY_RELEASE,
    },
    telemetry: {
      enabled: process.env.TELEMETRY_ENABLED === 'true' || undefined,
      storePath: process.env.TELEMETRY_STORE_PATH,
    },
    ...options.overrides,
  };

  const cleaned = JSON.parse(JSON.stringify(raw, (_, v) => (v === undefined ? undefined : v)));

  const result = AppConfigSchema.safeParse(cleaned);
  if (!result.success) {
    throw new ConfigError('Invalid configuration', { issues: result.error.issues });
  }

  return result.data;
}
