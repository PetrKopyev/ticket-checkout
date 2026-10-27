import { useEffect, useRef, useState } from 'react'
import type { CampaignSummary } from './client'
import { useBackdropClose } from './dialog'
import { statusLabel } from './status'
import { chipClass, dangerChipClass, secondaryButtonClass } from '../components/ui'

const CampaignsDialog = ({ campaigns, campaignId, onOpen, onClose }: {
  campaigns: CampaignSummary[]
  campaignId: number | null
  onOpen: (id: number) => void
  onClose: () => void
}) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const backdrop = useBackdropClose(dialog)

  useEffect(() => {
    const opener = document.activeElement
    dialog.current?.showModal()
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  const sorted = [...campaigns].sort((a, b) => b.id - a.id)

  return (
    <dialog
      ref={dialog}
      {...backdrop}
      aria-labelledby="campaigns-heading"
      onClose={(event) => { if (event.target === event.currentTarget && !event.currentTarget.open) onClose() }}
      className="m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl overflow-hidden rounded-3xl border border-line-strong bg-card p-0 text-ink shadow-card backdrop:bg-black/70"
    >
      <div className="max-h-[calc(100dvh-1rem-2px)] min-w-0 overflow-y-auto overscroll-contain">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-card p-4 max-sm:px-3">
          <h2 id="campaigns-heading" className="text-lg sm:text-xl">Рассылки</h2>
          <button type="button" onClick={() => dialog.current?.close()} className={secondaryButtonClass}>
            Закрыть
          </button>
        </header>
        <ul className="grid min-w-0 gap-2 p-4 max-sm:px-3">
          {sorted.map((campaign) => (
            <li key={campaign.id} className="min-w-0">
              <button
                type="button"
                aria-current={campaign.id === campaignId ? 'true' : undefined}
                onClick={() => {
                  onOpen(campaign.id)
                  dialog.current?.close()
                }}
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
      </div>
    </dialog>
  )
}

const CampaignList = ({ campaigns, campaignId, onOpen }: {
  campaigns: CampaignSummary[]
  campaignId: number | null
  onOpen: (id: number) => void
}) => {
  const [isOpen, setIsOpen] = useState(false)
  if (campaigns.length === 0) return null

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={`${secondaryButtonClass} justify-self-start`}>
        Рассылки ({campaigns.length})
      </button>
      {isOpen && (
        <CampaignsDialog campaigns={campaigns} campaignId={campaignId} onOpen={onOpen} onClose={() => setIsOpen(false)} />
      )}
    </>
  )
}

export default CampaignList
