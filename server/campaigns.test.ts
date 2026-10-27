import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CampaignNotFoundError,
  CampaignStateError,
  InvalidLetterError,
  confirmCampaign,
  createDraft,
  getCampaign,
  includeRecipient,
  listCampaigns,
  recoverCampaigns,
  resumeCampaign,
  sendPending,
  updateDraft,
} from './campaigns.ts'
import { openDb } from './db.ts'
import { runTool } from './llm/tools.ts'
import { MAILER_DOWN_ERROR, MailerDownError, createDbMailer, isMailerDown, listOutbox, mailKey, setMailerDown, type Mail, type Mailer } from './mailer.ts'
import { resetDemo, seed } from './seed.ts'

const DRAFT = { eventId: 'ceramics', subject: 'Перенос', body: 'Мастер-класс переносится' }
const CERAMICS_COUNT = 6

const shownLetter = (db: DatabaseSync, id: number) => {
  const campaign = getCampaign(db, id)!
  return {
    subject: campaign.subject,
    body: campaign.body,
    excluded: campaign.recipients.filter((recipient) => recipient.excluded).map((recipient) => recipient.email),
  }
}

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
  confirmCampaign(db, id, shownLetter(db, id))
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
  it('неизвестный send_campaign возвращает ошибку и не создаёт рассылку', () => {
    expect(runTool(db, 'send_campaign', JSON.stringify({ event_id: 'ceramics', subject: 'a', body: 'b' }), ''))
      .toEqual({ error: 'Неизвестный инструмент send_campaign' })
    expect(count('campaigns')).toBe(0)
  })

  it.each(Array.from({ length: 32 }, (_, code) => String.fromCharCode(code)))('управляющий символ %j запрещён в теме', (char) => {
    expect(() => createDraft(db, { ...DRAFT, subject: `Тема${char}письма` }))
      .toThrow(new InvalidLetterError('Тема должна быть одной строкой'))
    const { id } = createDraft(db, DRAFT)
    expect(() => updateDraft(db, id, { subject: `Тема${char}письма` }))
      .toThrow(new InvalidLetterError('Тема должна быть одной строкой'))
    expect(getCampaign(db, id)?.subject).toBe(DRAFT.subject)
  })

  it('PATCH только с body сохраняет тему и разрешает переводы строк в тексте', () => {
    const { id } = createDraft(db, DRAFT)
    expect(updateDraft(db, id, { body: 'Первая строка\nВторая строка' }))
      .toMatchObject({ subject: DRAFT.subject, body: 'Первая строка\nВторая строка' })
  })

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

    confirmCampaign(db, id, shownLetter(db, id))
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
    expect(() => confirmCampaign(db, 999, { ...DRAFT, excluded: [] })).toThrow(CampaignNotFoundError)
    expect(() => resumeCampaign(db, 999)).toThrow(CampaignNotFoundError)
  })

  it('после подтверждения черновик не меняется', () => {
    const id = confirmed()
    expect(() => updateDraft(db, id, { subject: 'Другая' })).toThrow(CampaignStateError)
  })
})

describe('подтверждение и отправка', () => {
  it.each([
    { subject: 'Другая тема' },
    { body: 'Другой текст' },
    { excluded: ['anna@example.com'] },
  ])('изменённое поле %j не подтверждается и ничего не отправляет', async (patch) => {
    const { id } = createDraft(db, DRAFT)
    const shown = shownLetter(db, id)
    updateDraft(db, id, patch)
    expect(() => confirmCampaign(db, id, shown))
      .toThrow(new CampaignStateError('Рассылка изменилась в другой вкладке. Обновите страницу'))
    await sendPending(db, createDbMailer(db), id)
    expect(getCampaign(db, id)?.status).toBe('draft')
    expect(listOutbox(db)).toHaveLength(0)
  })

  it('сравнивает исключения как множество нормализованных адресов', async () => {
    const { id } = createDraft(db, DRAFT)
    updateDraft(db, id, { excluded: ['anna@example.com', 'boris@example.com'] })
    const shown = { ...DRAFT, excluded: [' Boris@Example.com ', 'ANNA@example.com', 'anna@example.com'] }
    expect(confirmCampaign(db, id, shown).started).toBe(true)
    await sendPending(db, createDbMailer(db), id)
    expect(listOutbox(db)).toHaveLength(CERAMICS_COUNT - 2)
    expect(confirmCampaign(db, id, { subject: 'Другая', body: '', excluded: [] }).started).toBe(false)
    expect(listOutbox(db)).toHaveLength(CERAMICS_COUNT - 2)
  })

  it('отправляет всем и завершает кампанию', async () => {
    const { id } = createDraft(db, DRAFT)
    const { started } = confirmCampaign(db, id, shownLetter(db, id))
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

    const again = confirmCampaign(db, id, shownLetter(db, id))
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
    expect(() => confirmCampaign(db, id, shownLetter(db, id))).toThrow(CampaignStateError)
    expect(getCampaign(db, id)?.status).toBe('draft')
  })

  it('без получателей подтвердить нельзя', () => {
    const { id, recipients } = createDraft(db, DRAFT)
    updateDraft(db, id, { excluded: recipients.map((recipient) => recipient.email) })
    expect(() => confirmCampaign(db, id, shownLetter(db, id))).toThrow('Нет получателей')
    expect(getCampaign(db, id)?.status).toBe('draft')
  })

  it('отправка черновика без подтверждения ничего не шлёт', async () => {
    const { id } = createDraft(db, DRAFT)
    const campaign = await sendPending(db, createDbMailer(db), id)
    expect(campaign?.status).toBe('draft')
    expect(listOutbox(db)).toHaveLength(0)
  })

  it.each(['draft', 'completed'] as const)('sendPending в %s не вызывает мейлер и не меняет рассылку', async (status) => {
    const { id } = createDraft(db, DRAFT)
    if (status === 'completed') {
      confirmCampaign(db, id, shownLetter(db, id))
      await sendPending(db, createDbMailer(db), id)
    }
    const campaign = getCampaign(db, id)
    const outbox = listOutbox(db)
    const counting = countingMailer()
    expect(await sendPending(db, counting, id)).toEqual(campaign)
    expect(counting.calls).toBe(0)
    expect(getCampaign(db, id)).toEqual(campaign)
    expect(listOutbox(db)).toEqual(outbox)
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

  it('сброс демо после записи второго письма очищает данные и останавливает цикл', async () => {
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
        if (calls === 2) throw new MailerDownError()
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

  it('сбой первой sending-кампании не мешает восстановлению второй', async () => {
    const firstId = confirmed()
    const secondId = confirmed()
    const mailer = createDbMailer(db)
    const error = new Error('Сбой отправки')
    const broken: Mailer = {
      send: (mail) => {
        if (mail.campaignId === firstId) throw error
        return mailer.send(mail)
      },
    }
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await recoverCampaigns(db, broken)
      expect(logged).toHaveBeenCalledWith(error)
      expect(getCampaign(db, firstId)?.status).toBe('partial')
      expect(getCampaign(db, secondId)).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT })
      expect(listOutbox(db)).toHaveLength(CERAMICS_COUNT)
      expect(listOutbox(db).every((mail) => mail.campaignId === secondId)).toBe(true)
    } finally {
      logged.mockRestore()
    }
  })
})

describe('дослать исключённому', () => {
  const sentWithout = async (excluded: string[], mailer: Mailer = createDbMailer(db)) => {
    const { id } = createDraft(db, DRAFT)
    updateDraft(db, id, { excluded })
    confirmCampaign(db, id, shownLetter(db, id))
    await sendPending(db, mailer, id)
    return id
  }

  const recipient = (id: number, email: string) =>
    getCampaign(db, id)?.recipients.find((item) => item.email === email)

  it('после completed уходит ровно одно письмо, остальным ничего', async () => {
    const id = await sentWithout(['anna@example.com'])
    expect(outboxEmails()).toHaveLength(CERAMICS_COUNT - 1)

    const campaign = includeRecipient(db, id, ' Anna@Example.COM ')
    expect(campaign).toMatchObject({ status: 'sending', total: CERAMICS_COUNT, pending: 1 })
    const counting = countingMailer()
    expect(await sendPending(db, counting, id)).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT })
    expect(counting.calls).toBe(1)
    expect(outboxEmails()).toEqual(getCampaign(db, id)?.recipients.map((item) => item.email))
    expect(recipient(id, 'anna@example.com')).toMatchObject({ status: 'sent', excluded: false, attempts: 1 })
  })

  it('ошибка включения адреса откатывает статус рассылки', async () => {
    const id = await sentWithout(['anna@example.com'])
    const campaign = getCampaign(db, id)
    db.exec("CREATE TRIGGER broken BEFORE UPDATE ON deliveries BEGIN SELECT RAISE(ABORT, 'диск полон'); END")
    expect(() => includeRecipient(db, id, 'anna@example.com')).toThrow('диск полон')
    expect(getCampaign(db, id)).toEqual(campaign)
    expect(listOutbox(db)).toHaveLength(CERAMICS_COUNT - 1)
  })

  it('после partial сначала resume, затем досылка без дублей', async () => {
    const id = await sentWithout(['anna@example.com'], mailerDownAfter(2))
    const partial = getCampaign(db, id)
    const outbox = listOutbox(db)
    expect(partial).toMatchObject({ status: 'partial', sent: 2, failed: 1 })
    expect(() => includeRecipient(db, id, 'anna@example.com'))
      .toThrow(new CampaignStateError('Сначала повторите отправку неотправленных писем'))
    expect(getCampaign(db, id)).toEqual(partial)
    expect(listOutbox(db)).toEqual(outbox)

    setMailerDown(db, false)
    const counting = countingMailer()
    expect(await resumed(id, counting)).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT - 1 })
    expect(counting.calls).toBe(CERAMICS_COUNT - 3)
    includeRecipient(db, id, 'anna@example.com')
    expect(await sendPending(db, counting, id)).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT })
    expect(counting.calls).toBe(CERAMICS_COUNT - 2)
    expect(outboxEmails()).toEqual(getCampaign(db, id)?.recipients.map((item) => item.email))
  })

  it('служба лежит при включении: повторная досылка запрещена до resume', async () => {
    const id = await sentWithout(['anna@example.com', 'boris@example.com'])
    setMailerDown(db, true)
    includeRecipient(db, id, 'anna@example.com')
    const partial = await sendPending(db, createDbMailer(db), id)
    const outbox = listOutbox(db)
    expect(partial).toMatchObject({ status: 'partial', failed: 1 })
    for (const email of ['anna@example.com', 'boris@example.com']) {
      expect(() => includeRecipient(db, id, email))
        .toThrow(new CampaignStateError('Сначала повторите отправку неотправленных писем'))
    }
    expect(getCampaign(db, id)).toEqual(partial)
    expect(listOutbox(db)).toEqual(outbox)

    setMailerDown(db, false)
    expect(await resumed(id)).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT - 1 })
    includeRecipient(db, id, 'boris@example.com')
    expect(await sendPending(db, createDbMailer(db), id)).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT })
    expect(outboxEmails()).toEqual(getCampaign(db, id)?.recipients.map((item) => item.email))
  })

  it('черновик и идущая рассылка — CampaignStateError', () => {
    const { id: draftId } = createDraft(db, DRAFT)
    updateDraft(db, draftId, { excluded: ['anna@example.com'] })
    expect(() => includeRecipient(db, draftId, 'anna@example.com')).toThrow('Дослать можно после отправки рассылки')

    const { id: sendingId } = createDraft(db, DRAFT)
    updateDraft(db, sendingId, { excluded: ['anna@example.com'] })
    confirmCampaign(db, sendingId, shownLetter(db, sendingId))
    expect(() => includeRecipient(db, sendingId, 'anna@example.com')).toThrow('Дождитесь завершения отправки')
    expect(recipient(sendingId, 'anna@example.com')?.excluded).toBe(true)
  })

  it('повторное включение — 409, письмо не дублируется', async () => {
    const id = await sentWithout(['anna@example.com'])
    includeRecipient(db, id, 'anna@example.com')
    await sendPending(db, createDbMailer(db), id)
    expect(() => includeRecipient(db, id, 'anna@example.com')).toThrow(CampaignStateError)
    expect(() => includeRecipient(db, id, 'boris@example.com')).toThrow('Получатель уже включён')
    expect(getCampaign(db, id)?.status).toBe('completed')
    expect(listOutbox(db)).toHaveLength(CERAMICS_COUNT)
  })

  it('неизвестный адрес и рассылка — CampaignNotFoundError', async () => {
    const id = await sentWithout(['anna@example.com'])
    expect(() => includeRecipient(db, id, 'gleb@example.com')).toThrow('Такого получателя нет в рассылке')
    expect(() => includeRecipient(db, 999, 'anna@example.com')).toThrow(CampaignNotFoundError)
    expect(getCampaign(db, id)?.status).toBe('completed')
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

  it('ключ идемпотентности сохраняется в outbox', async () => {
    const id = confirmed()
    const mail = { campaignId: id, email: 'anna@example.com', subject: 'Тема', body: 'Текст', idempotencyKey: mailKey(id, 'anna@example.com') }
    await createDbMailer(db).send(mail)
    expect(db.prepare('SELECT idempotency_key FROM outbox').all()).toEqual([{ idempotency_key: `${id}:anna@example.com` }])
  })

  it('повтор с тем же ключом не пишет второе письмо даже на другой адрес', async () => {
    const id = confirmed()
    const mailer = createDbMailer(db)
    const mail = { campaignId: id, email: 'anna@example.com', subject: 'Тема', body: 'Текст', idempotencyKey: 'один-ключ' }
    await mailer.send(mail)
    await mailer.send({ ...mail, email: 'boris@example.com' })
    expect(listOutbox(db).map((item) => item.email)).toEqual(['anna@example.com'])
  })

  it('UNIQUE не даёт вставить дубль напрямую', () => {
    const insert = (email: string, key: string) => db
      .prepare("INSERT INTO outbox (campaign_id, email, subject, body, sent_at, idempotency_key) VALUES (1, ?, 'Тема', 'Текст', '', ?)")
      .run(email, key)
    insert('anna@example.com', '1:anna@example.com')
    expect(() => insert('anna@example.com', 'другой')).toThrow(/UNIQUE/)
    expect(() => insert('boris@example.com', '1:anna@example.com')).toThrow(/UNIQUE/)
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
    confirmCampaign(first, id, shownLetter(first, id))
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
    confirmCampaign(first, id, shownLetter(first, id))
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

  it('после рестарта recoverCampaigns не меняет partial и completed', async () => {
    const path = join(dir, 'app.db')
    const first = openDb(path)
    seed(first)
    const { id: partialId } = createDraft(first, DRAFT)
    confirmCampaign(first, partialId, shownLetter(first, partialId))
    setMailerDown(first, true)
    await sendPending(first, createDbMailer(first), partialId)
    setMailerDown(first, false)
    const { id: completedId } = createDraft(first, DRAFT)
    confirmCampaign(first, completedId, shownLetter(first, completedId))
    await sendPending(first, createDbMailer(first), completedId)
    const campaigns = [partialId, completedId].map((id) => getCampaign(first, id))
    const outbox = listOutbox(first)
    first.close()

    const second = openDb(path)
    await recoverCampaigns(second, createDbMailer(second))
    expect([partialId, completedId].map((id) => getCampaign(second, id))).toEqual(campaigns)
    expect(listOutbox(second)).toEqual(outbox)
    second.close()
  })

  it('рестарт сразу после включения дошлёт ещё не отправленное письмо', async () => {
    const path = join(dir, 'app.db')
    const first = openDb(path)
    seed(first)
    const { id } = createDraft(first, DRAFT)
    updateDraft(first, id, { excluded: ['anna@example.com'] })
    confirmCampaign(first, id, shownLetter(first, id))
    await sendPending(first, createDbMailer(first), id)
    expect(getCampaign(first, id)?.status).toBe('completed')
    const outbox = listOutbox(first)
    expect(outbox).toHaveLength(CERAMICS_COUNT - 1)
    expect(includeRecipient(first, id, 'anna@example.com')).toMatchObject({ status: 'sending', pending: 1 })
    expect(listOutbox(first)).toEqual(outbox)
    expect(outbox.some((mail) => mail.email === 'anna@example.com')).toBe(false)
    first.close()

    const second = openDb(path)
    await recoverCampaigns(second, createDbMailer(second))
    expect(getCampaign(second, id)).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT })
    const recovered = listOutbox(second)
    expect(recovered).toHaveLength(CERAMICS_COUNT)
    expect(recovered.filter((mail) => !outbox.some((previous) => previous.id === mail.id)))
      .toEqual([expect.objectContaining({ email: 'anna@example.com' })])
    expect(recovered).toEqual(expect.arrayContaining(outbox))
    second.close()
  })

  it('рестарт после включения исключённого дошлёт ему одно письмо', async () => {
    const path = join(dir, 'app.db')
    const first = openDb(path)
    seed(first)
    const { id } = createDraft(first, DRAFT)
    updateDraft(first, id, { excluded: ['anna@example.com'] })
    confirmCampaign(first, id, shownLetter(first, id))
    await sendPending(first, createDbMailer(first), id)
    includeRecipient(first, id, 'anna@example.com')
    await createDbMailer(first).send({
      campaignId: id, email: 'anna@example.com', subject: DRAFT.subject, body: DRAFT.body, idempotencyKey: mailKey(id, 'anna@example.com'),
    })
    first.close()

    const second = openDb(path)
    await recoverCampaigns(second, createDbMailer(second))
    expect(getCampaign(second, id)).toMatchObject({ status: 'completed', sent: CERAMICS_COUNT })
    expect(listOutbox(second)).toHaveLength(CERAMICS_COUNT)
    second.close()
  })
})
