import { describe, expect, it } from 'vitest'
import type { Campaign, CampaignStatus, Recipient } from './client'
import { firstError, isUnfinished, partialMessage, partialTitle, statusLabel, summarize } from './status'

const recipient = (email: string, status: Recipient['status'], error: string | null = null, excluded = false): Recipient =>
  ({ email, status, error, excluded })

const campaign = (recipients: Recipient[]): Campaign => ({
  id: 1,
  eventId: 'ceramics',
  eventTitle: 'Керамика',
  startsAt: '2026-11-20T16:00:00.000Z',
  subject: 'Перенос',
  body: 'Текст',
  status: 'partial',
  total: 4,
  sent: 2,
  failed: 1,
  pending: 1,
  recipients,
})

describe('summarize', () => {
  it('берёт счётчики из рассылки, исключённых — из получателей', () => {
    const recipients = [
      recipient('a@example.com', 'sent'),
      recipient('b@example.com', 'sent'),
      recipient('c@example.com', 'failed'),
      recipient('d@example.com', 'pending'),
      recipient('e@example.com', 'pending', null, true),
    ]
    expect(summarize(campaign(recipients))).toEqual({ sent: 2, failed: 1, pending: 1, excluded: 1 })
  })
})

describe('statusLabel', () => {
  it.each<[CampaignStatus, number, string]>([
    ['draft', 0, 'Черновик'],
    ['sending', 3, 'Отправляется'],
    ['completed', 5, 'Отправлена'],
    ['partial', 2, 'Отправлена частично'],
    ['partial', 0, 'Не отправлена'],
  ])('%s, отправлено %i — %s', (status, sent, expected) => {
    expect(statusLabel(status, sent)).toBe(expected)
  })
})

describe('partialTitle', () => {
  it.each([
    [0, 'Письма не отправлены'],
    [1, 'Часть писем не ушла'],
  ])('отправлено %i — %s', (sent, expected) => {
    expect(partialTitle(sent)).toBe(expected)
  })
})

describe('firstError', () => {
  it('берёт причину первой ошибки, пропуская исключённых', () => {
    const recipients = [
      recipient('a@example.com', 'failed', 'Ящик переполнен', true),
      recipient('b@example.com', 'sent'),
      recipient('c@example.com', 'failed', 'Служба отправки недоступна'),
    ]
    expect(firstError(campaign(recipients))).toBe('Служба отправки недоступна')
  })

  it('без ошибок — null', () => {
    expect(firstError(campaign([recipient('a@example.com', 'pending')]))).toBeNull()
  })
})

describe('partialMessage', () => {
  it('называет ошибку и сколько ещё не отправлено', () => {
    expect(partialMessage({ sent: 1, failed: 1, pending: 3, excluded: 0 }, 'Служба отправки недоступна')).toBe(
      'Ошибка у 1 адреса: Служба отправки недоступна. Остальным (3) письма ещё не отправлены.',
    )
  })

  it('без ожидающих говорит только об ошибке', () => {
    expect(partialMessage({ sent: 4, failed: 2, pending: 0, excluded: 1 }, 'Адрес не существует.')).toBe(
      'Ошибка у 2 адресов: Адрес не существует.',
    )
  })

  it('без ошибок не выдумывает причину', () => {
    expect(partialMessage({ sent: 0, failed: 0, pending: 5, excluded: 0 }, null)).toBe(
      'Отправка остановлена, не отправлено 5 писем.',
    )
  })
})

describe('isUnfinished', () => {
  it.each<[CampaignStatus, boolean]>([
    ['draft', false],
    ['sending', false],
    ['partial', true],
    ['completed', false],
  ])('%s — %s', (status, expected) => {
    expect(isUnfinished({ id: 1, eventTitle: 'Керамика', subject: 'Перенос', status, total: 3, sent: 1 })).toBe(expected)
  })
})
