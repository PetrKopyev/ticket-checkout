import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CampaignNotFoundError,
  CampaignStateError,
  InvalidLetterError,
  MAILER_DOWN_ERROR,
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
import { MailerDownError, createDbMailer, isMailerDown, listOutbox, mailKey, setMailerDown, type Mail, type Mailer } from './mailer.ts'
import { resetDemo, seed } from './seed.ts'

const DRAFT = { eventId: 'ceramics', subject: 'Перенос', body: 'Мастер-класс переносится' }
const CERAMICS_COUNT = 6

let db: DatabaseSync

const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

const deliveryRows = (id: number) =>
  db.prepare('SELECT email, status, sent_at FROM deliveries WHERE campaign_id = ? ORDER BY email').all(id) as {
    email: string
    status: string
    sent_at: string | null
  }[]

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

  it('сбой на вставке доставок откатывает и кампанию, прежний черновик цел', () => {
    const { id } = createDraft(db, DRAFT)
    db.exec("CREATE TRIGGER broken BEFORE INSERT ON deliveries BEGIN SELECT RAISE(ABORT, 'диск полон'); END")
    expect(() => createDraft(db, DRAFT)).toThrow('диск полон')
    expect([count('campaigns'), count('deliveries')]).toEqual([1, CERAMICS_COUNT])
    expect(getCampaign(db, id)?.total).toBe(CERAMICS_COUNT)
  })

  it('проверяет тему и текст письма', () => {
    expect(() => createDraft(db, { ...DRAFT, subject: '  ' })).toThrow(InvalidLetterError)
    expect(() => createDraft(db, { ...DRAFT, subject: 'а'.repeat(201) })).toThrow(InvalidLetterError)
    expect(() => createDraft(db, { ...DRAFT, body: 'а'.repeat(5001) })).toThrow(InvalidLetterError)
    const { id } = createDraft(db, { ...DRAFT, subject: 'а'.repeat(200), body: 'а'.repeat(5000) })
    expect(() => updateDraft(db, id, { body: '\n ' })).toThrow(InvalidLetterError)
    expect(count('campaigns')).toBe(1)
  })

  it('повторный список исключений заменяет прежний', () => {
    const { id } = createDraft(db, DRAFT)
    updateDraft(db, id, { excluded: ['anna@example.com'] })
    const campaign = updateDraft(db, id, { excluded: ['zoya@example.com'] })
    const excluded = campaign.recipients.filter((recipient) => recipient.excluded).map((recipient) => recipient.email)
    expect(excluded).toEqual(['zoya@example.com'])
  })

  it('ошибки темы и текста — по-русски, без имён полей', () => {
    expect(() => createDraft(db, { ...DRAFT, subject: ' ' })).toThrow('Тема не может быть пустой')
    expect(() => createDraft(db, { ...DRAFT, subject: 'а'.repeat(201) })).toThrow('Тема длиннее 200 символов')
    expect(() => createDraft(db, { ...DRAFT, body: '' })).toThrow('Текст не может быть пустым')
    expect(() => createDraft(db, { ...DRAFT, body: 'а'.repeat(5001) })).toThrow('Текст длиннее 5000 символов')
  })

  it('несуществующая рассылка — CampaignNotFoundError, а не null', () => {
    expect(() => updateDraft(db, 999, { subject: 'Тема' })).toThrow(CampaignNotFoundError)
    expect(() => confirmCampaign(db, 999)).toThrow(CampaignNotFoundError)
    expect(() => resumeCampaign(db, 999)).toThrow(CampaignNotFoundError)
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

  it('подтверждение пишет confirmed_at, у черновика его нет', () => {
    const { id: draftId } = createDraft(db, DRAFT)
    const id = confirmed()
    const confirmedAt = (campaignId: number) =>
      (db.prepare('SELECT confirmed_at FROM campaigns WHERE id = ?').get(campaignId) as { confirmed_at: string | null }).confirmed_at
    expect(confirmedAt(draftId)).toBeNull()
    expect(Date.parse(confirmedAt(id) as string)).not.toBeNaN()
  })

  it('с пустой темой или текстом подтвердить нельзя', () => {
    const { id } = createDraft(db, DRAFT)
    db.prepare("UPDATE campaigns SET body = ' ' WHERE id = ?").run(id)
    expect(() => confirmCampaign(db, id)).toThrow(CampaignStateError)
    expect(getCampaign(db, id)?.status).toBe('draft')
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
    expect(campaign?.status).toBe('draft')
    expect(listOutbox(db)).toHaveLength(0)
  })

  it('каждое письмо уходит с ключом идемпотентности campaignId:email', async () => {
    const id = confirmed()
    const mailer = createDbMailer(db)
    const keys: string[] = []
    await sendPending(db, { send: async (mail) => { keys.push(mail.idempotencyKey); await mailer.send(mail) } }, id)
    expect(keys).toEqual(getCampaign(db, id)?.recipients.map((recipient) => `${id}:${recipient.email}`))
  })

  it('несуществующая рассылка: sendPending возвращает null и ничего не шлёт', async () => {
    const counting = countingMailer()
    expect(await sendPending(db, counting, 999)).toBeNull()
    expect(counting.calls).toBe(0)
  })

  it('сброс демо посреди отправки останавливает цикл без писем-сирот', async () => {
    const id = confirmed()
    const mailer = createDbMailer(db)
    let calls = 0
    const resetting: Mailer = {
      send: async (mail) => {
        await mailer.send(mail)
        if (++calls === 2) resetDemo(db)
      },
    }
    expect(await sendPending(db, resetting, id)).toBeNull()
    expect(calls).toBe(2)
    expect(listOutbox(db)).toEqual([])
    expect(count('deliveries')).toBe(0)
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
  it('служба упала на середине: адрес failed, остаток ждёт, resume дошлёт без повторов', async () => {
    const id = confirmed()
    const partial = await sendPending(db, mailerDownAfter(2), id)
    expect(isMailerDown(db)).toBe(true)
    expect(partial).toMatchObject({ status: 'partial', sent: 2, failed: 1, pending: CERAMICS_COUNT - 3 })
    expect(partial?.recipients[2]).toMatchObject({ status: 'failed', error: MAILER_DOWN_ERROR, attempts: 1 })
    expect(deliveryRows(id).map((row) => row.sent_at !== null)).toEqual([true, true, false, false, false, false])
    const firstSent = partial?.recipients.filter((recipient) => recipient.status === 'sent').map((r) => r.email)

    setMailerDown(db, false)
    const done = await resumed(id)
    expect(done).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT })
    expect(outboxEmails()).toEqual(done?.recipients.map((recipient) => recipient.email))
    done?.recipients
      .filter((recipient) => firstSent?.includes(recipient.email))
      .forEach((recipient) => expect(recipient.attempts).toBe(1))
    expect(done?.recipients[2]).toMatchObject({ error: null, attempts: 2 })
  })

  it('служба упала на 2-м письме и ожила на 3-м: 3-е уходит только после resume', async () => {
    const id = confirmed()
    const mailer = createDbMailer(db)
    let calls = 0
    const flaky: Mailer = {
      send: async (mail) => {
        calls++
        if (calls === 2) throw new MailerDownError('нет связи')
        await mailer.send(mail)
      },
    }
    const partial = await sendPending(db, flaky, id)
    expect(calls).toBe(2)
    expect(partial).toMatchObject({ status: 'partial', sent: 1, failed: 1, pending: CERAMICS_COUNT - 2 })
    expect(listOutbox(db)).toHaveLength(1)

    expect(await resumed(id, flaky)).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT })
    expect(listOutbox(db)).toHaveLength(CERAMICS_COUNT)
  })

  it('пока служба лежит, resume оставляет кампанию partial', async () => {
    const id = confirmed()
    setMailerDown(db, true)
    const campaign = await sendPending(db, createDbMailer(db), id)
    expect(campaign).toMatchObject({ status: 'partial', sent: 0, failed: 1, pending: CERAMICS_COUNT - 1 })
    expect((await resumed(id))?.status).toBe('partial')
  })

  it('неожиданный сбой цикла переводит кампанию в partial, потом её можно повторить', async () => {
    const id = confirmed()
    db.exec("CREATE TRIGGER broken BEFORE UPDATE ON deliveries BEGIN SELECT RAISE(ABORT, 'диск полон'); END")
    await expect(sendPending(db, createDbMailer(db), id)).rejects.toThrow('диск полон')
    expect(getCampaign(db, id)?.status).toBe('partial')

    db.exec('DROP TRIGGER broken')
    expect(await resumed(id)).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT })
    expect(listOutbox(db)).toHaveLength(CERAMICS_COUNT)
  })

  it('если и пометка partial упала, наружу уходит исходная ошибка', async () => {
    const id = confirmed()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.exec("CREATE TRIGGER broken BEFORE UPDATE ON deliveries BEGIN SELECT RAISE(ABORT, 'диск полон'); END")
    db.exec("CREATE TRIGGER locked BEFORE UPDATE ON campaigns BEGIN SELECT RAISE(ABORT, 'база заблокирована'); END")
    await expect(sendPending(db, createDbMailer(db), id)).rejects.toThrow('диск полон')
    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ message: 'база заблокирована' }))
    logged.mockRestore()
  })

  it('ошибка на одном адресе не останавливает рассылку', async () => {
    const id = confirmed()
    const campaign = await sendPending(db, failingFor('darya@example.com'), id)
    expect(campaign).toMatchObject({ status: 'partial', sent: CERAMICS_COUNT - 1, failed: 1 })
    expect(deliveryRows(id).filter((row) => row.sent_at === null).map((row) => row.email)).toEqual(['darya@example.com'])
    expect(campaign?.recipients.find((recipient) => recipient.email === 'darya@example.com'))
      .toMatchObject({ status: 'failed', error: 'Ящик не существует', attempts: 1 })

    const done = await resumed(id)
    expect(done).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT, failed: 0 })
    expect(done?.recipients.find((recipient) => recipient.email === 'darya@example.com'))
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
    const mail = { campaignId: id, email: 'anna@example.com', subject: 'Тема', body: 'Текст', idempotencyKey: mailKey(id, 'anna@example.com') }
    await mailer.send(mail)
    await mailer.send(mail)
    expect(listOutbox(db)).toHaveLength(1)
  })

  it('повтор письма не меняет id и sent_at в outbox', async () => {
    const id = confirmed()
    const mailer = createDbMailer(db)
    const mail = { campaignId: id, email: 'anna@example.com', subject: 'Тема', body: 'Текст', idempotencyKey: mailKey(id, 'anna@example.com') }
    await mailer.send(mail)
    const first = listOutbox(db)
    await new Promise((resolve) => setTimeout(resolve, 5))
    await mailer.send({ ...mail, subject: 'Другая тема' })
    expect(listOutbox(db)).toEqual(first)
  })

  it('письмо с чужим ключом идемпотентности не записывается', async () => {
    const id = confirmed()
    const mail = { campaignId: id, email: 'anna@example.com', subject: 'Тема', body: 'Текст', idempotencyKey: mailKey(id, 'boris@example.com') }
    await expect(createDbMailer(db).send(mail)).rejects.toThrow('Неверный ключ идемпотентности')
    expect(listOutbox(db)).toEqual([])
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

  it('сбой resetDemo откатывается, данные не теряются', () => {
    confirmed()
    db.exec("CREATE TRIGGER broken BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'диск полон'); END")
    expect(() => resetDemo(db)).toThrow('диск полон')
    expect([count('campaigns'), count('deliveries'), count('events'), count('purchases')])
      .toEqual([1, CERAMICS_COUNT, 2, 20])
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
    await createDbMailer(first).send({
      campaignId: id, email: 'anna@example.com', subject: 'Тема', body: 'Текст', idempotencyKey: mailKey(id, 'anna@example.com'),
    })
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
    expect(getCampaign(second, id)).toMatchObject({ status: 'partial', sent: 0, failed: 1, pending: CERAMICS_COUNT - 1 })
    expect(listOutbox(second)).toHaveLength(0)

    setMailerDown(second, false)
    resumeCampaign(second, id)
    expect(await sendPending(second, createDbMailer(second), id)).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT })
    second.close()
  })
})
