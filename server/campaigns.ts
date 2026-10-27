import type { DatabaseSync } from 'node:sqlite'
import { transaction } from './db.ts'
import { MailerDownError, mailKey, type Mailer } from './mailer.ts'
import { normalizeEmail, selectRecipients } from './recipients.ts'

export type CampaignStatus = 'draft' | 'sending' | 'completed' | 'partial'
type DeliveryStatus = 'pending' | 'sent' | 'failed'

export const RECIPIENT_TABS = ['all', 'sent', 'pending', 'failed', 'excluded'] as const
type RecipientTab = typeof RECIPIENT_TABS[number]
type RecipientCounts = Record<RecipientTab, number>

type CampaignView = {
  id: number
  eventId: string
  eventTitle: string
  startsAt: string
  subject: string
  body: string
  status: CampaignStatus
  total: number
  sent: number
  failed: number
  pending: number
  excluded: number
  excludedEmails: string[]
}

export class CampaignStateError extends Error {
  name = 'CampaignStateError'
}

export class InvalidLetterError extends Error {
  name = 'InvalidLetterError'
}

export class CampaignNotFoundError extends Error {
  name = 'CampaignNotFoundError'
}

export const MAX_SUBJECT = 200
export const MAX_LETTER_BODY = 5000

type CampaignRow = {
  id: number
  event_id: string
  title: string
  starts_at: string
  subject: string
  body: string
  status: CampaignStatus
}

type DeliveryRow = { email: string; status: DeliveryStatus; error: string | null; excluded: number }

const activeSends = new Set<number>()

const now = () => new Date().toISOString()

const checkLetter = ({ subject, body }: { subject?: string; body?: string }) => {
  if (subject !== undefined && /[\p{Cc}\p{Zl}\p{Zp}\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u.test(subject)) {
    throw new InvalidLetterError('Тема должна быть одной строкой')
  }
  if (subject !== undefined && !subject.trim()) throw new InvalidLetterError('Тема не может быть пустой')
  if (subject !== undefined && subject.length > MAX_SUBJECT) throw new InvalidLetterError(`Тема длиннее ${MAX_SUBJECT} символов`)
  if (body !== undefined && !body.trim()) throw new InvalidLetterError('Текст не может быть пустым')
  if (body !== undefined && body.length > MAX_LETTER_BODY) throw new InvalidLetterError(`Текст длиннее ${MAX_LETTER_BODY} символов`)
}

const countRecipients = (db: DatabaseSync, id: number) => db.prepare(`
  SELECT COUNT(*) AS "all",
    COUNT(*) FILTER (WHERE excluded = 0 AND status = 'sent') AS sent,
    COUNT(*) FILTER (WHERE excluded = 0 AND status = 'pending') AS pending,
    COUNT(*) FILTER (WHERE excluded = 0 AND status = 'failed') AS failed,
    COUNT(*) FILTER (WHERE excluded = 1) AS excluded
  FROM deliveries WHERE campaign_id = ?
`).get(id) as RecipientCounts

export const getCampaign = (db: DatabaseSync, id: number): CampaignView | null => {
  const campaign = db.prepare(`
    SELECT c.id, c.event_id, e.title, e.starts_at, c.subject, c.body, c.status
    FROM campaigns c JOIN events e ON e.id = c.event_id
    WHERE c.id = ?
  `).get(id) as CampaignRow | undefined
  if (!campaign) return null
  const counts = countRecipients(db, id)
  const excludedEmails = db.prepare('SELECT email FROM deliveries WHERE campaign_id = ? AND excluded = 1 ORDER BY email')
    .all(id) as { email: string }[]
  return {
    id: campaign.id,
    eventId: campaign.event_id,
    eventTitle: campaign.title,
    startsAt: campaign.starts_at,
    subject: campaign.subject,
    body: campaign.body,
    status: campaign.status,
    total: counts.all - counts.excluded,
    sent: counts.sent,
    failed: counts.failed,
    pending: counts.pending,
    excluded: counts.excluded,
    excludedEmails: excludedEmails.map((recipient) => recipient.email),
  }
}

export const mustGetCampaign = (db: DatabaseSync, id: number) => {
  const campaign = getCampaign(db, id)
  if (!campaign) throw new CampaignNotFoundError('Рассылка не найдена')
  return campaign
}

export const listRecipients = (
  db: DatabaseSync,
  id: number,
  { tab = 'all', q = '', offset = 0, limit = 20 }: { tab?: RecipientTab; q?: string; offset?: number; limit?: number } = {},
) => {
  if (!db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(id)) {
    throw new CampaignNotFoundError('Рассылка не найдена')
  }
  const counts = countRecipients(db, id)
  const filter = tab === 'all' ? '' : tab === 'excluded' ? ' AND excluded = 1' : ' AND excluded = 0 AND status = ?'
  const params: (string | number)[] = [id]
  if (tab !== 'all' && tab !== 'excluded') params.push(tab)
  const query = q.trim().toLowerCase()
  const search = query ? " AND email LIKE ? ESCAPE '\\'" : ''
  if (query) params.push(`%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`)
  const where = `WHERE campaign_id = ?${filter}${search}`
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM deliveries ${where}`).get(...params) as { total: number }
  const rows = db.prepare(`SELECT email, status, error, excluded FROM deliveries ${where} ORDER BY email LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as DeliveryRow[]
  return { items: rows.map((row) => ({ ...row, excluded: row.excluded === 1 })), total, counts }
}

export const listCampaigns = (db: DatabaseSync) =>
  db.prepare(`
    SELECT c.id, e.title AS eventTitle, c.subject, c.status,
      COUNT(d.email) FILTER (WHERE d.excluded = 0) AS total,
      COUNT(d.email) FILTER (WHERE d.excluded = 0 AND d.status = 'sent') AS sent
    FROM campaigns c
    JOIN events e ON e.id = c.event_id
    LEFT JOIN deliveries d ON d.campaign_id = c.id
    GROUP BY c.id
    ORDER BY c.id DESC
  `).all() as { id: number; eventTitle: string; subject: string; status: CampaignStatus; total: number; sent: number }[]

export const createDraft = (
  db: DatabaseSync,
  draft: { eventId: string; subject: string; body: string },
): CampaignView => {
  checkLetter(draft)
  const insertDelivery = db.prepare("INSERT INTO deliveries (campaign_id, email, status) VALUES (?, ?, 'pending')")
  const id = transaction(db, () => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO campaigns (event_id, subject, body, status, created_at) VALUES (?, ?, ?, 'draft', ?)")
      .run(draft.eventId, draft.subject, draft.body, now())
    selectRecipients(db, draft.eventId).forEach((email) => insertDelivery.run(lastInsertRowid, email))
    return Number(lastInsertRowid)
  })
  return mustGetCampaign(db, id)
}

export const updateDraft = (
  db: DatabaseSync,
  id: number,
  patch: { subject?: string; body?: string; excluded?: string[] },
): CampaignView => {
  checkLetter(patch)
  const campaign = mustGetCampaign(db, id)
  if (campaign.status !== 'draft') throw new CampaignStateError('Рассылка уже подтверждена')
  if (patch.excluded !== undefined && patch.excluded.length > campaign.total + campaign.excluded) {
    throw new InvalidLetterError('Исключённых адресов больше, чем получателей')
  }
  transaction(db, () => {
    if (patch.subject !== undefined) db.prepare('UPDATE campaigns SET subject = ? WHERE id = ?').run(patch.subject, id)
    if (patch.body !== undefined) db.prepare('UPDATE campaigns SET body = ? WHERE id = ?').run(patch.body, id)
    if (patch.excluded !== undefined) {
      const excluded = JSON.stringify(patch.excluded.map(normalizeEmail))
      db.prepare('UPDATE deliveries SET excluded = email IN (SELECT value FROM json_each(?)) WHERE campaign_id = ?')
        .run(excluded, id)
    }
  })
  return mustGetCampaign(db, id)
}

export const confirmCampaign = (db: DatabaseSync, id: number, shown: { subject: string; body: string; excluded: string[] }) => {
  const campaign = mustGetCampaign(db, id)
  const excluded = new Set(shown.excluded.map(normalizeEmail))
  const savedExcluded = campaign.excludedEmails
  if (shown.subject !== campaign.subject || shown.body !== campaign.body
    || excluded.size !== savedExcluded.length || savedExcluded.some((email) => !excluded.has(email))) {
    throw new CampaignStateError(campaign.status === 'draft'
      ? 'Рассылка изменилась в другой вкладке. Обновите страницу'
      : 'Рассылка уже отправлена с другим содержимым. Обновите страницу')
  }
  if (campaign.status === 'draft' && campaign.total === 0) throw new CampaignStateError('Нет получателей')
  if (campaign.status === 'draft' && !(campaign.subject.trim() && campaign.body.trim())) {
    throw new CampaignStateError('Пустая тема или текст письма')
  }
  const { changes } = db
    .prepare("UPDATE campaigns SET status = 'sending', confirmed_at = ? WHERE id = ? AND status = 'draft'")
    .run(now(), id)
  return { campaign: mustGetCampaign(db, id), started: changes > 0 }
}

// Шлёт pending и failed по одному. Ошибка адреса -> failed, идём дальше.
// Служба недоступна -> этот адрес failed, остальные ждут resume. Сбой самого цикла -> partial и throw.
// Кампания пропала или вышла из sending (сброс демо) -> цикл останавливается; нет кампании -> null.
export const sendPending = async (db: DatabaseSync, mailer: Mailer, campaignId: number): Promise<CampaignView | null> => {
  const campaign = getCampaign(db, campaignId)
  if (!campaign || campaign.status !== 'sending' || activeSends.has(campaignId)) return campaign
  activeSends.add(campaignId)
  const setStatus = (status: CampaignStatus) => db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run(status, campaignId)
  const isSending = () =>
    (db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaignId) as { status: CampaignStatus } | undefined)
      ?.status === 'sending'
  try {
    const emails = db.prepare(`
      SELECT email FROM deliveries
      WHERE campaign_id = ? AND excluded = 0 AND status IN ('pending', 'failed')
      ORDER BY email
    `).all(campaignId) as { email: string }[]
    const markSent = db.prepare(`
      UPDATE deliveries SET status = 'sent', sent_at = ?, attempts = attempts + 1, error = NULL
      WHERE campaign_id = ? AND email = ?
    `)
    const markFailed = db.prepare(`
      UPDATE deliveries SET status = 'failed', error = ?, attempts = attempts + 1
      WHERE campaign_id = ? AND email = ?
    `)
    for (const { email } of emails) {
      if (!isSending()) return getCampaign(db, campaignId)
      const mail = { campaignId, email, subject: campaign.subject, body: campaign.body, idempotencyKey: mailKey(campaignId, email) }
      const error = await mailer.send(mail, campaign.total).then(() => null, (error: Error) => error)
      if (!error) {
        markSent.run(now(), campaignId, email)
      } else {
        markFailed.run(error.message, campaignId, email)
        if (error instanceof MailerDownError) break
      }
    }
    const { left } = db
      .prepare("SELECT COUNT(*) AS left FROM deliveries WHERE campaign_id = ? AND excluded = 0 AND status != 'sent'")
      .get(campaignId) as { left: number }
    setStatus(left === 0 ? 'completed' : 'partial')
  } catch (error) {
    try {
      setStatus('partial')
    } catch (statusError) {
      console.error(statusError)
    }
    throw error
  } finally {
    activeSends.delete(campaignId)
  }
  return getCampaign(db, campaignId)
}

export const resumeCampaign = (db: DatabaseSync, id: number) => {
  const { changes } = db.prepare("UPDATE campaigns SET status = 'sending' WHERE id = ? AND status = 'partial'").run(id)
  return { campaign: mustGetCampaign(db, id), started: changes > 0 }
}

const checkIncludeStatus = (status: CampaignStatus) => {
  if (status === 'draft') throw new CampaignStateError('Дослать можно после отправки рассылки')
  if (status === 'sending') throw new CampaignStateError('Дождитесь завершения отправки')
  if (status === 'partial') throw new CampaignStateError('Сначала повторите отправку неотправленных писем')
}

export const includeRecipient = (db: DatabaseSync, id: number, email: string) => {
  const campaign = mustGetCampaign(db, id)
  checkIncludeStatus(campaign.status)
  const normalized = normalizeEmail(email)
  const recipient = db.prepare('SELECT excluded FROM deliveries WHERE campaign_id = ? AND email = ?')
    .get(id, normalized) as { excluded: number } | undefined
  if (!recipient) throw new CampaignNotFoundError('Такого получателя нет в рассылке')
  if (!recipient.excluded) throw new CampaignStateError('Получатель уже включён')
  transaction(db, () => {
    db.prepare("UPDATE campaigns SET status = 'sending' WHERE id = ?").run(id)
    db.prepare("UPDATE deliveries SET excluded = 0, status = 'pending', error = NULL WHERE campaign_id = ? AND email = ?")
      .run(id, normalized)
  })
  return mustGetCampaign(db, id)
}

export const includeAllRecipients = (db: DatabaseSync, id: number) => {
  const campaign = mustGetCampaign(db, id)
  checkIncludeStatus(campaign.status)
  if (!campaign.excluded) throw new CampaignStateError('Нет исключённых получателей')
  transaction(db, () => {
    db.prepare("UPDATE campaigns SET status = 'sending' WHERE id = ?").run(id)
    db.prepare("UPDATE deliveries SET excluded = 0, status = 'pending', error = NULL WHERE campaign_id = ? AND excluded = 1")
      .run(id)
  })
  return mustGetCampaign(db, id)
}

export const recoverCampaigns = async (db: DatabaseSync, mailer: Mailer): Promise<void> => {
  const campaigns = db.prepare("SELECT id FROM campaigns WHERE status = 'sending' ORDER BY id").all() as { id: number }[]
  for (const { id } of campaigns) await sendPending(db, mailer, id).catch(console.error)
}
