import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDraft } from '../campaigns.ts'
import { sendAssistantMessage } from './assistant.ts'
import { createFakeLlm } from './fake.ts'
import { runTool } from './tools.ts'
import type { ChatMessage, LlmClient } from './types.ts'

vi.mock('../campaigns.ts', () => ({
  createDraft: vi.fn(() => ({ id: 1, total: 6 })),
  InvalidLetterError: class extends Error {},
}))

vi.mock('../recipients.ts', () => ({ selectRecipients: vi.fn(() => []) }))

const event = { id: 'ceramics', title: 'Мастер-класс "Керамика"', starts_at: '2026-11-13T19:00', place: 'Москва' }
const statement = { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() }
const db = { prepare: () => statement } as unknown as DatabaseSync
const draft = (subject: string, body: string, request = '') =>
  runTool(db, 'create_draft_campaign', JSON.stringify({ event_id: event.id, subject, body }), request)

beforeEach(() => {
  vi.clearAllMocks()
  statement.get.mockReturnValue(event)
})

describe('проверка письма перед созданием черновика', () => {
  it('отклоняет письмо без названия', () => {
    expect(draft('Перенос', '20 ноября, 19:00', 'Перенеси на 20 ноября, 19:00')).toEqual({
      error: 'В письме должны быть название мероприятия и новая дата: добавьте название «Керамика»',
    })
    expect(createDraft).not.toHaveBeenCalled()
  })

  it.each(['Здравствуйте!', '20 ноября', '19:00', '25 ноября, 18:30'])(
    'отклоняет письмо без полной даты из запроса: %s', (body) => {
      expect(draft('Керамика', body, 'Перенеси на 20 ноября, 19:00')).toEqual({
        error: 'В письме должны быть название мероприятия и новая дата: добавьте дату «20 ноября, 19:00»',
      })
      expect(createDraft).not.toHaveBeenCalled()
    },
  )

  it('подсказывает название и дату, если отсутствуют оба', () => {
    expect(draft('Перенос', 'Здравствуйте!', 'Перенеси на 25 ноября в 18:30')).toEqual({
      error: 'В письме должны быть название мероприятия и новая дата: добавьте название «Керамика» и дату «25 ноября, 18:30»',
    })
    expect(createDraft).not.toHaveBeenCalled()
  })

  it.each([
    ['Перенеси на 20 ноября, 19:00', 'Перенос', 'керамика 20 НОЯБРЯ в 19:00'],
    ['Перенеси на 25 ноября в 18:30', 'КЕРАМИКА', '25 ноября, 18:30'],
  ])('создаёт черновик с названием и датой: %s', (request, subject, body) => {
    expect(draft(subject, body, request)).toEqual({ campaign_id: 1, recipients_count: 6 })
    expect(createDraft).toHaveBeenCalledWith(db, { eventId: event.id, subject, body })
  })

  it.each(['', 'Напиши покупателям', 'Перенеси на 20 ноября', 'Перенеси на 2 недели, в 19:00'])(
    'не проверяет дату, если её нет в запросе: %s', (request) => {
      expect(draft('Керамика', 'Здравствуйте!', request)).toEqual({ campaign_id: 1, recipients_count: 6 })
    },
  )

  it.each(['Лекция «История шрифта»', 'Лекция “История шрифта”', 'Лекция „История шрифта“'])(
    'берёт название из кавычек: %s', (title) => {
      statement.get.mockReturnValue({ ...event, title })
      expect(draft('История шрифта', 'Здравствуйте!')).toEqual({ campaign_id: 1, recipients_count: 6 })
    },
  )

  it('сверяет последнюю дату запроса со всеми датами письма', () => {
    const request = 'Лекцию на 20 ноября, 19:00 переносим на 27 ноября, 19:00'
    expect(draft('Керамика', '20 ноября, 19:00', request)).toHaveProperty('error')
    expect(draft('Керамика', 'С 20 ноября, 19:00 на 27 ноября в 19:00', request))
      .toEqual({ campaign_id: 1, recipients_count: 6 })
  })

  it.each([
    ['Перенеси на 05 декабря, 09:00', 'О керамике', '5 ДЕКАБРЯ, в 9:00'],
    ['Перенеси на 5 декабря, 9:00', 'О КЕРАМИКЕ', '05\u00a0декабря, 09:00'],
  ])('нормализует дату и склонение: %s', (request, subject, body) => {
    expect(draft(subject, body, request)).toEqual({ campaign_id: 1, recipients_count: 6 })
  })

  it('понимает склонение названия и серии пробелов', () => {
    statement.get.mockReturnValue({ ...event, title: 'Лекция «История шрифта»' })
    expect(draft('Об истории\u00a0  шрифта', 'Здравствуйте!'))
      .toEqual({ campaign_id: 1, recipients_count: 6 })
  })

  it('проверяет полное название, если кавычек нет', () => {
    statement.get.mockReturnValue({ ...event, title: 'История шрифта' })
    expect(draft('История', 'Здравствуйте!')).toHaveProperty('error')
    expect(createDraft).not.toHaveBeenCalled()
    expect(draft('История шрифта', 'Здравствуйте!')).toEqual({ campaign_id: 1, recipients_count: 6 })
  })
})

describe('запрос организатора', () => {
  it('передаёт последнее сообщение в проверку инструмента', async () => {
    const args = JSON.stringify({ event_id: event.id, subject: 'Керамика', body: '20 ноября, 19:00' })
    let step = 0
    const llm: LlmClient = {
      chat: async () => step++ === 0
        ? { content: null, toolCalls: [{ id: 'draft', name: 'create_draft_campaign', arguments: args }] }
        : { content: 'Уточните дату', toolCalls: [] },
    }
    expect(await sendAssistantMessage(db, llm, 'Перенеси на 25 ноября в 18:30')).toEqual({
      reply: 'Уточните дату', campaignId: null,
    })
    expect(statement.run).toHaveBeenCalledWith('tool', JSON.stringify({
      error: 'В письме должны быть название мероприятия и новая дата: добавьте дату «25 ноября, 18:30»',
    }), null, 'draft', expect.any(String))
    expect(createDraft).not.toHaveBeenCalled()
  })

  it.each(['20 ноября, 19:00', '25 ноября в 18:30'])('письмо имитации проходит проверку: %s', async (date) => {
    const request = `Перенеси мастер-класс "Керамика" на ${date}`
    const messages: ChatMessage[] = [
      { role: 'user', content: request },
      { role: 'assistant', content: null, toolCalls: [
        { id: 'events', name: 'list_events', arguments: '{}' },
        { id: 'recipients', name: 'list_recipients', arguments: '{}' },
      ] },
      { role: 'tool', toolCallId: 'events', content: JSON.stringify([event]) },
      { role: 'tool', toolCallId: 'recipients', content: '{"count":6}' },
    ]
    const reply = await createFakeLlm().chat(messages, [])
    const call = reply.toolCalls[0]
    expect(call.name).toBe('create_draft_campaign')
    expect(runTool(db, call.name, call.arguments, request)).toEqual({ campaign_id: 1, recipients_count: 6 })
  })
})
