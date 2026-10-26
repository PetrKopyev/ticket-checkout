import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'
import {
  CampaignStateError,
  confirmCampaign,
  getCampaign,
  listCampaigns,
  resumeCampaign,
  sendPending,
  updateDraft,
} from './campaigns.ts'
import { getHistory, sendAssistantMessage } from './llm/assistant.ts'
import type { LlmClient } from './llm/types.ts'
import { isMailerDown, listOutbox, setMailerDown, type Mailer } from './mailer.ts'
import { resetDemo } from './seed.ts'

type EventRow = { id: string; title: string; starts_at: string; place: string }

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const readBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  try {
    const body = JSON.parse(raw || '{}')
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) return body
  } catch {}
  throw new HttpError(400, 'Тело запроса должно быть JSON-объектом')
}

const send = (res: ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

const optionalString = (value: unknown, field: string) => {
  if (value !== undefined && typeof value !== 'string') throw new HttpError(400, `${field} должно быть строкой`)
  return value
}

const parsePatch = (body: Record<string, unknown>) => {
  const { excluded } = body
  if (excluded !== undefined && !(Array.isArray(excluded) && excluded.every((email) => typeof email === 'string'))) {
    throw new HttpError(400, 'excluded должно быть списком email')
  }
  return {
    subject: optionalString(body.subject, 'subject'),
    body: optionalString(body.body, 'body'),
    excluded: excluded as string[] | undefined,
  }
}

const runInBackground = (task: Promise<unknown>) => {
  task.catch(console.error)
}

export const createApiHandler = (db: DatabaseSync, llm: LlmClient, mailer: Mailer) => {
  const campaignOr404 = (id: number) => {
    const campaign = getCampaign(db, id)
    if (!campaign) throw new HttpError(404, 'Рассылка не найдена')
    return campaign
  }

  const route = async (req: IncomingMessage, path: string) => {
    const method = req.method
    if (method === 'GET' && path === '/api/events') {
      return (db.prepare('SELECT id, title, starts_at, place FROM events ORDER BY starts_at').all() as EventRow[])
        .map((row) => ({ id: row.id, title: row.title, startsAt: row.starts_at, place: row.place }))
    }
    if (method === 'GET' && path === '/api/assistant/history') return getHistory(db)
    if (method === 'POST' && path === '/api/assistant/message') {
      const { text } = await readBody(req)
      if (typeof text !== 'string' || !text.trim()) throw new HttpError(400, 'Нужен текст сообщения')
      try {
        return await sendAssistantMessage(db, llm, text.trim())
      } catch (error) {
        console.error(error)
        throw new HttpError(502, 'Ассистент сейчас недоступен')
      }
    }
    if (method === 'GET' && path === '/api/campaigns') return listCampaigns(db)
    if (method === 'GET' && path === '/api/outbox') return listOutbox(db)
    if (method === 'GET' && path === '/api/demo') return { mailerDown: isMailerDown(db) }
    if (method === 'POST' && path === '/api/demo/mailer') {
      const { down } = await readBody(req)
      if (typeof down !== 'boolean') throw new HttpError(400, 'down должно быть true или false')
      setMailerDown(db, down)
      return { mailerDown: down }
    }
    if (method === 'POST' && path === '/api/demo/reset') {
      resetDemo(db)
      return { ok: true }
    }
    const match = path.match(/^\/api\/campaigns\/(\d+)(\/confirm|\/resume)?$/)
    if (!match) throw new HttpError(404, 'Не найдено')
    const id = Number(match[1])
    const action = match[2]
    campaignOr404(id)
    if (method === 'GET' && !action) return getCampaign(db, id)
    if (method === 'PATCH' && !action) {
      const patch = parsePatch(await readBody(req))
      try {
        return updateDraft(db, id, patch)
      } catch (error) {
        if (error instanceof CampaignStateError) throw new HttpError(409, error.message)
        throw error
      }
    }
    if (method === 'POST' && action === '/confirm') {
      const { campaign, started } = confirmCampaign(db, id)
      if (started) runInBackground(sendPending(db, mailer, id))
      return campaign
    }
    if (method === 'POST' && action === '/resume') {
      runInBackground(resumeCampaign(db, mailer, id))
      return getCampaign(db, id)
    }
    throw new HttpError(404, 'Не найдено')
  }

  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (!path.startsWith('/api/')) return next()
    route(req, path)
      .then((data) => send(res, 200, data))
      .catch((error) => {
        if (error instanceof HttpError) return send(res, error.status, { error: error.message })
        console.error(error)
        send(res, 500, { error: 'Внутренняя ошибка сервера' })
      })
  }
}
