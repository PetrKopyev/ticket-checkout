import type { ChatMessage, LlmClient, LlmReply } from './types.ts'

type EventInfo = { id: string; title: string; startsAt: string; place: string }

const DATE_RE = /на\s+(\d+\s+[а-яё]+),?\s+(?:в\s+)?(\d+:\d+)/i
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const validDate = (date: RegExpMatchArray) => {
  const [day, month] = date[1].toLowerCase().split(/\s+/)
  const [hours, minutes] = date[2].split(':').map(Number)
  return Number(day) >= 1 && Number(day) <= DAYS[MONTHS.indexOf(month)]
    && /^\d{2}:\d{2}$/.test(date[2]) && hours <= 23 && minutes <= 59
}

const call = (name: string, args: object): LlmReply => ({
  content: null,
  toolCalls: [{ id: `call_${name}`, name, arguments: JSON.stringify(args) }],
})

const say = (content: string): LlmReply => ({ content, toolCalls: [] })

const quotedTitles = (text: string) => [...text.matchAll(/["“”„«»'‘’]([^"“”„«»'‘’]+)["“”„«»'‘’]/g)]
  .map((match) => match[1])

const mentions = (text: string, event: EventInfo) => {
  const lower = text.toLowerCase()
  return quotedTitles(event.title).some((title) => title.toLowerCase().split(/\s+/)
    .every((word) => lower.includes(word.length > 1 ? word.slice(0, -1) : word)))
}

const LIST_RE = /афиш|список\s+мероприят|какие[^.?!]*мероприят/i

const describe = (event: EventInfo) => {
  const [, month, day, time] = event.startsAt.match(/-(\d{2})-(\d{2})T(\d{2}:\d{2})/) as RegExpMatchArray
  return `${event.title}, ${Number(day)} ${MONTHS[Number(month) - 1]} в ${time}, ${event.place}`
}

const letter = (event: EventInfo, text: string) => {
  const date = text.match(DATE_RE)
  if (!date) {
    return {
      subject: `${event.title}: важная информация`,
      body: `Здравствуйте!\n\nПишем вам по поводу мероприятия ${event.title}.\n\nДо встречи!`,
    }
  }
  const when = `${date[1]}, ${date[2]}`
  return {
    subject: `${event.title} переносится на ${when}`,
    body: `Здравствуйте!\n\nМероприятие ${event.title} переносится на ${when}. Место прежнее: ${event.place}. `
      + 'Ваши билеты остаются в силе.\n\nДо встречи!',
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
    if (LIST_RE.test(text)) return say(`Мероприятия: ${events.map(describe).join('; ')}.`)
    const unknown = quotedTitles(text).find((title) => !events.some((item) => mentions(title, item)))
    if (unknown) {
      return say(`Не нашёл такого мероприятия: «${unknown}». Доступны: ${events.map((item) => item.title).join(', ')}.`)
    }
    const event = events.find((item) => mentions(text, item))
    if (!event) {
      return say('Я готовлю уведомления покупателям о переносе мероприятия. Назовите мероприятие и новую дату, '
        + `например: Переносим мастер-класс “Керамика” на 20 ноября, 19:00. Доступны: ${events.map((item) => item.title).join(', ')}.`)
    }
    const date = text.match(DATE_RE)
    if (date && !validDate(date)) {
      return say(`Не понял дату переноса: «${date[1]}, ${date[2]}». Напишите, например: «на 20 ноября, 19:00»`)
    }
    const recipients = result('list_recipients') as { count: number } | undefined
    if (!recipients) return call('list_recipients', { event_id: event.id })
    const draft = result('create_draft_campaign') as { recipients_count: number; error?: string } | undefined
    if (!draft) return call('create_draft_campaign', { event_id: event.id, ...letter(event, text) })
    if (draft.error) return say(`Не получилось создать черновик: ${draft.error}`)
    return say(`Черновик готов: ${draft.recipients_count} получателей. Проверьте письмо и подтвердите отправку.`)
  },
})
