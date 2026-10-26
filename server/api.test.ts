import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiHandler } from './api.ts'
import { openDb } from './db.ts'
import { createFakeLlm } from './llm/fake.ts'
import type { LlmClient } from './llm/types.ts'
import { createDbMailer, type Mailer } from './mailer.ts'
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

const listen = async (llm: LlmClient = createFakeLlm(), mailer: Mailer = createDbMailer(db)) => {
  server?.close()
  const handler = createApiHandler(db, llm, mailer)
  server = createServer((req, res) => handler(req, res, () => res.writeHead(404).end()))
  await new Promise<void>((resolve) => server.listen(0, resolve))
  base = `http://localhost:${(server.address() as AddressInfo).port}`
}

const gate = () => {
  let open = () => {}
  const opened = new Promise<void>((resolve) => { open = resolve })
  return { opened, open: () => open() }
}

beforeEach(async () => {
  db = openDb(':memory:')
  seed(db)
  await listen()
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

  it('проверяет поля PATCH', async () => {
    const id = await createDraft()
    const patch = (body: object) => request(`/api/campaigns/${id}`, 'PATCH', body)
    expect((await patch({ subject: 1 })).status).toBe(400)
    expect((await patch({ body: null })).status).toBe(400)
    expect((await patch({ excluded: 'anna@example.com' })).status).toBe(400)
    expect((await patch({ excluded: [1] })).status).toBe(400)
    expect((await patch({ subject: 'а'.repeat(201) })).status).toBe(400)
    expect((await patch({ body: 'а'.repeat(5001) })).status).toBe(400)
    expect((await patch({ subject: 'а'.repeat(200), body: 'а'.repeat(5000) })).status).toBe(200)
  })

  it('ограничивает тип, размер тела и длину сообщения', async () => {
    const plain = await fetch(`${base}/api/demo/reset`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })
    expect(plain.status).toBe(415)
    expect((await fetch(`${base}/api/demo/reset`, { method: 'POST' })).status).toBe(415)
    expect((await request('/api/assistant/message', 'POST', { text: 'а'.repeat(100_000) })).status).toBe(413)
    expect((await request('/api/assistant/message', 'POST', { text: 'а'.repeat(2001) })).status).toBe(400)
    expect((await request('/api/campaigns')).data).toEqual([])
  })

  it('confirm и resume несуществующей рассылки — 404', async () => {
    expect((await request('/api/campaigns/999/confirm', 'POST')).status).toBe(404)
    expect((await request('/api/campaigns/999/resume', 'POST')).status).toBe(404)
  })

  it('resume не из partial ничего не меняет', async () => {
    const id = await createDraft()
    const { status, data } = await request(`/api/campaigns/${id}/resume`, 'POST')
    expect(status).toBe(200)
    expect(data.status).toBe('draft')
    expect(await outboxCount()).toBe(0)
  })

  it('рассылку без получателей не подтвердить', async () => {
    const id = await createDraft()
    const { data } = await request(`/api/campaigns/${id}`)
    const emails = data.recipients.map((recipient: { email: string }) => recipient.email)
    await request(`/api/campaigns/${id}`, 'PATCH', { excluded: emails })
    expect(await request(`/api/campaigns/${id}/confirm`, 'POST')).toEqual({ status: 409, data: { error: 'Нет получателей' } })
  })

  it('повторный confirm во время отправки не запускает вторую', async () => {
    const mailer = createDbMailer(db)
    const release = gate()
    let calls = 0
    await listen(createFakeLlm(), {
      send: async (mail) => {
        calls++
        await release.opened
        await mailer.send(mail)
      },
    })
    const id = await createDraft()
    await request(`/api/campaigns/${id}/confirm`, 'POST')
    expect((await request(`/api/campaigns/${id}/confirm`, 'POST')).data.status).toBe('sending')
    release.open()
    await waitFor(id, 'completed')
    expect(calls).toBe(6)
    expect(await outboxCount()).toBe(6)
  })

  it('падение LLM — 502', async () => {
    await listen({ chat: async () => { throw new Error('LLM ответил 500') } })
    expect((await request('/api/assistant/message', 'POST', { text: 'Привет' })).status).toBe(502)
  })

  it('пока помощник отвечает, второе сообщение — 409', async () => {
    const fake = createFakeLlm()
    const release = gate()
    await listen({ chat: async (messages, tools) => { await release.opened; return fake.chat(messages, tools) } })
    const first = request('/api/assistant/message', 'POST', { text: 'Привет' })
    await vi.waitFor(() => expect(db.prepare('SELECT COUNT(*) AS n FROM chat_messages').get()).toEqual({ n: 1 }))
    expect(await request('/api/assistant/message', 'POST', { text: 'Ещё' })).toEqual({ status: 409, data: { error: 'Помощник занят' } })
    release.open()
    expect((await first).status).toBe(200)
    expect((await request('/api/assistant/message', 'POST', { text: 'Снова' })).status).toBe(200)
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
