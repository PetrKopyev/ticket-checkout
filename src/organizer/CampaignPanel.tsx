import { useEffect, useRef, useState } from 'react'
import { confirmCampaign, getCampaign, resumeCampaign, updateCampaign } from './client'
import type { Campaign, CampaignStatus } from './client'
import RecipientsTable from './RecipientsTable'
import {
  alertClass,
  cardClass,
  chipClass,
  dangerChipClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  stepHeadingClass,
} from '../components/ui'

const statusLabels: Record<CampaignStatus, string> = {
  draft: 'Черновик',
  sending: 'Отправляется',
  completed: 'Отправлена',
  partial: 'Отправлена частично',
}

const excludedOf = (campaign: Campaign) =>
  campaign.recipients.filter((recipient) => recipient.excluded).map((recipient) => recipient.email)

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

const CampaignPanel = ({ campaignId, onSent }: { campaignId: number | null; onSent: () => void }) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [excluded, setExcluded] = useState<string[]>([])
  const [isConfirming, setIsConfirming] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const confirmHeading = useRef<HTMLHeadingElement>(null)

  const apply = (next: Campaign) => {
    setCampaign(next)
    setSubject(next.subject)
    setBody(next.body)
    setExcluded(excludedOf(next))
  }

  useEffect(() => {
    if (campaignId === null) return
    getCampaign(campaignId).then(apply, (reason: Error) => setError(reason.message))
  }, [campaignId])

  useEffect(() => {
    if (campaign?.status !== 'sending') return
    const timer = setTimeout(() => getCampaign(campaign.id).then(setCampaign), 1000)
    return () => clearTimeout(timer)
  }, [campaign])

  const sent = campaign?.sent
  useEffect(() => {
    if (sent !== undefined) onSent()
  }, [sent, onSent])

  useEffect(() => {
    if (isConfirming) confirmHeading.current?.focus()
  }, [isConfirming])

  if (!campaign) {
    return (
      <section aria-label="Рассылка" className={cardClass}>
        {error
          ? <p role="alert" className={alertClass}>{error}</p>
          : <p className="text-ink-muted">Рассылки пока нет. Попросите помощника подготовить уведомление.</p>}
      </section>
    )
  }

  const isDraft = campaign.status === 'draft'
  const isDirty = subject !== campaign.subject
    || body !== campaign.body
    || [...excluded].sort().join() !== excludedOf(campaign).sort().join()
  const recipientsCount = campaign.recipients.length - excluded.length

  const run = async (action: () => Promise<Campaign>) => {
    setIsBusy(true)
    setError('')
    try {
      apply(await action())
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setIsBusy(false)
    }
  }

  const save = async () => {
    await run(() => updateCampaign(campaign.id, { subject, body, excluded }))
    setSaved(true)
  }

  const send = () => run(async () => {
    if (isDirty) await updateCampaign(campaign.id, { subject, body, excluded })
    setIsConfirming(false)
    return confirmCampaign(campaign.id)
  })

  const toggle = (email: string) => {
    setSaved(false)
    setExcluded((previous) => previous.includes(email)
      ? previous.filter((item) => item !== email)
      : [...previous, email])
  }

  return (
    <section aria-labelledby="campaign-heading" className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="campaign-heading" className="text-xl">Рассылка</h2>
        <p className={campaign.status === 'partial' ? dangerChipClass : chipClass}>
          {statusLabels[campaign.status]}
        </p>
      </div>
      <p className="mt-2 break-words font-semibold">{campaign.eventTitle}</p>
      <p className="text-sm text-ink-muted">{formatDate(campaign.startsAt)}</p>

      {isDraft ? (
        <div className="mt-4">
          <label htmlFor="campaign-subject" className="text-sm font-medium">Тема</label>
          <input
            id="campaign-subject"
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value)
              setSaved(false)
            }}
            className={inputClass}
          />
          <label htmlFor="campaign-body" className="mt-4 block text-sm font-medium">Текст письма</label>
          <textarea
            id="campaign-body"
            rows={8}
            value={body}
            onChange={(event) => {
              setBody(event.target.value)
              setSaved(false)
            }}
            className={inputClass}
          />
        </div>
      ) : (
        <div className="mt-4 rounded-control border border-line p-4">
          <p className="break-words font-bold">{campaign.subject}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-ink-soft">{campaign.body}</p>
        </div>
      )}

      {!isDraft && (
        <div className="mt-4">
          <p aria-live="polite" className="font-semibold tabular-nums">
            Отправлено {campaign.sent} из {campaign.total}
          </p>
          <progress
            value={campaign.sent}
            max={campaign.total}
            aria-label="Прогресс отправки"
            className="mt-2 h-2 w-full accent-violet"
          />
          {campaign.status === 'completed' && <p className="mt-2 text-green">Все письма отправлены</p>}
        </div>
      )}

      {campaign.status === 'partial' && (
        <div role="alert" className={`${alertClass} mt-4`}>
          <p>
            Отправлено {campaign.sent} из {campaign.total}. Часть писем не ушла:
            служба отправки недоступна или адрес отклонён.
          </p>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => run(() => resumeCampaign(campaign.id))}
            className={`${primaryButtonClass} mt-3`}
          >
            Продолжить отправку
          </button>
        </div>
      )}

      {error && <p role="alert" className={`${alertClass} mt-4`}>{error}</p>}

      <RecipientsTable
        recipients={campaign.recipients}
        editable={isDraft}
        excluded={excluded}
        onToggle={toggle}
      />

      {isDraft && !isConfirming && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={isBusy || !isDirty} onClick={save} className={secondaryButtonClass}>
            Сохранить
          </button>
          <button
            type="button"
            disabled={isBusy || recipientsCount === 0}
            onClick={() => setIsConfirming(true)}
            className={primaryButtonClass}
          >
            Подтвердить и отправить
          </button>
          <p role="status" className="text-sm text-green">{saved && !isDirty && 'Сохранено'}</p>
        </div>
      )}

      {isDraft && isConfirming && (
        <div
          role="alertdialog"
          aria-labelledby="confirm-heading"
          className="mt-4 rounded-control border border-violet-bright/50 bg-surface-muted p-4"
        >
          <h3 id="confirm-heading" ref={confirmHeading} tabIndex={-1} className={stepHeadingClass}>
            Отправить письмо {recipientsCount} адресатам?
          </h3>
          <p className="mt-1 text-sm text-ink-muted">Отменить отправку после подтверждения нельзя.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" disabled={isBusy} onClick={send} className={primaryButtonClass}>
              Да, отправить
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setIsConfirming(false)}
              className={secondaryButtonClass}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default CampaignPanel
