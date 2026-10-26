import type { DatabaseSync } from 'node:sqlite'

export type Mail = { campaignId: number; email: string; subject: string; body: string }

export type Mailer = { send: (mail: Mail) => Promise<void> }

export class MailerDownError extends Error {
  name = 'MailerDownError'
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

export const createDbMailer = (db: DatabaseSync): Mailer => ({
  send: async (mail) => {
    if (isMailerDown(db)) throw new MailerDownError('Почтовая служба недоступна')
    db.prepare(`
      INSERT INTO outbox (campaign_id, email, subject, body, sent_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id, email) DO NOTHING
    `).run(mail.campaignId, mail.email, mail.subject, mail.body, new Date().toISOString())
  },
})

export const listOutbox = (db: DatabaseSync) =>
  (db.prepare('SELECT id, campaign_id, email, subject, sent_at FROM outbox ORDER BY id DESC').all() as OutboxRow[])
    .map((row) => ({ id: row.id, campaignId: row.campaign_id, email: row.email, subject: row.subject, sentAt: row.sent_at }))
