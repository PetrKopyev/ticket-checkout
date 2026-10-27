import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmCampaign, createDraft, getCampaign, sendPending, updateDraft } from './campaigns.ts'
import { openDb } from './db.ts'
import { createDbMailer, listOutbox } from './mailer.ts'
import { selectRecipients } from './recipients.ts'
import { createBigDemo, resetDemo, seed } from './seed.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
  seed(db)
})

afterEach(() => {
  db.close()
})

describe('большое демо', () => {
  it('создаёт 1000 покупок и 860 получателей с дублями и отменами', () => {
    const demo = createBigDemo(db)
    expect(db.prepare("SELECT * FROM events WHERE id = 'festival'").get()).toEqual({
      id: 'festival', title: 'Фестиваль "Большой город"', starts_at: '2026-12-05T18:00', place: 'Москва',
    })
    const purchases = db.prepare("SELECT email, status, qty FROM purchases WHERE event_id = 'festival'").all() as {
      email: string; status: string; qty: number
    }[]
    expect(purchases).toHaveLength(1000)
    expect(purchases.every((purchase) => purchase.qty === 1)).toBe(true)
    expect(purchases.filter((purchase) => purchase.status === 'active')).toHaveLength(920)
    expect(purchases.filter((purchase) => purchase.status === 'active' && purchase.email !== purchase.email.trim().toLowerCase()))
      .toHaveLength(60)
    const emails = selectRecipients(db, 'festival')
    expect(emails).toEqual(Array.from({ length: 860 }, (_, index) => `user${String(index + 1).padStart(4, '0')}@example.com`))
    const cancelled = purchases.filter((purchase) => purchase.status === 'cancelled')
    expect(cancelled.filter((purchase) => emails.includes(purchase.email))).toHaveLength(40)
    expect(cancelled.filter((purchase) => !emails.includes(purchase.email)).map((purchase) => purchase.email))
      .toEqual(Array.from({ length: 40 }, (_, index) => `cancelled${String(index + 1).padStart(4, '0')}@example.com`))
    expect(demo.recipients).toBe(860)
    expect(getCampaign(db, demo.campaignId)).toMatchObject({
      status: 'draft', total: 860, pending: 860, subject: 'Фестиваль "Большой город" переносится на 12 декабря, 18:00',
    })
  })

  it('повторный вызов возвращает черновик, не дублирует покупки и не теряет исключения', () => {
    const demo = createBigDemo(db)
    updateDraft(db, demo.campaignId, { excluded: ['user0001@example.com'] })
    expect(createBigDemo(db)).toEqual(demo)
    expect(db.prepare("SELECT COUNT(*) AS n FROM purchases WHERE event_id = 'festival'").get()).toEqual({ n: 1000 })
    expect(db.prepare("SELECT COUNT(*) AS n FROM campaigns WHERE event_id = 'festival'").get()).toEqual({ n: 1 })
    expect(getCampaign(db, demo.campaignId)?.excludedEmails).toEqual(['user0001@example.com'])
  })

  it('после подтверждения создаёт следующий черновик без новых покупок', () => {
    const demo = createBigDemo(db)
    const campaign = getCampaign(db, demo.campaignId)!
    confirmCampaign(db, campaign.id, { subject: campaign.subject, body: campaign.body, excluded: [] })
    const next = createBigDemo(db)
    expect(next.campaignId).not.toBe(demo.campaignId)
    expect(next.recipients).toBe(860)
    expect(db.prepare("SELECT COUNT(*) AS n FROM purchases WHERE event_id = 'festival'").get()).toEqual({ n: 1000 })
  })

  it('reset удаляет festival с зависимыми данными, big работает снова', async () => {
    const demo = createBigDemo(db)
    const campaign = getCampaign(db, demo.campaignId)!
    confirmCampaign(db, campaign.id, { subject: campaign.subject, body: campaign.body, excluded: [] })
    await sendPending(db, createDbMailer(db), campaign.id)
    resetDemo(db)
    expect(db.prepare("SELECT * FROM events WHERE id = 'festival'").get()).toBeUndefined()
    expect(db.prepare("SELECT COUNT(*) AS n FROM purchases WHERE event_id = 'festival'").get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM campaigns').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM deliveries').get()).toEqual({ n: 0 })
    expect(listOutbox(db)).toEqual([])
    expect(db.prepare('SELECT COUNT(*) AS n FROM events').get()).toEqual({ n: 2 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM purchases').get()).toEqual({ n: 20 })
    expect(createBigDemo(db).recipients).toBe(860)
  })

  it('отправляет 1000 писем одним прогоном с delay 0 без дублей', async () => {
    createBigDemo(db)
    const insert = db.prepare("INSERT INTO purchases (event_id, buyer_name, email, status, qty) VALUES ('festival', 'Покупатель', ?, 'active', 1)")
    for (let index = 861; index <= 1000; index++) insert.run(`user${String(index).padStart(4, '0')}@example.com`)
    const campaign = createDraft(db, { eventId: 'festival', subject: 'Перенос', body: 'Текст' })
    expect(campaign.total).toBe(1000)
    confirmCampaign(db, campaign.id, { subject: campaign.subject, body: campaign.body, excluded: [] })
    const mailer = createDbMailer(db, { delayMs: 0 })
    const send = vi.fn(mailer.send)
    expect(await sendPending(db, { send }, campaign.id)).toMatchObject({ status: 'completed', sent: 1000 })
    expect(send).toHaveBeenCalledTimes(1000)
    expect(send.mock.calls.every(([, recipients]) => recipients === 1000)).toBe(true)
    await sendPending(db, { send }, campaign.id)
    expect(send).toHaveBeenCalledTimes(1000)
    expect(listOutbox(db)).toHaveLength(1000)
    expect(new Set(listOutbox(db).map((mail) => mail.email)).size).toBe(1000)
  })
})
