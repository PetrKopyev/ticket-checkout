import { useCallback, useEffect, useRef, useState } from 'react'
import { getRecipients, includeAll, includeRecipient, updateCampaign } from './client'
import type { Campaign, RecipientsTab } from './client'
import ConfirmDialog from './ConfirmDialog'
import { eventDateLabel } from './status'
import {
  emptyRecipientsList,
  mergeRecipientsPage,
  recipientTabs,
  showIncludeAll,
  showIncludeRecipient,
  toggleExcluded,
} from './recipientsList'
import { alertClass, inputClass, secondaryButtonClass } from '../components/ui'

const statusView = {
  pending: { label: 'Ожидает', className: 'text-ink-muted' },
  sent: { label: 'Отправлено', className: 'text-green' },
  failed: { label: 'Ошибка', className: 'text-red' },
}

const emptyMessage = (tab: RecipientsTab, q: string) => {
  if (q) return 'Никого не найдено'
  if (tab === 'excluded') return 'Нет исключённых'
  if (tab === 'sent') return 'Нет отправленных писем'
  if (tab === 'pending') return 'Нет ожидающих получателей'
  if (tab === 'failed') return 'Нет ошибок'
  return 'Нет получателей'
}

const RecipientsDialog = ({ campaign, onCampaign, onClose }: {
  campaign: Campaign
  onCampaign: (campaign: Campaign) => void
  onClose: () => void
}) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const confirmTrigger = useRef<HTMLButtonElement | null>(null)
  const requestId = useRef(0)
  const loadingRequest = useRef<number | null>(null)
  const busy = useRef(false)
  const [tab, setTab] = useState<RecipientsTab>('all')
  const [searchText, setSearchText] = useState('')
  const [q, setQuery] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [list, setList] = useState(() => emptyRecipientsList('all', '', 0))
  const latestList = useRef(list)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<{ email?: string; count: number } | null>(null)

  useEffect(() => {
    const opener = document.activeElement
    const element = dialog.current
    element?.showModal()
    search.current?.focus()
    return () => {
      element?.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchText.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchText])

  const loadPage = useCallback(async () => {
    const current = latestList.current
    const id = current.requestId
    if (loadingRequest.current === id) return
    loadingRequest.current = id
    setIsLoading(true)
    setLoadError('')
    try {
      const page = await getRecipients(campaign.id, { tab: current.tab, q: current.q, offset: current.offset })
      if (requestId.current !== id) return
      const next = mergeRecipientsPage(latestList.current, page, id, current.offset)
      latestList.current = next
      setList(next)
    } catch (reason) {
      if (requestId.current === id) setLoadError((reason as Error).message)
    } finally {
      if (requestId.current === id) {
        loadingRequest.current = null
        setIsLoading(false)
      }
    }
  }, [campaign.id])

  useEffect(() => {
    const next = emptyRecipientsList(tab, q, ++requestId.current)
    latestList.current = next
    setList(next)
    if (scroll.current) scroll.current.scrollTop = 0
    void loadPage()
    return () => { requestId.current += 1 }
  }, [tab, q, refreshKey, loadPage])

  useEffect(() => {
    if (isLoading || loadError || list.offset >= list.total) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadPage()
    }, { root: scroll.current, rootMargin: '100px' })
    if (sentinel.current) observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [isLoading, loadError, list.offset, list.total, loadPage])

  const apply = (next: Campaign) => {
    requestId.current += 1
    onCampaign(next)
    setRefreshKey((key) => key + 1)
  }

  const toggle = async (email: string) => {
    if (busy.current) return
    busy.current = true
    setIsBusy(true)
    setActionError('')
    try {
      apply(await updateCampaign(campaign.id, { excluded: toggleExcluded(campaign.excludedEmails, email) }))
    } catch (reason) {
      setActionError((reason as Error).message)
    } finally {
      busy.current = false
      setIsBusy(false)
    }
  }

  const include = async () => {
    if (busy.current || !confirmation) return false
    busy.current = true
    setIsBusy(true)
    setActionError('')
    try {
      apply(await (confirmation.email
        ? includeRecipient(campaign.id, confirmation.email)
        : includeAll(campaign.id)))
      return true
    } catch (reason) {
      setActionError((reason as Error).message)
      return false
    } finally {
      busy.current = false
      setIsBusy(false)
    }
  }

  const counts = list.counts ?? {
    all: campaign.total + campaign.excluded,
    sent: campaign.sent,
    pending: campaign.pending,
    failed: campaign.failed,
    excluded: campaign.excluded,
  }
  const isDraft = campaign.status === 'draft'

  return (
    <dialog
      ref={dialog}
      aria-labelledby="recipients-heading"
      onCancel={(event) => event.target === event.currentTarget && isBusy && event.preventDefault()}
      onClose={(event) => { if (event.target === event.currentTarget) onClose() }}
      className="m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl overflow-hidden rounded-3xl border border-line-strong bg-card p-0 text-ink shadow-card backdrop:bg-black/70"
    >
      <div ref={scroll} className="max-h-[calc(100dvh-1rem-2px)] min-w-0 overflow-y-auto overscroll-contain">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-card p-4 max-sm:px-3">
          <h2 id="recipients-heading" className="text-lg sm:text-xl">Получатели</h2>
          <button type="button" disabled={isBusy} onClick={() => dialog.current?.close()} className={secondaryButtonClass}>
            Закрыть
          </button>
        </header>
        <div className="min-w-0 p-4 max-sm:px-3">
          <label htmlFor="recipients-search" className="text-sm font-medium">Поиск по почте</label>
          <input
            ref={search}
            id="recipients-search"
            type="search"
            value={searchText}
            maxLength={320}
            onChange={(event) => setSearchText(event.target.value)}
            className={`${inputClass} min-w-0`}
          />
          <div role="group" aria-label="Показать получателей" className="mt-3 flex flex-wrap gap-2">
            {recipientTabs(campaign.status).map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={tab === item.value}
                disabled={counts[item.value] === 0 && tab !== item.value}
                onClick={() => setTab(item.value)}
                className={`${secondaryButtonClass} aria-pressed:border-violet-bright aria-pressed:bg-surface-muted aria-pressed:text-ink disabled:text-ink-muted`}
              >
                {item.label} ({counts[item.value]})
              </button>
            ))}
          </div>
          {showIncludeAll(campaign.status, tab, campaign.excluded) && (
            <button
              type="button"
              disabled={isBusy}
              onClick={(event) => {
                confirmTrigger.current = event.currentTarget
                setActionError('')
                setConfirmation({ count: campaign.excluded })
              }}
              className={`${secondaryButtonClass} mt-3`}
            >
              Дослать всем ({campaign.excluded})
            </button>
          )}
          {actionError && !confirmation && <p role="alert" className={`${alertClass} mt-3`}>{actionError}</p>}
          <ul aria-label="Список получателей" aria-busy={isLoading} className="mt-4 min-w-0 divide-y divide-line">
            {list.items.map((recipient) => {
              const view = statusView[recipient.status]
              return (
                <li key={recipient.email} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                    <p className={`break-all ${recipient.excluded ? 'text-ink-muted line-through' : ''}`}>{recipient.email}</p>
                    <p className={`mt-1 text-sm ${recipient.excluded ? 'text-ink-muted' : view.className}`}>
                      {recipient.excluded ? 'Исключён' : view.label}
                    </p>
                    {!recipient.excluded && recipient.status === 'failed' && recipient.error && (
                      <p className="mt-1 text-sm text-red">{recipient.error}</p>
                    )}
                    {recipient.excluded && campaign.status === 'sending' && (
                      <p className="mt-1 text-sm text-ink-muted">Дождитесь завершения</p>
                    )}
                  </div>
                  {isDraft && (
                    <label className="flex min-h-11 min-w-11 cursor-pointer flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        checked={recipient.excluded}
                        disabled={isBusy}
                        onChange={() => toggle(recipient.email)}
                        aria-label={`Исключить ${recipient.email}`}
                        className="size-5 accent-violet"
                      />
                      <span className="text-sm">Исключить</span>
                    </label>
                  )}
                  {showIncludeRecipient(campaign.status, recipient.excluded) && (
                    <button
                      type="button"
                      disabled={isBusy}
                      aria-label={`Дослать письмо на ${recipient.email}`}
                      onClick={(event) => {
                        confirmTrigger.current = event.currentTarget
                        setActionError('')
                        setConfirmation({ email: recipient.email, count: 1 })
                      }}
                      className={secondaryButtonClass}
                    >
                      Дослать письмо
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {isLoading && <p role="status" className="mt-3 text-ink-muted">Загрузка…</p>}
          {loadError && (
            <div className="mt-3">
              <p role="alert" className={alertClass}>{loadError}</p>
              <button type="button" onClick={() => void loadPage()} className={`${secondaryButtonClass} mt-2`}>Повторить</button>
            </div>
          )}
          {!isLoading && !loadError && list.items.length === 0 && (
            <p className="mt-3 text-ink-muted">{emptyMessage(tab, q)}</p>
          )}
          <div ref={sentinel} aria-hidden="true" className="h-px" />
          {!isLoading && !loadError && (
            <p role="status" className="mt-3 text-sm text-ink-muted tabular-nums">Показано {list.items.length} из {list.total}</p>
          )}
        </div>
      </div>
      {confirmation && (
        <ConfirmDialog
          eventTitle={campaign.eventTitle}
          eventDate={eventDateLabel(campaign.startsAt)}
          subject={campaign.subject}
          body={campaign.body}
          recipientsCount={confirmation.count}
          excludedCount={0}
          email={confirmation.email}
          isBusy={isBusy}
          error={actionError}
          onConfirm={include}
          onClose={() => {
            setConfirmation(null)
            setActionError('')
            if (confirmTrigger.current?.isConnected && !confirmTrigger.current.disabled) confirmTrigger.current.focus()
            else search.current?.focus()
          }}
        />
      )}
    </dialog>
  )
}

export default RecipientsDialog
