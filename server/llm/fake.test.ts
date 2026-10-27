import { describe, expect, it } from 'vitest'
import { createFakeLlm } from './fake.ts'
import type { ChatMessage } from './types.ts'

const event = { id: 'ceramics', title: 'Мастер-класс "Керамика"', startsAt: '2026-11-13T19:00', place: 'Москва' }
const reply = (text: string) => {
  const messages: ChatMessage[] = [
    { role: 'user', content: text },
    { role: 'assistant', content: null, toolCalls: [
      { id: 'events', name: 'list_events', arguments: '{}' },
      { id: 'recipients', name: 'list_recipients', arguments: '{}' },
    ] },
    { role: 'tool', toolCallId: 'events', content: JSON.stringify([event]) },
    { role: 'tool', toolCallId: 'recipients', content: '{"count":6}' },
  ]
  return createFakeLlm().chat(messages, [])
}

describe('имитация LLM', () => {
  it('готовит перенос, даже если попросили обновить афишу', async () => {
    const result = await reply('Перенеси мастер-класс по керамике на 05 декабря, в 9:00 и обнови афишу')
    expect(result.toolCalls[0].name).toBe('create_draft_campaign')
    expect(JSON.parse(result.toolCalls[0].arguments).body).toBe(
      'Здравствуйте!\n\nМастер-класс "Керамика" переносится на 5 декабря, 9:00. Место прежнее: Москва. '
      + 'Ваши билеты остаются в силе.\n\nКоманда Sqoch',
    )
  })

  it('подписывает письмо без даты', async () => {
    const result = await reply('Напиши покупателям Керамики')
    expect(JSON.parse(result.toolCalls[0].arguments).body)
      .toBe('Здравствуйте!\n\nПишем вам по поводу мероприятия Мастер-класс "Керамика".\n\nКоманда Sqoch')
  })

  it('готовит письмо с числовой датой и временем перед датой', async () => {
    const result = await reply('Перенеси Керамику на в 19:00 20.11.2026')
    expect(JSON.parse(result.toolCalls[0].arguments).body).toContain('20 ноября, 19:00')
  })

  it('берёт последнюю дату для письма', async () => {
    const result = await reply('Керамику на 20 ноября, 19:00 переносим на 27 ноября, 19:00')
    const letter = JSON.parse(result.toolCalls[0].arguments)
    expect(letter.subject).toContain('27 ноября, 19:00')
    expect(letter.body).not.toContain('20 ноября')
  })

  it.each(['31 апреля, 19:00', '45 ноября, 19:00', '20 ноябрю, 19:00', '20 ноября, 24:00'])(
    'просит уточнить невалидную дату: %s', async (date) => {
      expect((await reply(`Перенеси Керамику на ${date} и обнови афишу`)).content).toContain('Не понял дату')
    },
  )

  it('показывает список мероприятий по просьбе об афише', async () => {
    const result = await reply('Что в афише?')
    expect(result.toolCalls).toEqual([])
    expect(result.content).toContain('Керамика')
  })
})
