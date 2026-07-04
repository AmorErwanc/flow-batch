import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  LLM_API_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().min(1),

  CYAPI_BASE_URL: z.string().url().default('https://cyapi.ideaflow.pro'),
  STUDIO_NODEAPI_BASE_URL: z.string().url().default('https://studio.ideaflow.pro/nodeapi/ideaflow'),

  LOKI_HOST: z.string().url().optional(),
  LOKI_LABELS_APP: z.string().default('flow-batch'),
  LOKI_LABELS_ENV: z.string().default('local'),
})

export type Config = z.infer<typeof envSchema>

let cachedConfig: Config | null = null

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig
  cachedConfig = envSchema.parse(process.env)
  return cachedConfig
}

