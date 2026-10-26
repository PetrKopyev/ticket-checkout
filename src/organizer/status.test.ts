import { describe, expect, it } from 'vitest'
import type { CampaignStatus, Recipient } from './client'
import { isUnfinished, partialReasons, partialTitle, statusLabel, summarize } from './status'

const recipient = (email: string, status: Recipient['status']): Recipient =>
  ({ email, status, error: null, attempts: 0, excluded: false })

describe('summarize', () => {
  const recipients = [
    recipient('a@example.com', 'sent'),
    recipient('b@example.com', 'sent'),
    recipient('c@example.com', 'failed'),
    recipient('d@example.com', 'pending'),
    recipient('e@example.com', 'pending'),
  ]

  it('считает получателей по статусам', () => {
    expect(summarize(recipients, [])).toEqual({ sent: 2, failed: 1, pending: 2, excluded: 0 })
  })

  it('не считает исключённых в статусах', () => {
    expect(summarize(recipients, ['b@example.com', 'd@example.com'])).toEqual({ sent: 1, failed: 1, pending: 1, excluded: 2 })
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

describe('partialReasons', () => {
  it('называет ошибки адресов и недоступную службу', () => {
    expect(partialReasons({ sent: 1, failed: 1, pending: 3, excluded: 0 })).toEqual([
      'Ошибка у 1 адреса — причина указана в таблице.',
      '3 письма ждут повтора: служба отправки недоступна.',
    ])
  })

  it('без ожидающих не упоминает службу', () => {
    expect(partialReasons({ sent: 4, failed: 2, pending: 0, excluded: 1 })).toEqual([
      'Ошибка у 2 адресов — причина указана в таблице.',
    ])
  })
})

describe('isUnfinished', () => {
  it.each<[CampaignStatus, boolean]>([
    ['draft', false],
    ['sending', true],
    ['partial', true],
    ['completed', false],
  ])('%s — %s', (status, expected) => {
    expect(isUnfinished({ id: 1, eventTitle: 'Керамика', subject: 'Перенос', status, total: 3, sent: 1 })).toBe(expected)
  })
})
