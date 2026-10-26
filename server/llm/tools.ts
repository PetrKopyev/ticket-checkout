import type { DatabaseSync } from 'node:sqlite'
import { createDraft } from '../campaigns.ts'
import { selectRecipients } from '../recipients.ts'
import type { ToolDef } from './types.ts'

type EventRow = { id: string; title: string; starts_at: string; place: string }

const eventIdParam = { event_id: { type: 'string', description: 'id мероприятия из list_events' } }

export const TOOLS: ToolDef[] = [
  {
    name: 'list_events',
    description: 'Список мероприятий организатора',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_event',
    description: 'Мероприятие по id',
    parameters: { type: 'object', properties: eventIdParam, required: ['event_id'] },
  },
  {
    name: 'list_recipients',
    description: 'Покупатели мероприятия с действующими билетами: число и уникальные email',
    parameters: { type: 'object', properties: eventIdParam, required: ['event_id'] },
  },
  {
    name: 'create_draft_campaign',
    description: 'Создать черновик рассылки покупателям мероприятия. Отправляет организатор после проверки',
    parameters: {
      type: 'object',
      properties: {
        ...eventIdParam,
        subject: { type: 'string', description: 'Тема письма' },
        body: { type: 'string', description: 'Текст письма' },
      },
      required: ['event_id', 'subject', 'body'],
    },
  },
]

const toEvent = (row: EventRow) => ({ id: row.id, title: row.title, startsAt: row.starts_at, place: row.place })

const findEvent = (db: DatabaseSync, id: unknown) =>
  db.prepare('SELECT id, title, starts_at, place FROM events WHERE id = ?').get(String(id)) as EventRow | undefined

const text = (value: unknown) => typeof value === 'string' && value.trim() !== ''

const parseArgs = (json: string): Record<string, unknown> | null => {
  try {
    const args = JSON.parse(json || '{}')
    return typeof args === 'object' && args !== null ? args : null
  } catch {
    return null
  }
}

export const runTool = (db: DatabaseSync, name: string, argsJson: string): object => {
  const args = parseArgs(argsJson)
  if (!args) return { error: 'Аргументы должны быть JSON-объектом' }
  if (name === 'list_events') {
    return (db.prepare('SELECT id, title, starts_at, place FROM events ORDER BY starts_at').all() as EventRow[])
      .map(toEvent)
  }
  if (!['get_event', 'list_recipients', 'create_draft_campaign'].includes(name)) {
    return { error: `Неизвестный инструмент ${name}` }
  }
  const event = text(args.event_id) && findEvent(db, args.event_id)
  if (!event) return { error: 'Мероприятие не найдено' }
  if (name === 'get_event') return toEvent(event)
  if (name === 'list_recipients') {
    const emails = selectRecipients(db, event.id).map((recipient) => recipient.email)
    return { count: emails.length, emails }
  }
  if (!text(args.subject) || !text(args.body)) return { error: 'Нужны непустые subject и body' }
  const campaign = createDraft(db, { eventId: event.id, subject: String(args.subject), body: String(args.body) })
  return { campaign_id: campaign.id, recipients_count: campaign.total }
}
