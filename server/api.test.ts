import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiHandler } from './api.ts'
import { openDb } from './db.ts'
import { createFakeLlm } from './llm/fake.ts'
import { createDbMailer } from './mailer.ts'
import { seed } from './seed.ts'

let db: DatabaseSync
let server: Server
let base: string

type Json = any

const request = async (path: string, method = 'GET', body?: object | string) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'object' ? JSON.stringify(body) : body,
  })
  return { status: response.status, data: (await response.json()) as Json }
}

const createDraft = async () => {
  const { data } = await request('/api/assistant/message', 'POST', {
    text: 'Перенеси мастер-класс по керамике на 20 ноября, 19:00',
  })
  return data.campaignId as number
}

const waitFor = (id: number, status: string) =>
  vi.waitFor(async (): Promise<Json> => {
    const { data } = await request(`/api/campaigns/${id}`)
    expect(data.status).toBe(status)
    return data
  })

const outboxCount = async () => (await request('/api/outbox')).data.length

beforeEach(async () => {
  db = openDb(':memory:')
  seed(db)
  const handler = createApiHandler(db, createFakeLlm(), createDbMailer(db))
  server = createServer((req, res) => handler(req, res, () => res.writeHead(404).end()))
  await new Promise<void>((resolve) => server.listen(0, resolve))
  base = `http://localhost:${(server.address() as AddressInfo).port}`
})

afterEach(() => {
  server.close()
  db.close()
})

describe('api', () => {
  it('отдаёт мероприятия', async () => {
    const { data } = await request('/api/events')
    expect(data.map((event: { id: string }) => event.id)).toEqual(['ceramics', 'fonts'])
    expect(data[0]).toEqual({ id: 'ceramics', title: 'Мастер-класс "Керамика"', startsAt: '2026-11-13T19:00', place: 'Москва' })
  })

  it('ассистент создаёт черновик, история без служебных сообщений', async () => {
    const id = await createDraft()
    const { data } = await request(`/api/campaigns/${id}`)
    expect(data.status).toBe('draft')
    expect(data.total).toBe(6)
    const history = await request('/api/assistant/history')
    expect(history.data.map((message: { role: string }) => message.role)).toEqual(['user', 'assistant'])
    const list = await request('/api/campaigns')
    expect(list.data).toEqual([{ id, eventTitle: 'Мастер-класс "Керамика"', subject: data.subject, status: 'draft', total: 6, sent: 0 }])
  })

  it('отправляет подтверждённую рассылку один раз и без исключённых', async () => {
    const id = await createDraft()
    const patched = await request(`/api/campaigns/${id}`, 'PATCH', { subject: 'Перенос', excluded: [' Anna@Example.com '] })
    expect(patched.data.total).toBe(5)
    expect(patched.data.subject).toBe('Перенос')

    const confirmed = await request(`/api/campaigns/${id}/confirm`, 'POST')
    expect(confirmed.data.status).toBe('sending')
    await waitFor(id, 'completed')
    await request(`/api/campaigns/${id}/confirm`, 'POST')

    const { data } = await request('/api/outbox')
    expect(data).toHaveLength(5)
    expect(data.map((mail: { email: string }) => mail.email)).not.toContain('anna@example.com')
    expect((await request(`/api/campaigns/${id}`, 'PATCH', { subject: 'Ещё' })).status).toBe(409)
  })

  it('дошлёт остаток после сбоя почты без повторов', async () => {
    const id = await createDraft()
    await request('/api/demo/mailer', 'POST', { down: true })
    expect((await request('/api/demo')).data).toEqual({ mailerDown: true })
    await request(`/api/campaigns/${id}/confirm`, 'POST')
    const partial = await waitFor(id, 'partial')
    expect(partial.pending).toBe(6)

    await request('/api/demo/mailer', 'POST', { down: false })
    await request(`/api/campaigns/${id}/resume`, 'POST')
    const done = await waitFor(id, 'completed')
    expect(done.sent).toBe(6)
    await request(`/api/campaigns/${id}/resume`, 'POST')
    expect(await outboxCount()).toBe(6)
  })

  it('отвечает ошибками', async () => {
    expect((await request('/api/campaigns/999')).status).toBe(404)
    expect((await request('/api/nope')).status).toBe(404)
    expect((await request('/api/assistant/message', 'POST', '{oops')).status).toBe(400)
    expect((await request('/api/assistant/message', 'POST', { text: ' ' })).status).toBe(400)
    expect((await request('/api/demo/mailer', 'POST', { down: 'yes' })).status).toBe(400)
  })

  it('сбрасывает демо', async () => {
    await createDraft()
    await request('/api/demo/mailer', 'POST', { down: true })
    expect((await request('/api/demo/reset', 'POST')).data).toEqual({ ok: true })
    expect((await request('/api/campaigns')).data).toEqual([])
    expect((await request('/api/assistant/history')).data).toEqual([])
    expect((await request('/api/demo')).data).toEqual({ mailerDown: false })
  })
})
