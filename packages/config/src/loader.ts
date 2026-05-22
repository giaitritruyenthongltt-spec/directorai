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

  const raw = {
    env: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    server: {
      host: process.env.SERVER_HOST,
      port: process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : undefined,
      wsPort: process.env.WS_PORT ? Number(process.env.WS_PORT) : undefined,
    },
    llm: {
      provider: process.env.LLM_PROVIDER as 'anthropic' | 'openai' | 'gemini' | undefined,
      apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL,
      maxTokens: process.env.LLM_MAX_TOKENS ? Number(process.env.LLM_MAX_TOKENS) : undefined,
    },
    context: {
      url: process.env.CONTEXT_ENGINE_URL,
      whisperModel: process.env.WHISPER_MODEL,
    },
    premiere: {
      version: process.env.PREMIERE_VERSION,
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
