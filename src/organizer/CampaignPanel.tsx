import { useEffect, useRef, useState } from 'react'
import { confirmCampaign, getCampaign, resumeCampaign, updateCampaign } from './client'
import type { Campaign, Limits } from './client'
import ConfirmDialog from './ConfirmDialog'
import EmailPreview from './EmailPreview'
import RecipientsTable from './RecipientsTable'
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

const excludedOf = (campaign: Campaign) =>
  campaign.recipients.filter((recipient) => recipient.excluded).map((recipient) => recipient.email)

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
  const [isBusy, setIsBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [pollAttempt, setPollAttempt] = useState(0)
  const [isSent, setIsSent] = useState(false)
  const sendButton = useRef<HTMLButtonElement>(null)
  const progress = useRef<HTMLDivElement>(null)

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
  useEffect(() => {
    if (status) onProgress()
  }, [sent, status, onProgress])

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
    || [...excluded].sort().join() !== excludedOf(campaign).sort().join()
  const addressCount = campaign.recipients.length
  const recipientsCount = addressCount - excluded.length
  const errors = validate({ subject, body, recipientsCount }, limits)
  const unsentCount = campaign.total - campaign.sent

  const run = async (action: () => Promise<Campaign>) => {
    setIsBusy(true)
    setError('')
    try {
      apply(await action())
      return true
    } catch (reason) {
      setError((reason as Error).message)
      return false
    } finally {
      setIsBusy(false)
    }
  }

  const save = async () => {
    if (await run(() => updateCampaign(campaign.id, { subject, body, excluded }))) setSaved(true)
  }

  const send = () => run(async () => {
    if (isDirty) await updateCampaign(campaign.id, { subject, body, excluded })
    return confirmCampaign(campaign.id)
  })

  const closeDialog = (isDone: boolean) => {
    setIsConfirming(false)
    if (isDone) setIsSent(true)
    else sendButton.current?.focus()
  }

  const toggle = (email: string) => {
    setSaved(false)
    setExcluded((previous) => previous.includes(email)
      ? previous.filter((item) => item !== email)
      : [...previous, email])
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
      <p className="mt-1 text-sm text-ink-muted">Мероприятие: {eventDateLabel(campaign.startsAt)}</p>
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
          <EmailPreview heading="Так выглядит письмо" subject={subject} body={body} />
        </div>
      ) : (
        <EmailPreview heading="Письмо" subject={campaign.subject} body={campaign.body} />
      )}

      {!isDraft && (
        <div ref={progress} tabIndex={-1} className="mt-4 outline-none">
          <p aria-live="polite" className="font-semibold tabular-nums">
            Отправлено {campaign.sent} из {campaign.total}
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
            {partialMessage(summarize(campaign), firstError(campaign))}
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

      <RecipientsTable
        key={campaign.id}
        recipients={campaign.recipients}
        summary={summarize(campaign)}
        editable={isDraft}
        excluded={excluded}
        onToggle={toggle}
      />

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
          onClose={closeDialog}
        />
      )}
    </section>
  )
}

export default CampaignPanel
