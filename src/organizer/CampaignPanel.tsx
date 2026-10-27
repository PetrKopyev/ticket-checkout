import { useEffect, useRef, useState } from 'react'
import { confirmCampaign, getCampaign, getRecipients, resumeCampaign, updateCampaign } from './client'
import type { Campaign, Limits } from './client'
import ConfirmDialog from './ConfirmDialog'
import EmailPreview from './EmailPreview'
import RecipientsDialog from './RecipientsDialog'
import { eventDateLabel, firstError, partialMessage, partialTitle, statusLabel, summarize } from './status'
import { validate } from './validate'
import { plural } from '../format'
import {
  alertClass,
  cardClass,
  chipClass,
  dangerChipClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/ui'

const LengthCounter = ({ length, max }: { length: number; max: number }) => length < max * 0.8 ? null : (
  <p className={`mt-1 text-right text-xs tabular-nums ${length > max ? 'text-red' : 'text-ink-muted'}`}>
    {length} / {max}
  </p>
)

const panelClass = `${cardClass} max-sm:px-3 max-sm:py-4`

const CampaignPanel = ({ campaignId, limits, onProgress }: {
  campaignId: number | null
  limits: Limits | null
  onProgress: () => void
}) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [excluded, setExcluded] = useState<string[]>([])
  const [isConfirming, setIsConfirming] = useState(false)
  const [isRecipientsOpen, setIsRecipientsOpen] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [pollAttempt, setPollAttempt] = useState(0)
  const [isSent, setIsSent] = useState(false)
  const sendButton = useRef<HTMLButtonElement>(null)
  const recipientsButton = useRef<HTMLButtonElement>(null)
  const progress = useRef<HTMLDivElement>(null)
  const busy = useRef(false)

  const apply = (next: Campaign) => {
    setCampaign(next)
    setSubject(next.subject)
    setBody(next.body)
    setExcluded(next.excludedEmails)
    if (next.status !== 'partial') setDeliveryError(null)
  }

  useEffect(() => {
    if (campaignId === null) return
    let active = true
    getCampaign(campaignId).then(
      (next) => { if (active) apply(next) },
      (reason: Error) => { if (active) setError(reason.message) },
    )
    return () => { active = false }
  }, [campaignId])

  useEffect(() => {
    if (campaign?.status !== 'sending') return
    const timer = setTimeout(() => {
      getCampaign(campaign.id).then(
        (next) => {
          setError('')
          setCampaign(next)
        },
        (reason: Error) => {
          setError(reason.message)
          setPollAttempt((attempt) => attempt + 1)
        },
      )
    }, 1000)
    return () => clearTimeout(timer)
  }, [campaign, pollAttempt])

  const sent = campaign?.sent
  const status = campaign?.status
  const total = campaign?.total
  useEffect(() => {
    if (campaignId === null || status !== 'partial') return
    let active = true
    getRecipients(campaignId, { tab: 'failed', limit: 1 }).then(
      (page) => { if (active) setDeliveryError(firstError(page.items)) },
      () => {},
    )
    return () => { active = false }
  }, [campaignId, status])

  useEffect(() => {
    if (status) onProgress()
  }, [sent, status, total, onProgress])

  useEffect(() => {
    if (isSent) progress.current?.focus()
  }, [isSent])

  if (!campaign) {
    return (
      <section aria-label="Рассылка" className={panelClass}>
        {error
          ? <p role="alert" className={alertClass}>{error}</p>
          : <p className="text-ink-muted">Рассылки пока нет. Попросите помощника подготовить уведомление.</p>}
      </section>
    )
  }

  const isDraft = campaign.status === 'draft'
  const isDirty = subject !== campaign.subject
    || body !== campaign.body
    || [...excluded].sort().join() !== [...campaign.excludedEmails].sort().join()
  const addressCount = campaign.total + campaign.excluded
  const recipientsCount = addressCount - excluded.length
  const errors = validate({ subject, body, recipientsCount }, limits)
  const unsentCount = campaign.total - campaign.sent

  const run = async (action: () => Promise<Campaign>) => {
    if (busy.current) return false
    busy.current = true
    setIsBusy(true)
    setError('')
    try {
      apply(await action())
      return true
    } catch (reason) {
      setError((reason as Error).message)
      return false
    } finally {
      busy.current = false
      setIsBusy(false)
    }
  }

  const save = async () => {
    if (await run(() => updateCampaign(campaign.id, { subject, body, excluded }))) setSaved(true)
  }

  const send = () => run(async () => {
    if (isDirty) await updateCampaign(campaign.id, { subject, body, excluded })
    return confirmCampaign(campaign.id, { subject, body, excluded })
  })

  const closeDialog = (isDone: boolean) => {
    setIsConfirming(false)
    if (isDone) setIsSent(true)
    else sendButton.current?.focus()
  }

  const updateRecipients = (next: Campaign) => {
    setCampaign(next)
    setExcluded(next.excludedEmails)
    setSaved(false)
  }

  return (
    <section aria-labelledby="campaign-heading" className={panelClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-violet-soft">Рассылка</p>
          <h2 id="campaign-heading" className="mt-1 min-w-0 break-words text-lg sm:text-xl">{campaign.eventTitle}</h2>
        </div>
        <p className={campaign.status === 'partial' ? dangerChipClass : chipClass}>
          {statusLabel(campaign.status, campaign.sent)}
        </p>
      </div>
      <p className="mt-1 text-sm text-ink-muted">{eventDateLabel(campaign.startsAt)}</p>
      <p className="text-sm text-ink-muted">
        {addressCount} {plural(addressCount, 'уникальный адрес', 'уникальных адреса', 'уникальных адресов')}
      </p>

      {isDraft ? (
        <div className="mt-4">
          <label htmlFor="campaign-subject" className="text-sm font-medium">Тема</label>
          <input
            id="campaign-subject"
            value={subject}
            maxLength={limits?.subject}
            aria-invalid={!subject.trim() || (limits !== null && subject.length > limits.subject)}
            onChange={(event) => {
              setSubject(event.target.value)
              setSaved(false)
            }}
            className={inputClass}
          />
          {limits && <LengthCounter length={subject.length} max={limits.subject} />}
          <label htmlFor="campaign-body" className="mt-4 block text-sm font-medium">Текст письма</label>
          <textarea
            id="campaign-body"
            rows={8}
            value={body}
            maxLength={limits?.body}
            aria-invalid={!body.trim() || (limits !== null && body.length > limits.body)}
            onChange={(event) => {
              setBody(event.target.value)
              setSaved(false)
            }}
            className={inputClass}
          />
          {limits && <LengthCounter length={body.length} max={limits.body} />}
          <EmailPreview heading="Так увидит покупатель" subject={subject} body={body} recipientsCount={recipientsCount} />
        </div>
      ) : (
        <EmailPreview
          heading="Отправленное письмо"
          subject={campaign.subject}
          body={campaign.body}
          recipientsCount={recipientsCount}
        />
      )}

      {!isDraft && (
        <div ref={progress} tabIndex={-1} className="mt-4 outline-none">
          <p aria-live="polite" className="font-semibold tabular-nums">
            Отправлено {campaign.sent} из{'\u00a0'}{campaign.total}
          </p>
          <progress
            value={campaign.sent}
            max={campaign.total}
            aria-label="Прогресс отправки"
            className="mt-2 h-2 w-full appearance-none overflow-hidden rounded-full bg-surface-muted accent-violet [&::-webkit-progress-bar]:bg-surface-muted [&::-webkit-progress-value]:bg-violet [&::-moz-progress-bar]:bg-violet"
          />
          {campaign.status === 'completed' && <p className="mt-2 text-ink-soft">Все письма отправлены</p>}
        </div>
      )}

      {campaign.status === 'partial' && (
        <div role="alert" className={`${alertClass} mt-4 max-sm:px-3`}>
          <p>{partialTitle(campaign.sent)}: отправлено {campaign.sent} из {campaign.total}.</p>
          <p className="mt-1 text-sm font-normal text-ink-soft">
            {partialMessage(summarize(campaign), deliveryError)}
          </p>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => run(() => resumeCampaign(campaign.id))}
            className={`${primaryButtonClass} mt-3`}
          >
            Повторить отправку ({unsentCount})
          </button>
          <p className="mt-2 text-sm font-normal text-ink-soft">
            Тем, кому письмо уже отправлено, оно повторно не уйдёт.
          </p>
        </div>
      )}

      {error && !isConfirming && <p role="alert" className={`${alertClass} mt-4`}>{error}</p>}

      <div className="mt-6">
        <p className="text-sm text-ink-soft tabular-nums">
          {isDraft
            ? `Исключено ${campaign.excluded}`
            : `Отправлено ${campaign.sent}, ошибок ${campaign.failed}, ожидает ${campaign.pending}, исключено ${campaign.excluded}`}
        </p>
        <button
          ref={recipientsButton}
          type="button"
          disabled={isBusy}
          onClick={() => setIsRecipientsOpen(true)}
          className={`${secondaryButtonClass} mt-3`}
        >
          Получатели ({addressCount})
        </button>
      </div>

      {isDraft && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={isBusy || !isDirty} onClick={save} className={secondaryButtonClass}>
            Сохранить
          </button>
          <button
            ref={sendButton}
            type="button"
            disabled={isBusy || errors.length > 0}
            aria-describedby="send-hint"
            onClick={() => setIsConfirming(true)}
            className={primaryButtonClass}
          >
            Подтвердить и отправить
          </button>
          {errors.length > 0 && <p id="send-hint" className="text-sm text-red">{errors[0]}</p>}
          <p role="status" className="text-sm text-green">{saved && !isDirty && 'Сохранено'}</p>
        </div>
      )}

      {isConfirming && (
        <ConfirmDialog
          eventTitle={campaign.eventTitle}
          eventDate={eventDateLabel(campaign.startsAt)}
          subject={subject}
          body={body}
          recipientsCount={recipientsCount}
          excludedCount={excluded.length}
          isBusy={isBusy}
          error={error}
          onConfirm={send}
          onRefresh={async () => {
            try {
              apply(await getCampaign(campaign.id))
              setError('')
              return true
            } catch (reason) {
              setError((reason as Error).message)
              return false
            }
          }}
          onClose={closeDialog}
        />
      )}

      {isRecipientsOpen && (
        <RecipientsDialog
          campaign={campaign}
          onCampaign={updateRecipients}
          onClose={() => {
            setIsRecipientsOpen(false)
            recipientsButton.current?.focus()
          }}
        />
      )}
    </section>
  )
}

export default CampaignPanel
