import type { Campaign, CampaignStatus, CampaignSummary, Recipient } from './client'
import { plural } from '../format'

export type Summary = { sent: number; failed: number; pending: number; excluded: number }

export const summarize = ({ sent, failed, pending, excluded }: Campaign): Summary => ({
  sent,
  failed,
  pending,
  excluded,
})

const statusLabels: Record<CampaignStatus, string> = {
  draft: 'Черновик',
  sending: 'Отправляется',
  completed: 'Отправлена',
  partial: 'Отправлена частично',
}

export const statusLabel = (status: CampaignStatus, sent: number) =>
  status === 'partial' && sent === 0 ? 'Не отправлена' : statusLabels[status]

export const partialTitle = (sent: number) => sent === 0 ? 'Письма не отправлены' : 'Часть писем не ушла'

export const firstError = (items: Recipient[]) =>
  items.find((recipient) => recipient.status === 'failed' && !recipient.excluded)?.error ?? null

export const partialMessage = ({ failed, pending }: Summary, error: string | null) => {
  const letters = `${pending} ${plural(pending, 'письмо', 'письма', 'писем')}`
  if (failed === 0) return `Отправка остановлена, не отправлено ${letters}.`
  const reason = error ? `: ${error.replace(/\.$/, '')}` : ''
  const rest = pending > 0 ? ` Остальным (${pending}) письма ещё не отправлены.` : ''
  return `Ошибка у ${failed} ${plural(failed, 'адреса', 'адресов', 'адресов')}${reason}.${rest}`
}

export const eventDateLabel = (iso: string) => {
  const date = new Date(iso)
  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return `Дата в афише сейчас: ${day} в ${time}`
}

export const isUnfinished = (campaign: CampaignSummary) => campaign.status === 'partial'

export const canInclude = (status: CampaignStatus) => status === 'completed'
