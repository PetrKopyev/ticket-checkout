import { useCallback, useEffect, useRef, useState } from 'react'
import { listCampaigns } from './client'
import type { CampaignSummary } from './client'
import ChatPanel from './ChatPanel'
import CampaignPanel from './CampaignPanel'
import OutboxList from './OutboxList'
import DemoPanel from './DemoPanel'
import { isUnfinished } from './status'
import { alertClass, cardClass, secondaryButtonClass } from '../components/ui'

const Organizer = () => {
  const [campaignId, setCampaignId] = useState<number | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [error, setError] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const [outboxKey, setOutboxKey] = useState(0)
  const campaignArea = useRef<HTMLDivElement>(null)

  useEffect(() => {
    history.scrollRestoration = 'manual'
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    listCampaigns().then(
      (list) => {
        setCampaigns(list)
        setCampaignId(list[0]?.id ?? null)
      },
      (reason: Error) => setError(reason.message),
    )
  }, [resetKey])

  const reloadOutbox = useCallback(() => {
    setOutboxKey((previous) => previous + 1)
    listCampaigns().then(
      (list) => {
        setError('')
        setCampaigns(list)
      },
      (reason: Error) => setError(reason.message),
    )
  }, [])

  const reset = () => {
    setCampaignId(null)
    setError('')
    setResetKey((previous) => previous + 1)
    setOutboxKey((previous) => previous + 1)
  }

  const openCampaign = (id: number) => {
    setCampaignId(id)
    campaignArea.current?.focus()
  }

  const unfinished = campaigns.find((campaign) => campaign.id !== campaignId && isUnfinished(campaign))

  return (
    <>
      <header className={`${cardClass} mb-6`}>
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-violet-soft">
          <img src="/logo.svg" alt="" width={24} height={24} className="shrink-0" />
          Уведомления покупателям
        </p>
        <h1 className="text-2xl sm:text-3xl">Кабинет организатора</h1>
        <p className="mt-3 text-ink-muted">
          Опишите помощнику, что изменилось, — он подготовит письмо. Отправка только после вашего подтверждения.
        </p>
      </header>
      {error && <p role="alert" className={`${alertClass} mb-6`}>Не удалось загрузить рассылки: {error}</p>}
      {unfinished && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-red/40 bg-red/10 p-4"
        >
          <div className="min-w-0">
            <p className="font-semibold text-red tabular-nums">
              Рассылка не завершена: {unfinished.sent} из {unfinished.total}
            </p>
            <p className="break-words text-sm text-ink-soft">{unfinished.subject}</p>
          </div>
          <button type="button" onClick={() => openCampaign(unfinished.id)} className={secondaryButtonClass}>
            Открыть рассылку
          </button>
        </div>
      )}
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-2">
        <ChatPanel key={resetKey} onCampaign={setCampaignId} onOpenCampaign={openCampaign} />
        <div className="grid min-w-0 gap-6">
          <div ref={campaignArea} tabIndex={-1} className="min-w-0 scroll-mt-4 outline-none">
            <CampaignPanel key={campaignId} campaignId={campaignId} onProgress={reloadOutbox} />
          </div>
          <OutboxList campaigns={campaigns} reloadKey={outboxKey} onReload={reloadOutbox} />
        </div>
      </div>
      <DemoPanel key={resetKey} onReset={reset} />
    </>
  )
}

export default Organizer
