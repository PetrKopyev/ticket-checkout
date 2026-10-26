import { useEffect, useState } from 'react'
import { getOutbox } from './client'
import type { CampaignSummary, OutboxItem } from './client'
import { plural } from '../format'
import { cardClass, secondaryButtonClass } from '../components/ui'

const formatSentAt = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    .replace(',', '')

const OutboxList = ({ campaigns, reloadKey, onReload }: {
  campaigns: CampaignSummary[]
  reloadKey: number
  onReload: () => void
}) => {
  const [items, setItems] = useState<OutboxItem[]>([])

  useEffect(() => {
    getOutbox().then(setItems)
  }, [reloadKey])

  const groups = campaigns
    .map((campaign) => ({ campaign, letters: items.filter((item) => item.campaignId === campaign.id) }))
    .filter((group) => group.letters.length > 0)

  return (
    <section aria-labelledby="outbox-heading" className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="outbox-heading" className="text-xl">Отправленные письма</h2>
        <button type="button" onClick={onReload} className={secondaryButtonClass}>Обновить</button>
      </div>
      <p className="mt-1 text-sm text-ink-muted">Демо-почтовый ящик: что ушло покупателям</p>
      {groups.length === 0 && <p className="mt-4 text-ink-muted">Писем пока нет</p>}
      {groups.map(({ campaign, letters }) => (
        <section key={campaign.id} aria-labelledby={`outbox-${campaign.id}`} className="mt-4 border-t border-line pt-4">
          <h3 id={`outbox-${campaign.id}`} className="break-words text-base">
            {campaign.subject} — {campaign.total} {plural(campaign.total, 'получатель', 'получателя', 'получателей')},
            {' '}{campaign.sent} отправлено
          </h3>
          <p className="text-sm text-ink-muted">{campaign.eventTitle}</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {letters.map((item) => (
              <li key={item.id} className="flex flex-wrap justify-between gap-x-3">
                <span className="min-w-0 break-all">{item.email}</span>
                <span className="text-ink-muted tabular-nums">{formatSentAt(item.sentAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}

export default OutboxList
