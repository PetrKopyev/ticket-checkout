import { useState } from 'react'
import type { CampaignSummary } from './client'
import { statusLabel } from './status'
import { cardClass, chipClass, dangerChipClass, secondaryButtonClass } from '../components/ui'

const CampaignList = ({ campaigns, campaignId, onOpen }: {
  campaigns: CampaignSummary[]
  campaignId: number | null
  onOpen: (id: number) => void
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  if (campaigns.length === 0) return null
  const sorted = [...campaigns].sort((a, b) => b.id - a.id)
  const shown = isExpanded ? sorted : sorted.slice(0, 5)

  return (
    <section aria-labelledby="campaigns-heading" className={`${cardClass} max-sm:px-3 max-sm:py-4`}>
      <h2 id="campaigns-heading" className="text-lg sm:text-xl">Рассылки</h2>
      <ul className="mt-3 grid min-w-0 gap-2">
        {shown.map((campaign) => (
          <li key={campaign.id} className="min-w-0">
            <button
              type="button"
              aria-current={campaign.id === campaignId ? 'true' : undefined}
              onClick={() => onOpen(campaign.id)}
              className={`${secondaryButtonClass} flex w-full min-w-0 flex-wrap items-start justify-between gap-2 text-left aria-current:border-violet-bright aria-current:bg-surface-muted`}
            >
              <span className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                <span title={campaign.eventTitle} className="block overflow-hidden">{campaign.eventTitle}</span>
                <span title={campaign.subject} className="block min-w-0 truncate text-sm font-normal">{campaign.subject}</span>
                <span className="block text-sm font-normal text-ink-muted tabular-nums">отправлено {campaign.sent} из {campaign.total}</span>
              </span>
              <span className={campaign.status === 'partial' ? dangerChipClass : chipClass}>
                {statusLabel(campaign.status, campaign.sent)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {campaigns.length > 5 && (
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((previous) => !previous)}
          className={`${secondaryButtonClass} mt-3`}
        >
          {isExpanded ? 'Свернуть' : `Показать все (${campaigns.length})`}
        </button>
      )}
    </section>
  )
}

export default CampaignList
