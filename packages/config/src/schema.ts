import { z } from 'zod';

export const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);

export const ServerConfigSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.number().int().min(1).max(65535).default(7777),
  wsPort: z.number().int().min(1).max(65535).default(7778),
});

export const LLMConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'gemini']).default('anthropic'),
  apiKey: z.string().min(1).optional(),
  model: z.string().default('claude-opus-4-7'),
  maxTokens: z.number().int().positive().default(8192),
});

export const ContextEngineConfigSchema = z.object({
  url: z.string().url().default('http://127.0.0.1:8000'),
  whisperModel: z.string().default('base'),
  enableVision: z.boolean().default(true),
  enableSceneDetect: z.boolean().default(true),
});

export const PremiereConfigSchema = z.object({
  version: z.string().default('2024'),
  panelId: z.string().default('com.directorai.panel'),
});

export const AppConfigSchema = z.object({
  env: z.enum(['development', 'production', 'test']).default('development'),
  logLevel: LogLevelSchema.default('info'),
  server: ServerConfigSchema.default({}),
  llm: LLMConfigSchema.default({}),
  context: ContextEngineConfigSchema.default({}),
  premiere: PremiereConfigSchema.default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type ContextEngineConfig = z.infer<typeof ContextEngineConfigSchema>;
export type PremiereConfig = z.infer<typeof PremiereConfigSchema>;
