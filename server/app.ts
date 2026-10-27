import { createApiHandler } from './api.ts'
import { recoverCampaigns } from './campaigns.ts'
import { openDb } from './db.ts'
import { createLlm } from './llm/select.ts'
import { createDbMailer } from './mailer.ts'
import { seed } from './seed.ts'

type ApiHandler = ReturnType<typeof createApiHandler>

const apps = ((globalThis as { apiHandlers?: Map<string, ApiHandler> }).apiHandlers ??= new Map())

export const getApp = (dbPath = process.env.DB_PATH ?? 'data/app.db') => {
  const existing = apps.get(dbPath)
  if (existing) return existing
  const llm = createLlm()
  const db = openDb(dbPath)
  seed(db)
  const mailer = createDbMailer(db, { delayMs: Number(process.env.MAIL_DELAY_MS ?? 400) })
  recoverCampaigns(db, mailer).catch(console.error)
  const handler = createApiHandler(db, llm, mailer)
  apps.set(dbPath, handler)
  return handler
}
