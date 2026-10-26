import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CampaignStateError,
  confirmCampaign,
  createDraft,
  getCampaign,
  listCampaigns,
  recoverCampaigns,
  resumeCampaign,
  sendPending,
  updateDraft,
} from './campaigns.ts'
import { openDb } from './db.ts'
import { createDbMailer, isMailerDown, listOutbox, setMailerDown, type Mail, type Mailer } from './mailer.ts'
import { resetDemo, seed } from './seed.ts'

const DRAFT = { eventId: 'ceramics', subject: 'Перенос', body: 'Мастер-класс переносится' }
const CERAMICS_COUNT = 6

let db: DatabaseSync

const outboxEmails = () => listOutbox(db).map((mail) => mail.email).sort()

const confirmed = () => {
  const { id } = createDraft(db, DRAFT)
  confirmCampaign(db, id)
  return id
}

const resumed = (id: number, mailer = createDbMailer(db)) => {
  resumeCampaign(db, id)
  return sendPending(db, mailer, id)
}

const countingMailer = () => {
  const mailer = createDbMailer(db)
  const counting = { calls: 0, send: async (mail: Mail) => { counting.calls++; await mailer.send(mail) } }
  return counting
}

const mailerDownAfter = (count: number): Mailer => {
  const mailer = createDbMailer(db)
  let sent = 0
  return {
    send: async (mail) => {
      if (sent === count) setMailerDown(db, true)
      await mailer.send(mail)
      sent++
    },
  }
}

const failingFor = (email: string): Mailer => {
  const mailer = createDbMailer(db)
  return {
    send: async (mail) => {
      if (mail.email === email) throw new Error('Ящик не существует')
      await mailer.send(mail)
    },
  }
}

beforeEach(() => {
  db = openDb(':memory:')
  seed(db)
})

describe('черновик', () => {
  it('createDraft строит доставки по получателям', () => {
    const campaign = createDraft(db, DRAFT)
    expect(campaign).toMatchObject({
      status: 'draft',
      eventTitle: 'Мастер-класс "Керамика"',
      startsAt: '2026-11-13T19:00',
      total: CERAMICS_COUNT,
      pending: CERAMICS_COUNT,
      sent: 0,
    })
    expect(campaign.recipients.every((recipient) => recipient.status === 'pending' && !recipient.excluded)).toBe(true)
  })

  it('исключённые не считаются и не отправляются', async () => {
    const { id } = createDraft(db, DRAFT)
    const draft = updateDraft(db, id, { subject: 'Новая тема', excluded: [' Anna@Example.com', 'boris@example.com'] })
    expect(draft).toMatchObject({ subject: 'Новая тема', body: DRAFT.body, total: CERAMICS_COUNT - 2 })

    confirmCampaign(db, id)
    const campaign = await sendPending(db, createDbMailer(db), id)
    expect(campaign).toMatchObject({ status: 'completed', total: CERAMICS_COUNT - 2, sent: CERAMICS_COUNT - 2 })
    expect(outboxEmails()).not.toContain('anna@example.com')
    expect(outboxEmails()).not.toContain('boris@example.com')
    expect(listOutbox(db)[0].subject).toBe('Новая тема')
  })

  it('ошибка при создании откатывается, следующий черновик создаётся', () => {
    expect(() => createDraft(db, { ...DRAFT, eventId: 'nope' })).toThrow(/FOREIGN KEY/)
    expect(createDraft(db, DRAFT).total).toBe(CERAMICS_COUNT)
    expect(listCampaigns(db)).toHaveLength(1)
  })

  it('повторный список исключений заменяет прежний', () => {
    const { id } = createDraft(db, DRAFT)
    updateDraft(db, id, { excluded: ['anna@example.com'] })
    const campaign = updateDraft(db, id, { excluded: ['zoya@example.com'] })
    const excluded = campaign.recipients.filter((recipient) => recipient.excluded).map((recipient) => recipient.email)
    expect(excluded).toEqual(['zoya@example.com'])
  })

  it('после подтверждения черновик не меняется', () => {
    const id = confirmed()
    expect(() => updateDraft(db, id, { subject: 'Другая' })).toThrow(CampaignStateError)
  })
})

describe('подтверждение и отправка', () => {
  it('отправляет всем и завершает кампанию', async () => {
    const { id } = createDraft(db, DRAFT)
    const { started } = confirmCampaign(db, id)
    expect(started).toBe(true)

    const campaign = await sendPending(db, createDbMailer(db), id)
    expect(campaign).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT, pending: 0, failed: 0 })
    expect(outboxEmails()).toHaveLength(CERAMICS_COUNT)
    expect(listCampaigns(db)[0]).toMatchObject({ id, status: 'completed', total: CERAMICS_COUNT, sent: CERAMICS_COUNT })
  })

  it('повторное подтверждение не создаёт новых писем', async () => {
    const id = confirmed()
    const mailer = createDbMailer(db)
    await sendPending(db, mailer, id)

    const again = confirmCampaign(db, id)
    expect(again.started).toBe(false)
    expect(again.campaign.status).toBe('completed')
    await sendPending(db, mailer, id)
    expect(listOutbox(db)).toHaveLength(CERAMICS_COUNT)
  })

  it('без получателей подтвердить нельзя', () => {
    const { id, recipients } = createDraft(db, DRAFT)
    updateDraft(db, id, { excluded: recipients.map((recipient) => recipient.email) })
    expect(() => confirmCampaign(db, id)).toThrow('Нет получателей')
    expect(getCampaign(db, id)?.status).toBe('draft')
  })

  it('отправка черновика без подтверждения ничего не шлёт', async () => {
    const { id } = createDraft(db, DRAFT)
    const campaign = await sendPending(db, createDbMailer(db), id)
    expect(campaign.status).toBe('draft')
    expect(listOutbox(db)).toHaveLength(0)
  })

  it('две одновременные отправки одной кампании не дублируют письма', async () => {
    const id = confirmed()
    const counting = countingMailer()
    await Promise.all([sendPending(db, counting, id), sendPending(db, counting, id)])
    expect(counting.calls).toBe(CERAMICS_COUNT)
    expect(getCampaign(db, id)?.status).toBe('completed')
  })
})

describe('сбои', () => {
  it('служба упала на середине: остаток ждёт, resume дошлёт без повторов', async () => {
    const id = confirmed()
    const partial = await sendPending(db, mailerDownAfter(2), id)
    expect(isMailerDown(db)).toBe(true)
    expect(partial).toMatchObject({ status: 'partial', sent: 2, pending: CERAMICS_COUNT - 2, failed: 0 })
    const firstSent = partial.recipients.filter((recipient) => recipient.status === 'sent').map((r) => r.email)

    setMailerDown(db, false)
    const done = await resumed(id)
    expect(done).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT })
    expect(outboxEmails()).toEqual(done.recipients.map((recipient) => recipient.email))
    done.recipients
      .filter((recipient) => firstSent.includes(recipient.email))
      .forEach((recipient) => expect(recipient.attempts).toBe(1))
  })

  it('пока служба лежит, resume оставляет кампанию partial', async () => {
    const id = confirmed()
    setMailerDown(db, true)
    const campaign = await sendPending(db, createDbMailer(db), id)
    expect(campaign).toMatchObject({ status: 'partial', sent: 0, pending: CERAMICS_COUNT })
    expect((await resumed(id)).status).toBe('partial')
  })

  it('ошибка на одном адресе не останавливает рассылку', async () => {
    const id = confirmed()
    const campaign = await sendPending(db, failingFor('darya@example.com'), id)
    expect(campaign).toMatchObject({ status: 'partial', sent: CERAMICS_COUNT - 1, failed: 1 })
    expect(campaign.recipients.find((recipient) => recipient.email === 'darya@example.com'))
      .toMatchObject({ status: 'failed', error: 'Ящик не существует', attempts: 1 })

    const done = await resumed(id)
    expect(done).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT, failed: 0 })
    expect(done.recipients.find((recipient) => recipient.email === 'darya@example.com'))
      .toMatchObject({ status: 'sent', error: null, attempts: 2 })
    expect(listOutbox(db)).toHaveLength(CERAMICS_COUNT)
  })

  it('resume завершённой кампании ничего не шлёт', async () => {
    const id = confirmed()
    await sendPending(db, createDbMailer(db), id)
    expect(resumeCampaign(db, id)).toMatchObject({ started: false, campaign: { status: 'completed' } })
    expect(listOutbox(db)).toHaveLength(CERAMICS_COUNT)
  })

  it('resume черновика и идущей рассылки ничего не меняет', () => {
    const { id: draftId } = createDraft(db, DRAFT)
    const sendingId = confirmed()
    expect(resumeCampaign(db, draftId)).toMatchObject({ started: false, campaign: { status: 'draft' } })
    expect(resumeCampaign(db, sendingId)).toMatchObject({ started: false, campaign: { status: 'sending' } })
    expect(listOutbox(db)).toHaveLength(0)
  })
})

describe('восстановление', () => {
  it('recoverCampaigns не трогает черновик, partial и завершённую', async () => {
    const { id: draftId } = createDraft(db, DRAFT)
    const partialId = confirmed()
    setMailerDown(db, true)
    await sendPending(db, createDbMailer(db), partialId)
    setMailerDown(db, false)
    const completedId = confirmed()
    await sendPending(db, createDbMailer(db), completedId)

    const mailer = countingMailer()
    await recoverCampaigns(db, mailer)
    expect(mailer.calls).toBe(0)
    expect([draftId, partialId, completedId].map((id) => getCampaign(db, id)?.status))
      .toEqual(['draft', 'partial', 'completed'])
  })
})

describe('outbox', () => {
  it('повторная отправка того же письма не создаёт дубль', async () => {
    const id = confirmed()
    const mailer = createDbMailer(db)
    const mail = { campaignId: id, email: 'anna@example.com', subject: 'Тема', body: 'Текст' }
    await mailer.send(mail)
    await mailer.send(mail)
    expect(listOutbox(db)).toHaveLength(1)
  })

  it('UNIQUE не даёт вставить дубль напрямую', () => {
    const insert = db.prepare(
      "INSERT INTO outbox (campaign_id, email, subject, body, sent_at) VALUES (1, 'anna@example.com', 'Тема', 'Текст', '')",
    )
    insert.run()
    expect(() => insert.run()).toThrow(/UNIQUE/)
  })

  it('resetDemo чистит рассылки и поднимает службу', async () => {
    const id = confirmed()
    await sendPending(db, createDbMailer(db), id)
    setMailerDown(db, true)
    resetDemo(db)
    expect(listCampaigns(db)).toEqual([])
    expect(listOutbox(db)).toEqual([])
    expect(isMailerDown(db)).toBe(false)
  })
})

describe('рестарт', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sqoch-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('после рестарта recoverCampaigns дошлёт начатую рассылку', async () => {
    const path = join(dir, 'app.db')
    const first = openDb(path)
    seed(first)
    const { id } = createDraft(first, DRAFT)
    confirmCampaign(first, id)
    await createDbMailer(first).send({ campaignId: id, email: 'anna@example.com', subject: 'Тема', body: 'Текст' })
    first.close()

    const second = openDb(path)
    await recoverCampaigns(second, createDbMailer(second))
    expect(getCampaign(second, id)).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT })
    expect(listOutbox(second)).toHaveLength(CERAMICS_COUNT)
    second.close()
  })

  it('служба лежит при рестарте: кампания partial без потерь, потом дошлётся', async () => {
    const path = join(dir, 'app.db')
    const first = openDb(path)
    seed(first)
    const { id } = createDraft(first, DRAFT)
    confirmCampaign(first, id)
    setMailerDown(first, true)
    first.close()

    const second = openDb(path)
    await recoverCampaigns(second, createDbMailer(second))
    expect(getCampaign(second, id)).toMatchObject({ status: 'partial', sent: 0, pending: CERAMICS_COUNT })
    expect(listOutbox(second)).toHaveLength(0)

    setMailerDown(second, false)
    resumeCampaign(second, id)
    expect(await sendPending(second, createDbMailer(second), id)).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT })
    second.close()
  })
})
