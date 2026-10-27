import type { DatabaseSync } from 'node:sqlite'

export type Mail = { campaignId: number; email: string; subject: string; body: string; idempotencyKey: string }

// Доставка at-least-once: если процесс упадёт между send и отметкой sent, письмо уйдёт повторно.
// Поэтому send обязан быть идемпотентным по idempotencyKey: повтор с тем же ключом не шлёт второе письмо.
export type Mailer = { send: (mail: Mail, recipients?: number) => Promise<void> }

export const mailKey = (campaignId: number, email: string) => `${campaignId}:${email}`

export const MAILER_DOWN_ERROR = 'Служба отправки недоступна'

export class MailerDownError extends Error {
  name = 'MailerDownError'
  constructor() {
    super(MAILER_DOWN_ERROR)
  }
}

type OutboxRow = { id: number; campaign_id: number; email: string; subject: string; sent_at: string }

export const isMailerDown = (db: DatabaseSync) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'mailer_down'").get() as { value: string } | undefined
  return row?.value === '1'
}

export const setMailerDown = (db: DatabaseSync, down: boolean): void => {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('mailer_down', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(down ? '1' : '0')
}

export const pauseMs = (maxDelayMs: number, recipients: number) => Math.min(maxDelayMs, 8000 / recipients)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const createDbMailer = (db: DatabaseSync, { delayMs = 0 } = {}): Mailer => ({
  send: async (mail, recipients) => {
    if (delayMs) await sleep(pauseMs(delayMs, recipients ?? 1))
    if (isMailerDown(db)) throw new MailerDownError()
    db.prepare(`
      INSERT INTO outbox (campaign_id, email, subject, body, sent_at, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(idempotency_key) DO NOTHING
    `).run(mail.campaignId, mail.email, mail.subject, mail.body, new Date().toISOString(), mail.idempotencyKey)
  },
})

export const listOutbox = (db: DatabaseSync) =>
  (db.prepare('SELECT id, campaign_id, email, subject, sent_at FROM outbox ORDER BY id DESC').all() as OutboxRow[])
    .map((row) => ({ id: row.id, campaignId: row.campaign_id, email: row.email, subject: row.subject, sentAt: row.sent_at }))
