import type { CampaignStatus, CampaignSummary, Recipient } from './client'
import { plural } from '../format'

export type Summary = { sent: number; failed: number; pending: number; excluded: number }

export const summarize = (recipients: Recipient[], excluded: string[]): Summary => {
  const active = recipients.filter((recipient) => !excluded.includes(recipient.email))
  const countOf = (status: Recipient['status']) => active.filter((recipient) => recipient.status === status).length
  return {
    sent: countOf('sent'),
    failed: countOf('failed'),
    pending: countOf('pending'),
    excluded: recipients.length - active.length,
  }
}

const statusLabels: Record<CampaignStatus, string> = {
  draft: 'Черновик',
  sending: 'Отправляется',
  completed: 'Отправлена',
  partial: 'Отправлена частично',
}

export const statusLabel = (status: CampaignStatus, sent: number) =>
  status === 'partial' && sent === 0 ? 'Не отправлена' : statusLabels[status]

export const partialTitle = (sent: number) => sent === 0 ? 'Письма не отправлены' : 'Часть писем не ушла'

export const partialReasons = ({ failed, pending }: Summary) => {
  const reasons: string[] = []
  if (failed > 0) {
    reasons.push(`Ошибка у ${failed} ${plural(failed, 'адреса', 'адресов', 'адресов')} — причина указана в таблице.`)
  }
  if (pending > 0) {
    reasons.push(`${pending} ${plural(pending, 'письмо ждёт', 'письма ждут', 'писем ждут')} повтора: служба отправки недоступна.`)
  }
  return reasons
}

export const isUnfinished = (campaign: CampaignSummary) => campaign.status === 'sending' || campaign.status === 'partial'
