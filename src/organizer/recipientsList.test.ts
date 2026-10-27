import { describe, expect, it } from 'vitest'
import type { CampaignStatus, Recipient, RecipientsPage } from './client'
import { applyExclusion, emptyRecipientsList, replaceRecipients, mergeRecipientsPage, recipientTabs, showIncludeAll, showIncludeRecipient, toggleExcluded } from './recipientsList'

const recipient = (email: string): Recipient => ({ email, status: 'pending', excluded: false, error: null })
const page = (emails: string[], total = 3): RecipientsPage => ({
  items: emails.map(recipient), total, counts: { all: total, sent: 0, pending: total, failed: 0, excluded: 0 },
})

describe('страницы получателей', () => {
  it('сливает страницы без дублей и считает offset по числу строк ответа', () => {
    const initial = emptyRecipientsList('all', '', 1)
    const first = mergeRecipientsPage(initial, page(['a', 'b']), 1, 0)
    const nextPage = page(['b', 'c'])
    nextPage.items[0] = { ...recipient('b'), status: 'sent' }
    const next = mergeRecipientsPage(first, nextPage, 1, 2)
    expect(next.items.map((item) => item.email)).toEqual(['a', 'b', 'c'])
    expect(next.items[1].status).toBe('sent')
    expect(next.offset).toBe(4)
    expect(next.counts).toEqual(nextPage.counts)
    expect(initial.items).toEqual([])
  })

  it.each([['excluded', ''], ['all', 'anna']] as const)('сбрасывает список при смене вкладки/поиска на %s/%s', (tab, q) => {
    const first = mergeRecipientsPage(emptyRecipientsList('all', '', 1), page(['a']), 1, 0)
    const reset = emptyRecipientsList(tab, q, 2)
    expect(reset).toMatchObject({ tab, q, items: [], offset: 0, total: 0 })
    expect(mergeRecipientsPage(reset, page(['old']), first.requestId, first.offset)).toBe(reset)
    expect(mergeRecipientsPage(reset, page(['new']), 2, 0).items.map((item) => item.email)).toEqual(['new'])
  })

  it('отбрасывает старый ответ после обновления той же вкладки', () => {
    const list = emptyRecipientsList('all', '', 5)
    expect(mergeRecipientsPage(list, page(['old']), 4, 0)).toBe(list)
  })

  it('не принимает страницу повторно или с неверным offset', () => {
    const list = mergeRecipientsPage(emptyRecipientsList('all', '', 1), page(['a']), 1, 0)
    expect(mergeRecipientsPage(list, page(['a']), 1, 0)).toBe(list)
    expect(mergeRecipientsPage(list, page(['c']), 1, 20)).toBe(list)
  })

  it('останавливает догрузку при пустом ответе', () => {
    const list = mergeRecipientsPage(emptyRecipientsList('all', '', 1), page([]), 1, 0)
    expect(list.offset).toBe(list.total)
  })
})

describe('исключения', () => {
  it('добавляет и удаляет адрес, сохраняя исходный массив', () => {
    const initial = ['a']
    const added = toggleExcluded(initial, 'b')
    expect(added).toEqual(['a', 'b'])
    expect(toggleExcluded(added, 'a')).toEqual(['b'])
    expect(initial).toEqual(['a'])
  })

  it('не оставляет дублей при добавлении и удалении', () => {
    expect(toggleExcluded(['a', 'a'], 'b')).toEqual(['a', 'b'])
    expect(toggleExcluded(['a', 'a', 'b'], 'a')).toEqual(['b'])
    expect(toggleExcluded([], 'a')).toEqual(['a'])
  })
})

describe('вкладки и досылка', () => {
  it('в черновике показывает только все и исключённых', () => {
    expect(recipientTabs('draft').map((tab) => tab.value)).toEqual(['all', 'excluded'])
  })

  it.each<CampaignStatus>(['sending', 'partial', 'completed'])('для %s показывает все вкладки', (status) => {
    expect(recipientTabs(status).map((tab) => tab.value)).toEqual(['all', 'sent', 'pending', 'failed', 'excluded'])
  })

  it.each<[CampaignStatus, boolean]>([
    ['completed', true], ['partial', false], ['draft', false], ['sending', false],
  ])('досылка при %s — %s', (status, expected) => {
    expect(showIncludeRecipient(status, true)).toBe(expected)
    expect(showIncludeRecipient(status, false)).toBe(false)
    expect(showIncludeAll(status, 'excluded', 2)).toBe(expected)
    expect(showIncludeAll(status, 'excluded', 0)).toBe(false)
    expect(showIncludeAll(status, 'all', 2)).toBe(false)
  })
})

describe('обновление списка на месте', () => {
  const counts = { all: 3, sent: 0, pending: 3, failed: 0, excluded: 1 }
  const loaded = (tab: 'all' | 'excluded') => mergeRecipientsPage(emptyRecipientsList(tab, '', 1), page(['a', 'b', 'c']), 1, 0)

  it('отмечает исключение в строке, остальное не трогает', () => {
    const list = loaded('all')
    const next = applyExclusion(list, 'b', true, counts)
    expect(next.items.map((item) => item.excluded)).toEqual([false, true, false])
    expect(next).toMatchObject({ total: 3, offset: 3, counts })
  })

  it('убирает строку на вкладке исключённых при возврате', () => {
    const next = applyExclusion(loaded('excluded'), 'b', false, counts)
    expect(next.items.map((item) => item.email)).toEqual(['a', 'c'])
    expect(next).toMatchObject({ total: 2, offset: 2 })
  })

  it('подменяет загруженные строки и счётчики, отбрасывая устаревший ответ', () => {
    const list = loaded('all')
    const fresh = page(['a', 'b', 'c'])
    fresh.items[0] = { ...recipient('a'), status: 'sent' }
    expect(replaceRecipients(list, fresh, 1, 3).items[0].status).toBe('sent')
    expect(replaceRecipients(list, fresh, 2, 3)).toBe(list)
    expect(replaceRecipients(list, fresh, 1, 5)).toBe(list)
  })
})
