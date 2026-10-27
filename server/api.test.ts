import { createServer, type Server } from 'node:http'
import { connect, type AddressInfo } from 'node:net'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiHandler, isLocalHost } from './api.ts'
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

const shownLetter = async (id: number) => {
  const { data } = await request(`/api/campaigns/${id}`)
  return {
    subject: data.subject as string,
    body: data.body as string,
    excluded: data.excludedEmails as string[],
  }
}

const confirm = async (id: number) => request(`/api/campaigns/${id}/confirm`, 'POST', await shownLetter(id))

const waitFor = (id: number, status: string) =>
  vi.waitFor(async (): Promise<Json> => {
    const { data } = await request(`/api/campaigns/${id}`)
    expect(data.status).toBe(status)
    return data
  })

const rawStatus = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, init).then((response) => response.status)

const rawRequestLine = (line: string) => new Promise<string>((resolve, reject) => {
  const socket = connect((server.address() as AddressInfo).port, 'localhost', () => {
    socket.write(`${line}\r\nHost: localhost\r\nConnection: close\r\n\r\n`)
  })
  let answer = ''
  socket.on('data', (chunk) => { answer += chunk })
  socket.on('end', () => resolve(answer.split('\r\n')[0]))
  socket.on('error', reject)
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
  it('получатели: страницы по email, total и пустая страница за концом', async () => {
    const { data: demo } = await request('/api/demo/big', 'POST', {})
    const path = `/api/campaigns/${demo.campaignId}/recipients`
    const first = await request(path)
    expect(first.status).toBe(200)
    expect(first.data.items).toHaveLength(20)
    expect(first.data).toMatchObject({ total: 860, counts: { all: 860, pending: 860, sent: 0, failed: 0, excluded: 0 } })
    expect(first.data.items[0]).toEqual({ email: 'user0001@example.com', status: 'pending', error: null, excluded: false })
    const page = await request(`${path}?offset=1&limit=100`)
    expect(page.data.items).toHaveLength(100)
    expect(page.data.items.map((item: Json) => item.email))
      .toEqual(Array.from({ length: 100 }, (_, index) => `user${String(index + 2).padStart(4, '0')}@example.com`))
    expect((await request(`${path}?offset=0&limit=1`)).data.items).toEqual([first.data.items[0]])
    expect((await request(`${path}?offset=860`)).data).toMatchObject({ items: [], total: 860 })
    expect((await request(`${path}?offset=1000`)).data.items).toEqual([])
  })

  it.each([
    'limit=0', 'limit=101', 'limit=-1', 'limit=abc', 'limit=1.5', 'limit=', 'limit=1e2', 'limit=%201',
    'offset=-1', 'offset=abc', 'offset=1.5', 'offset=', 'offset=1e2', 'offset=%2B1',
    'offset=9007199254740992', 'tab=unknown', 'tab=', `q=${'a'.repeat(321)}`,
  ])('получатели: неверный query %s даёт 400', async (query) => {
    const id = await createDraft()
    expect((await request(`/api/campaigns/${id}/recipients?${query}`)).status).toBe(400)
  })

  it('получатели: неизвестная рассылка — 404', async () => {
    expect((await request('/api/campaigns/999/recipients')).status).toBe(404)
  })

  it('counts не включают исключённые sent и failed во вкладки статусов', async () => {
    const id = await createDraft()
    await request(`/api/campaigns/${id}`, 'PATCH', { excluded: ['anna@example.com', 'boris@example.com'] })
    db.prepare("UPDATE deliveries SET status = 'sent' WHERE campaign_id = ? AND email IN ('anna@example.com', 'darya@example.com')").run(id)
    db.prepare("UPDATE deliveries SET status = 'failed', error = 'Ошибка' WHERE campaign_id = ? AND email IN ('boris@example.com', 'egor@example.com')").run(id)
    for (const tab of ['sent', 'failed']) {
      const { data } = await request(`/api/campaigns/${id}/recipients?tab=${tab}`)
      expect(data).toMatchObject({ total: 1, counts: { all: 6, sent: 1, failed: 1, pending: 2, excluded: 2 } })
      expect(data.items[0].excluded).toBe(false)
    }
    const { data } = await request(`/api/campaigns/${id}/recipients?tab=excluded&q=ANNA`)
    expect(data.total).toBe(1)
    expect(data.items[0]).toMatchObject({ email: 'anna@example.com', status: 'sent', excluded: true })
    expect(data.counts.excluded).toBe(2)
  })

  it('пустая рассылка возвращает нулевые счётчики и пустую страницу', async () => {
    const id = await createDraft()
    db.prepare('DELETE FROM deliveries WHERE campaign_id = ?').run(id)
    expect((await request(`/api/campaigns/${id}/recipients`)).data)
      .toEqual({ items: [], total: 0, counts: { all: 0, sent: 0, failed: 0, pending: 0, excluded: 0 } })
    expect((await request(`/api/campaigns/${id}`)).data)
      .toMatchObject({ total: 0, sent: 0, failed: 0, pending: 0, excluded: 0, excludedEmails: [] })
  })

  it('поиск нормализует регистр и пробелы, экранирует %, _ и обратную косую черту', async () => {
    const id = await createDraft()
    const insert = db.prepare("INSERT INTO deliveries (campaign_id, email, status) VALUES (?, ?, 'pending')")
    for (const email of ['percent%@example.com', 'under_score@example.com', 'back\\slash@example.com']) insert.run(id, email)
    const path = `/api/campaigns/${id}/recipients`
    for (const [q, email] of [
      [' ANNA@EXAMPLE ', 'anna@example.com'], ['%', 'percent%@example.com'],
      ['_', 'under_score@example.com'], ['\\', 'back\\slash@example.com'],
    ]) {
      const { data } = await request(`${path}?q=${encodeURIComponent(q)}`)
      expect(data.total).toBe(1)
      expect(data.items.map((item: Json) => item.email)).toEqual([email])
      expect(data.counts.all).toBe(9)
    }
    for (const q of ['', '   ']) expect((await request(`${path}?q=${encodeURIComponent(q)}`)).data.total).toBe(9)
    expect((await request(`${path}?q=${'a'.repeat(320)}`)).status).toBe(200)
    expect((await request(`${path}?q=${encodeURIComponent("' OR 1=1 --")}`)).data.total).toBe(0)
  })

  it('вкладки и counts согласованы в draft, sending, partial и completed', async () => {
    const release = gate()
    const mailer = createDbMailer(db)
    await listen(createFakeLlm(), { send: async (mail) => { await release.opened; await mailer.send(mail) } })
    const id = await createDraft()
    await request(`/api/campaigns/${id}`, 'PATCH', { excluded: ['anna@example.com'] })
    const path = `/api/campaigns/${id}/recipients`
    const check = async (counts: object) => {
      for (const tab of ['all', 'pending', 'sent', 'failed', 'excluded']) {
        const { data } = await request(`${path}?tab=${tab}`)
        expect(data.counts).toEqual(counts)
        expect(data.total).toBe(data.counts[tab])
        expect(data.items).toHaveLength(data.total)
        if (tab === 'excluded') expect(data.items.every((item: Json) => item.excluded)).toBe(true)
        else if (tab !== 'all') expect(data.items.every((item: Json) => !item.excluded && item.status === tab)).toBe(true)
      }
      const { data } = await request(`${path}?q=does-not-exist`)
      expect(data).toMatchObject({ items: [], total: 0, counts })
    }
    try {
      await check({ all: 6, pending: 5, sent: 0, failed: 0, excluded: 1 })
      await confirm(id)
      expect((await request(`/api/campaigns/${id}`)).data.status).toBe('sending')
      await check({ all: 6, pending: 5, sent: 0, failed: 0, excluded: 1 })
      await request('/api/demo/mailer', 'POST', { down: true })
      release.open()
      await waitFor(id, 'partial')
      await check({ all: 6, pending: 4, sent: 0, failed: 1, excluded: 1 })
      await request('/api/demo/mailer', 'POST', { down: false })
      await request(`/api/campaigns/${id}/resume`, 'POST', {})
      await waitFor(id, 'completed')
      await check({ all: 6, pending: 0, sent: 5, failed: 0, excluded: 1 })
    } finally {
      release.open()
    }
  })

  it('PATCH принимает 1000 исключений, ограничивает их число, confirm не ограничивает', async () => {
    const id = await createDraft()
    const emails = Array.from({ length: 1000 }, (_, index) => `${'user'.repeat(12)}${index}@${'example'.repeat(6)}.com`)
    expect(Buffer.byteLength(JSON.stringify({ excluded: emails }))).toBeGreaterThan(64 * 1024)
    const insert = db.prepare("INSERT INTO deliveries (campaign_id, email, status) VALUES (?, ?, 'pending')")
    emails.forEach((email) => insert.run(id, email))
    const patched = await request(`/api/campaigns/${id}`, 'PATCH', { excluded: emails })
    expect(patched.status).toBe(200)
    expect(patched.data).toMatchObject({ total: 6, excluded: 1000 })
    expect(patched.data).not.toHaveProperty('recipients')
    expect((await request(`/api/campaigns/${id}`, 'PATCH', { excluded: Array(1007).fill('anna@example.com') })).data)
      .toEqual({ error: 'Исключённых адресов больше, чем получателей' })
    const shown = await shownLetter(id)
    const confirmed = await request(`/api/campaigns/${id}/confirm`, 'POST', { ...shown, excluded: [...emails, ...emails] })
    expect(confirmed.status).toBe(200)
    expect(confirmed.data).not.toHaveProperty('recipients')
    await waitFor(id, 'completed')
  })

  it('demo/big идемпотентен, reset удаляет festival, повторный big работает', async () => {
    const first = await request('/api/demo/big', 'POST', {})
    expect(first.status).toBe(200)
    expect(first.data.recipients).toBe(860)
    expect(await request('/api/demo/big', 'POST', {})).toEqual(first)
    expect(db.prepare("SELECT COUNT(*) AS n FROM purchases WHERE event_id = 'festival'").get()).toEqual({ n: 1000 })
    await request('/api/demo/reset', 'POST', {})
    expect(db.prepare("SELECT id FROM events WHERE id = 'festival'").get()).toBeUndefined()
    expect((await request('/api/demo/big', 'POST', {})).data.recipients).toBe(860)
  })

  it.each(['/api/demo/big', '/api/campaigns/1/include-all'])('%s читает JSON-тело и общие ограничения', async (path) => {
    for (const body of ['[]', 'null', '{broken']) expect((await request(path, 'POST', body)).status).toBe(400)
    expect(await rawStatus(path, { method: 'POST', body: '{}' })).toBe(415)
    expect(await rawStatus(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' }, body: '{}',
    })).toBe(403)
    expect((await request(path, 'POST', { text: 'a'.repeat(270_000) })).status).toBe(413)
  })

  it.each(['draft', 'sending', 'partial'])('include-all в %s возвращает 409', async (status) => {
    const id = await createDraft()
    db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run(status, id)
    expect((await request(`/api/campaigns/${id}/include-all`, 'POST', {})).status).toBe(409)
  })

  it('include-all без исключённых — 409, неизвестная рассылка — 404', async () => {
    const id = await createDraft()
    await confirm(id)
    await waitFor(id, 'completed')
    expect(await request(`/api/campaigns/${id}/include-all`, 'POST', {}))
      .toEqual({ status: 409, data: { error: 'Нет исключённых получателей' } })
    expect((await request('/api/campaigns/999/include-all', 'POST', {})).status).toBe(404)
  })

  it.each(['include-all', 'include'])('параллельные include-all и %s не повторяют писем', async (action) => {
    const mailer = createDbMailer(db)
    let release = gate()
    let calls = 0
    await listen(createFakeLlm(), {
      send: async (mail) => { calls++; await release.opened; await mailer.send(mail) },
    })
    const id = await createDraft()
    await request(`/api/campaigns/${id}`, 'PATCH', { excluded: ['anna@example.com', 'boris@example.com'] })
    await confirm(id)
    release.open()
    await waitFor(id, 'completed')
    release = gate()
    try {
      const answers = await Promise.all([
        request(`/api/campaigns/${id}/include-all`, 'POST', {}),
        request(`/api/campaigns/${id}/${action}`, 'POST', { email: 'anna@example.com' }),
      ])
      expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409])
      expect(answers.find((answer) => answer.status === 200)?.data).not.toHaveProperty('recipients')
      release.open()
      const campaign = await waitFor(id, 'completed')
      if (campaign.excluded) {
        await request(`/api/campaigns/${id}/include-all`, 'POST', {})
        await waitFor(id, 'completed')
      }
      expect(calls).toBe(6)
      const { data } = await request('/api/outbox')
      expect(data).toHaveLength(6)
      expect(new Set(data.map((mail: Json) => mail.email)).size).toBe(6)
    } finally {
      release.open()
    }
  })

  it.each([
    { subject: 'Другая тема' },
    { body: 'Другой текст' },
    { excluded: ['anna@example.com'] },
  ])('confirm при расхождении %j возвращает 409 и ничего не отправляет', async (patch) => {
    const id = await createDraft()
    const shown = await shownLetter(id)
    await request(`/api/campaigns/${id}`, 'PATCH', patch)
    expect(await request(`/api/campaigns/${id}/confirm`, 'POST', shown)).toEqual({
      status: 409, data: { error: 'Рассылка изменилась в другой вкладке. Обновите страницу' },
    })
    expect((await request(`/api/campaigns/${id}`)).data.status).toBe('draft')
    expect(await outboxCount()).toBe(0)
  })

  it('confirm проверяет обязательные поля и их типы', async () => {
    const id = await createDraft()
    const shown = await shownLetter(id)
    for (const body of [
      {}, { body: shown.body, excluded: [] }, { subject: shown.subject, excluded: [] },
      { subject: shown.subject, body: shown.body },
      { ...shown, subject: 1 }, { ...shown, body: null },
      { ...shown, excluded: 'anna@example.com' }, { ...shown, excluded: [1] }, [], [1],
    ]) {
      expect((await request(`/api/campaigns/${id}/confirm`, 'POST', body)).status).toBe(400)
    }
    expect(await outboxCount()).toBe(0)
  })

  it('повторный confirm с другими полями возвращает 200 и рассылку без повторной отправки', async () => {
    const id = await createDraft()
    expect((await confirm(id)).status).toBe(200)
    const campaign = await waitFor(id, 'completed')
    expect(await request(`/api/campaigns/${id}/confirm`, 'POST', { subject: 'Другая', body: '', excluded: [] }))
      .toEqual({ status: 200, data: campaign })
    expect(await outboxCount()).toBe(6)
  })

  it('PATCH только с body меняет текст и сохраняет тему', async () => {
    const id = await createDraft()
    const { subject } = await shownLetter(id)
    expect(await request(`/api/campaigns/${id}`, 'PATCH', { body: 'Новый текст\nВторая строка' }))
      .toMatchObject({ status: 200, data: { subject, body: 'Новый текст\nВторая строка' } })
  })

  it.each([{ body: [] }, { body: [1] }])('PATCH с массивом $body возвращает 400', async ({ body }) => {
    const id = await createDraft()
    expect((await request(`/api/campaigns/${id}`, 'PATCH', body)).status).toBe(400)
  })

  it('/apix передаётся next, /api возвращает JSON 404', async () => {
    const handler = createApiHandler(db, createFakeLlm(), createDbMailer(db))
    const next = vi.fn()
    handler({ url: '/apix' } as Parameters<typeof handler>[0], {} as Parameters<typeof handler>[1], next)
    expect(next).toHaveBeenCalledOnce()
    expect(await request('/api')).toEqual({ status: 404, data: { error: 'Не найдено' } })
  })

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

    const confirmed = await confirm(id)
    expect(confirmed.data.status).toBe('sending')
    await waitFor(id, 'completed')
    await confirm(id)

    const { data } = await request('/api/outbox')
    expect(data).toHaveLength(5)
    expect(data.map((mail: { email: string }) => mail.email)).not.toContain('anna@example.com')
    expect((await request(`/api/campaigns/${id}`, 'PATCH', { subject: 'Ещё' })).status).toBe(409)
  })

  it('дошлёт остаток после сбоя почты без повторов', async () => {
    const id = await createDraft()
    await request('/api/demo/mailer', 'POST', { down: true })
    expect((await request('/api/demo')).data).toEqual({ mailerDown: true })
    await confirm(id)
    const partial = await waitFor(id, 'partial')
    expect(partial).toMatchObject({ pending: 5, failed: 1 })
    expect((await request(`/api/campaigns/${id}/recipients`)).data.items[0]).toMatchObject({ status: 'failed', error: 'Служба отправки недоступна' })

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
    expect((await request('/api/demo/mailer', 'POST', '[]')).status).toBe(400)
    expect((await request('/api/demo/mailer', 'POST', 'null')).status).toBe(400)
  })

  it('чужие пути и методы — 404, GET на действия ничего не шлёт', async () => {
    const id = await createDraft()
    await request(`/api/campaigns/${id}`, 'PATCH', {})
    for (const path of [`/api/campaigns/${id}/foo`, `/api/campaigns/${id}abc`, `/x/api/campaigns/${id}`]) {
      expect(await rawStatus(path)).toBe(404)
    }
    expect((await request(`/api/campaigns/${id}/confirm`)).status).toBe(404)
    expect((await request(`/api/campaigns/${id}/resume`)).status).toBe(404)
    expect((await request(`/api/campaigns/${id}`, 'DELETE')).status).toBe(404)
    expect((await request(`/api/campaigns/${id}`, 'PUT', {})).status).toBe(404)
    expect((await request(`/api/campaigns/${id}`)).data.status).toBe('draft')
    expect(await outboxCount()).toBe(0)
  })

  it('отклоняет запись с чужого Origin, свой Origin пропускает', async () => {
    const post = (origin: string) => rawStatus('/api/demo/mailer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: '{"down":true}',
    })
    expect(await post('http://evil.example')).toBe(403)
    expect(await post('null')).toBe(403)
    expect((await request('/api/demo')).data).toEqual({ mailerDown: false })
    expect(await post(base)).toBe(200)
  })

  it('кривой адрес — 400, сервер живёт дальше', async () => {
    expect(await rawRequestLine('GET http://[/ HTTP/1.1')).toBe('HTTP/1.1 400 Bad Request')
    expect((await request('/api/events')).status).toBe(200)
  })

  it('ответы API с nosniff', async () => {
    const response = await fetch(`${base}/api/events`)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('Host только 127.0.0.1 и localhost с нашим портом', () => {
    expect(isLocalHost('127.0.0.1:3001', 3001)).toBe(true)
    expect(isLocalHost('localhost:3001', 3001)).toBe(true)
    expect(isLocalHost('evil.example:3001', 3001)).toBe(false)
    expect(isLocalHost('localhost:3002', 3001)).toBe(false)
    expect(isLocalHost('localhost', 3001)).toBe(false)
    expect(isLocalHost(undefined, 3001)).toBe(false)
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
    expect((await patch({ subject: ' ' })).status).toBe(400)
    expect((await patch({ body: '' })).status).toBe(400)
    expect((await patch({ subject: 'а'.repeat(200), body: 'а'.repeat(5000) })).status).toBe(200)
  })

  it.each(['\u007f', '\u0085', '\u2028', '\u202e', '\ufeff', '\t'])('PATCH с символом %j в теме возвращает 400', async (char) => {
    const id = await createDraft()
    const shown = await shownLetter(id)
    expect(await request(`/api/campaigns/${id}`, 'PATCH', { subject: `Тема${char}письма` }))
      .toEqual({ status: 400, data: { error: 'Тема должна быть одной строкой' } })
    expect(await shownLetter(id)).toEqual(shown)
  })

  it('PATCH принимает только JSON', async () => {
    const id = await createDraft()
    const patch = (type: string) =>
      rawStatus(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': type }, body: '{"subject":"Новая"}' })
    expect(await patch('text/plain')).toBe(415)
    expect(await patch('application/json; charset=utf-8')).toBe(200)
  })

  it('ограничивает тип, размер тела и длину сообщения', async () => {
    const plain = await fetch(`${base}/api/demo/reset`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })
    expect(plain.status).toBe(415)
    expect((await fetch(`${base}/api/demo/reset`, { method: 'POST' })).status).toBe(415)
    expect((await request('/api/assistant/message', 'POST', { text: 'a'.repeat(270_000) })).status).toBe(413)
    expect((await request('/api/assistant/message', 'POST', { text: 'а'.repeat(132_000) })).status).toBe(413)
    expect((await request('/api/assistant/message', 'POST', { text: 'а'.repeat(2001) })).status).toBe(400)
    expect((await request('/api/campaigns')).data).toEqual([])
    expect((await request('/api/assistant/message', 'POST', { text: 'а'.repeat(2000) })).status).toBe(200)
  })

  it('список рассылок: новые сверху, исключённые не считаются', async () => {
    const first = await createDraft()
    await request(`/api/campaigns/${first}`, 'PATCH', { excluded: ['anna@example.com'] })
    await confirm(first)
    await waitFor(first, 'completed')
    const second = await createDraft()
    const { data } = await request('/api/campaigns')
    expect(data.map((item: Json) => [item.id, item.total, item.sent])).toEqual([[second, 6, 0], [first, 5, 5]])
  })

  it('outbox: новые письма сверху', async () => {
    const id = await createDraft()
    await confirm(id)
    await waitFor(id, 'completed')
    const ids = (await request('/api/outbox')).data.map((mail: Json) => mail.id)
    expect(ids).toEqual([...ids].sort((a, b) => b - a))
    expect(ids).toHaveLength(6)
  })

  it('confirm и resume несуществующей рассылки — 404', async () => {
    expect((await request('/api/campaigns/999/confirm', 'POST', { subject: 'Тема', body: 'Текст', excluded: [] })).status).toBe(404)
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
    const { data } = await request(`/api/campaigns/${id}/recipients`)
    const emails = data.items.map((recipient: { email: string }) => recipient.email)
    await request(`/api/campaigns/${id}`, 'PATCH', { excluded: emails })
    expect(await confirm(id)).toEqual({ status: 409, data: { error: 'Нет получателей' } })
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
    await confirm(id)
    expect((await confirm(id)).data.status).toBe('sending')
    release.open()
    await waitFor(id, 'completed')
    expect(calls).toBe(6)
    expect(await outboxCount()).toBe(6)
  })

  it('параллельный resume шлёт остаток один раз', async () => {
    const mailer = createDbMailer(db)
    let calls = 0
    await listen(createFakeLlm(), { send: async (mail) => { calls++; await mailer.send(mail) } })
    const id = await createDraft()
    await request('/api/demo/mailer', 'POST', { down: true })
    await confirm(id)
    await waitFor(id, 'partial')
    await request('/api/demo/mailer', 'POST', { down: false })
    calls = 0
    await Promise.all([1, 2, 3].map(() => request(`/api/campaigns/${id}/resume`, 'POST')))
    expect((await waitFor(id, 'completed')).sent).toBe(6)
    expect(calls).toBe(6)
    expect(await outboxCount()).toBe(6)
  })

  it('include досылает исключённому одно письмо', async () => {
    const id = await createDraft()
    await request(`/api/campaigns/${id}`, 'PATCH', { excluded: ['anna@example.com'] })
    const include = (body: object) => request(`/api/campaigns/${id}/include`, 'POST', body)
    expect(await include({ email: 'anna@example.com' })).toEqual({ status: 409, data: { error: 'Дослать можно после отправки рассылки' } })
    await confirm(id)
    await waitFor(id, 'completed')

    const included = await include({ email: ' Anna@Example.com ' })
    expect(included.status).toBe(200)
    expect(included.data).toMatchObject({ status: 'sending', total: 6 })
    expect((await waitFor(id, 'completed')).sent).toBe(6)
    expect(await include({ email: 'anna@example.com' })).toEqual({ status: 409, data: { error: 'Получатель уже включён' } })
    expect(await outboxCount()).toBe(6)
  })

  it('include при упавшей почте возвращает 200, в partial досылка запрещена', async () => {
    const id = await createDraft()
    await request(`/api/campaigns/${id}`, 'PATCH', { excluded: ['anna@example.com', 'boris@example.com'] })
    await confirm(id)
    await waitFor(id, 'completed')
    await request('/api/demo/mailer', 'POST', { down: true })

    const included = await request(`/api/campaigns/${id}/include`, 'POST', { email: 'anna@example.com' })
    expect(included).toMatchObject({ status: 200, data: { status: 'sending' } })
    const partial = await waitFor(id, 'partial')
    expect(partial).toMatchObject({ sent: 4, failed: 1 })
    expect((await request(`/api/campaigns/${id}/recipients`)).data.items.find((recipient: Json) => recipient.email === 'anna@example.com'))
      .toMatchObject({ status: 'failed', excluded: false })
    for (const email of ['anna@example.com', 'boris@example.com']) {
      expect(await request(`/api/campaigns/${id}/include`, 'POST', { email }))
        .toEqual({ status: 409, data: { error: 'Сначала повторите отправку неотправленных писем' } })
    }
    expect((await request(`/api/campaigns/${id}`)).data).toEqual(partial)
    expect(await outboxCount()).toBe(4)

    await request('/api/demo/mailer', 'POST', { down: false })
    await request(`/api/campaigns/${id}/resume`, 'POST')
    expect((await waitFor(id, 'completed')).sent).toBe(5)
    await request(`/api/campaigns/${id}/include`, 'POST', { email: 'boris@example.com' })
    expect((await waitFor(id, 'completed')).sent).toBe(6)
    const { data: outbox } = await request('/api/outbox')
    expect(outbox).toHaveLength(6)
    expect(new Set(outbox.map((mail: Json) => mail.email)).size).toBe(6)
  })

  it('include проверяет тело и адрес', async () => {
    const id = await createDraft()
    const include = (body: object) => request(`/api/campaigns/${id}/include`, 'POST', body)
    expect((await include({})).status).toBe(400)
    expect((await include({ email: 1 })).status).toBe(400)
    expect((await include({ email: ['anna@example.com'] })).status).toBe(400)
    expect(await include({ email: 'gleb@example.com' }))
      .toMatchObject({ status: 409, data: { error: 'Дослать можно после отправки рассылки' } })
    await confirm(id)
    await waitFor(id, 'completed')
    expect(await include({ email: 'gleb@example.com' })).toEqual({ status: 404, data: { error: 'Такого получателя нет в рассылке' } })
    expect((await request('/api/campaigns/999/include', 'POST', { email: 'anna@example.com' })).status).toBe(404)
    expect((await request(`/api/campaigns/${id}/include`)).status).toBe(404)
    const plain = await rawStatus(`/api/campaigns/${id}/include`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{"email":"anna@example.com"}',
    })
    expect(plain).toBe(415)
  })

  it('два include подряд: второй ждёт конца отправки, писем без дублей', async () => {
    const mailer = createDbMailer(db)
    let release = gate()
    let calls = 0
    await listen(createFakeLlm(), {
      send: async (mail) => {
        calls++
        await release.opened
        await mailer.send(mail)
      },
    })
    const id = await createDraft()
    await request(`/api/campaigns/${id}`, 'PATCH', { excluded: ['anna@example.com', 'boris@example.com'] })
    await confirm(id)
    release.open()
    await waitFor(id, 'completed')

    release = gate()
    const answers = await Promise.all(
      ['anna@example.com', 'boris@example.com'].map((email) => request(`/api/campaigns/${id}/include`, 'POST', { email })),
    )
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409])
    expect(answers.find((answer) => answer.status === 409)?.data).toEqual({ error: 'Дождитесь завершения отправки' })
    release.open()
    const afterFirst = await waitFor(id, 'completed')
    const left = afterFirst.excludedEmails[0]

    expect((await request(`/api/campaigns/${id}/include`, 'POST', { email: left })).status).toBe(200)
    expect((await waitFor(id, 'completed')).sent).toBe(6)
    expect(calls).toBe(6)
    expect(await outboxCount()).toBe(6)
  })

  it('падение LLM — 502', async () => {
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    await listen({ chat: async () => { throw new Error('LLM ответил 500') } })
    expect(await request('/api/assistant/message', 'POST', { text: 'Привет' }))
      .toEqual({ status: 502, data: { error: 'Ассистент сейчас недоступен', campaignId: null } })
  })

  it('LLM упал после создания черновика — 502 с campaignId', async () => {
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    const fake = createFakeLlm()
    let step = 0
    await listen({
      chat: async (messages, tools) => {
        if (step++ === 3) throw new Error('LLM ответил 500')
        return fake.chat(messages, tools)
      },
    })
    const { status, data } = await request('/api/assistant/message', 'POST', { text: 'Перенеси мастер-класс по керамике на 20 ноября, 19:00' })
    const list = await request('/api/campaigns')
    expect(status).toBe(502)
    expect(list.data).toHaveLength(1)
    expect(data).toEqual({ error: 'Ассистент сейчас недоступен', campaignId: list.data[0].id })
  })

  it('отдаёт лимиты темы и текста', async () => {
    expect((await request('/api/limits')).data).toEqual({ subject: 200, body: 5000 })
  })

  it('ошибки письма по-русски, без имён полей', async () => {
    const id = await createDraft()
    const patch = (body: object) => request(`/api/campaigns/${id}`, 'PATCH', body)
    expect((await patch({ subject: '' })).data).toEqual({ error: 'Тема не может быть пустой' })
    expect((await patch({ body: 'а'.repeat(5001) })).data).toEqual({ error: 'Текст длиннее 5000 символов' })
    expect((await patch({ subject: 1 })).data).toEqual({ error: 'Тема должна быть строкой' })
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
