import type { Plugin } from 'vite'
import { createApiHandler } from './api.ts'
import { recoverCampaigns } from './campaigns.ts'
import { openDb } from './db.ts'
import { createFakeLlm } from './llm/fake.ts'
import { createOpenAiLlm } from './llm/openai.ts'
import { createDbMailer } from './mailer.ts'
import { seed } from './seed.ts'

type ApiHandler = ReturnType<typeof createApiHandler>

const handlers = ((globalThis as { apiHandlers?: Map<string, ApiHandler> }).apiHandlers ??= new Map())

const createLlm = () => process.env.LLM_API_KEY
  ? createOpenAiLlm({
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
    apiKey: process.env.LLM_API_KEY,
  })
  : createFakeLlm()

export const getApiHandler = (dbPath = process.env.DB_PATH ?? 'data/app.db') => {
  const existing = handlers.get(dbPath)
  if (existing) return existing
  const db = openDb(dbPath)
  seed(db)
  const mailer = createDbMailer(db)
  recoverCampaigns(db, mailer).catch(console.error)
  const handler = createApiHandler(db, createLlm(), mailer)
  handlers.set(dbPath, handler)
  return handler
}

export const apiPlugin = (): Plugin => ({
  name: 'organizer-api',
  apply: () => !process.env.VITEST,
  configureServer: (server) => {
    server.middlewares.use(getApiHandler())
  },
  configurePreviewServer: (server) => {
    server.middlewares.use(getApiHandler())
  },
})
