import type { CampaignStatus, Recipient, RecipientsPage, RecipientsTab } from './client'
import { canInclude } from './status'

export type RecipientsList = {
  tab: RecipientsTab
  q: string
  requestId: number
  items: Recipient[]
  total: number
  offset: number
  counts: RecipientsPage['counts'] | null
}

export const emptyRecipientsList = (tab: RecipientsTab, q: string, requestId: number): RecipientsList => ({
  tab, q, requestId, items: [], total: 0, offset: 0, counts: null,
})

export const mergeRecipientsPage = (list: RecipientsList, page: RecipientsPage, requestId: number, offset: number): RecipientsList => {
  if (list.requestId !== requestId || list.offset !== offset) return list
  const items = new Map(list.items.map((item) => [item.email, item]))
  page.items.forEach((item) => items.set(item.email, item))
  return {
    ...list,
    items: [...items.values()],
    total: page.total,
    offset: page.items.length ? offset + page.items.length : page.total,
    counts: page.counts,
  }
}

export const toggleExcluded = (excluded: string[], email: string) =>
  [...new Set(excluded.includes(email) ? excluded.filter((item) => item !== email) : [...excluded, email])]

const tabs: { value: RecipientsTab; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'sent', label: 'Отправлено' },
  { value: 'pending', label: 'Ожидают' },
  { value: 'failed', label: 'Ошибки' },
  { value: 'excluded', label: 'Исключены' },
]

export const recipientTabs = (status: CampaignStatus) =>
  status === 'draft' ? tabs.filter((tab) => tab.value === 'all' || tab.value === 'excluded') : tabs

export const showIncludeRecipient = (status: CampaignStatus, excluded: boolean) => canInclude(status) && excluded

export const showIncludeAll = (status: CampaignStatus, tab: RecipientsTab, excluded: number) =>
  canInclude(status) && tab === 'excluded' && excluded > 0
