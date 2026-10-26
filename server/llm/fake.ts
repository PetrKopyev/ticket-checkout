import type { ChatMessage, LlmClient, LlmReply } from './types.ts'

type EventInfo = { id: string; title: string; startsAt: string; place: string }

const DATE_RE = /на\s+(\d{1,2}\s+[а-яё]+),?\s+(\d{1,2}:\d{2})/i

const call = (name: string, args: object): LlmReply => ({
  content: null,
  toolCalls: [{ id: `call_${name}`, name, arguments: JSON.stringify(args) }],
})

const say = (content: string): LlmReply => ({ content, toolCalls: [] })

const titleWords = (title: string) =>
  title.toLowerCase().replace(/["«»]/g, ' ').split(/\s+/).filter((word) => word.length > 4)

const mentions = (text: string, event: EventInfo) => {
  const lower = text.toLowerCase()
  return lower.includes(event.title.toLowerCase())
    || titleWords(event.title).some((word) => lower.includes(word.slice(0, -1)))
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
    const event = events.find((item) => mentions(text, item))
    if (!event) {
      return say(`Не понял, о каком мероприятии речь. Уточните, пожалуйста: ${events.map((item) => item.title).join(', ')}.`)
    }
    const recipients = result('list_recipients') as { count: number } | undefined
    if (!recipients) return call('list_recipients', { event_id: event.id })
    const draft = result('create_draft_campaign') as { recipients_count: number } | undefined
    if (!draft) return call('create_draft_campaign', { event_id: event.id, ...letter(event, text) })
    return say(`Черновик готов: ${draft.recipients_count} получателей. Проверьте письмо и подтвердите отправку.`)
  },
})
