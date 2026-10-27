import { MONTHS, mentions, moveDateMatch, parseMoveDate } from './date.ts'
import type { ChatMessage, LlmClient, LlmReply } from './types.ts'

type EventInfo = { id: string; title: string; startsAt: string; place: string }

const call = (name: string, args: object): LlmReply => ({
  content: null,
  toolCalls: [{ id: `call_${name}`, name, arguments: JSON.stringify(args) }],
})

const say = (content: string): LlmReply => ({ content, toolCalls: [] })

const quotedTitles = (text: string) => [...text.matchAll(/["“”„«»'‘’]([^"“”„«»'‘’]+)["“”„«»'‘’]/g)]
  .map((match) => match[1])

const LIST_RE = /афиш|список\s+мероприят|какие[^.?!]*мероприят/i

const formatEvent = (event: EventInfo) => {
  const [, month, day, time] = event.startsAt.match(/-(\d{2})-(\d{2})T(\d{2}:\d{2})/) as RegExpMatchArray
  return `${event.title}, ${Number(day)} ${MONTHS[Number(month) - 1]} в ${time}, ${event.place}`
}

const letter = (event: EventInfo, date: NonNullable<ReturnType<typeof parseMoveDate>>) => {
  const when = `${date.day} ${date.month}, ${date.time}`
  return {
    subject: `${event.title} переносится на ${when}`,
    body: `Здравствуйте!\n\n${event.title} переносится на ${when}. Место прежнее: ${event.place}. `
      + 'Ваши билеты остаются в силе.\n\nКоманда Sqoch',
  }
}

export const createFakeLlm = (): LlmClient => ({
  chat: async (messages: ChatMessage[]) => {
    const userIndex = messages.findLastIndex((message) => message.role === 'user')
    const text = messages[userIndex].content as string
    const turn = messages.slice(userIndex + 1)
    const result = (name: string) => {
      const ids = turn.flatMap((message) => message.role === 'assistant' ? message.toolCalls ?? [] : [])
        .filter((toolCall) => toolCall.name === name)
        .map((toolCall) => toolCall.id)
      const message = turn.find((message) => message.role === 'tool' && ids.includes(message.toolCallId))
      return message && JSON.parse(message.content as string)
    }
    const events = result('list_events') as EventInfo[] | undefined
    if (!events) return call('list_events', {})
    const date = parseMoveDate(text)
    const match = moveDateMatch(text)
    const event = events.find((item) => mentions(text, item.title))
    if (LIST_RE.test(text) && !(event && match)) return say(`Мероприятия: ${events.map(formatEvent).join('; ')}.`)
    const unknown = quotedTitles(text).find((title) => !events.some((item) => mentions(title, item.title)))
    if (unknown) {
      return say(`Не нашёл такого мероприятия: «${unknown}». Доступны: ${events.map((item) => item.title).join(', ')}.`)
    }
    if (!event) {
      return say('Я готовлю уведомления покупателям о переносе мероприятия. Назовите мероприятие и новую дату, '
        + `например: Переносим мастер-класс “Керамика” на 20 ноября, 19:00. Доступны: ${events.map((item) => item.title).join(', ')}.`)
    }
    if (!match) return say('Укажите новую дату и время переноса, например: «на 20 ноября, 19:00»')
    if (!date) {
      return say(`Не понял дату переноса: «${match[0]}». Напишите, например: «на 20 ноября, 19:00»`)
    }
    const recipients = result('list_recipients') as { count: number } | undefined
    if (!recipients) return call('list_recipients', { event_id: event.id })
    const draft = result('create_draft_campaign') as { recipients_count: number; error?: string } | undefined
    if (!draft) return call('create_draft_campaign', { event_id: event.id, ...letter(event, date) })
    if (draft.error) return say(`Не получилось создать черновик: ${draft.error}`)
    return say(`Черновик готов: ${draft.recipients_count} получателей. Проверьте письмо и подтвердите отправку.`)
  },
})
