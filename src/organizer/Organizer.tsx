import { useCallback, useEffect, useState } from 'react'
import { listCampaigns } from './client'
import ChatPanel from './ChatPanel'
import CampaignPanel from './CampaignPanel'
import OutboxList from './OutboxList'
import DemoPanel from './DemoPanel'
import { cardClass } from '../components/ui'

const Organizer = () => {
  const [campaignId, setCampaignId] = useState<number | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [outboxKey, setOutboxKey] = useState(0)

  useEffect(() => {
    listCampaigns().then((campaigns) => setCampaignId(campaigns[0]?.id ?? null))
  }, [resetKey])

  const reloadOutbox = useCallback(() => setOutboxKey((previous) => previous + 1), [])

  const reset = () => {
    setCampaignId(null)
    setResetKey((previous) => previous + 1)
    reloadOutbox()
  }

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
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-2">
        <ChatPanel key={resetKey} onCampaign={setCampaignId} />
        <div className="grid min-w-0 gap-6">
          <CampaignPanel key={campaignId} campaignId={campaignId} onSent={reloadOutbox} />
          <OutboxList reloadKey={outboxKey} />
        </div>
      </div>
      <DemoPanel key={resetKey} onReset={reset} />
    </>
  )
}

export default Organizer
