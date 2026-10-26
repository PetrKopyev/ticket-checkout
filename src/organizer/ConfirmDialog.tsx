import { useEffect, useRef } from 'react'
import { plural } from '../format'
import { primaryButtonClass, secondaryButtonClass } from '../components/ui'

const ConfirmDialog = ({ eventTitle, date, subject, body, recipientsCount, excludedCount, isBusy, onConfirm, onCancel }: {
  eventTitle: string
  date: string
  subject: string
  body: string
  recipientsCount: number
  excludedCount: number
  isBusy: boolean
  onConfirm: () => void
  onCancel: () => void
}) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    dialog.current?.showModal()
    cancel.current?.focus()
  }, [])

  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-labelledby="confirm-heading"
      aria-describedby="confirm-summary"
      onClose={onCancel}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-3xl border border-line-strong bg-card p-5 text-ink shadow-card backdrop:bg-black/70"
    >
      <h2 id="confirm-heading" className="text-xl">Отправить рассылку?</h2>
      <div id="confirm-summary" className="mt-3 flex flex-col gap-3">
        <div>
          <p className="break-words font-semibold">{eventTitle}</p>
          <p className="text-sm text-ink-muted">{date}</p>
        </div>
        <p>
          Отправить {recipientsCount} {plural(recipientsCount, 'получателю', 'получателям', 'получателям')},
          исключено {excludedCount}
        </p>
        <div className="rounded-control border border-line bg-bg-soft p-3">
          <p className="break-words font-bold">{subject}</p>
          <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-ink-soft">{body}</p>
        </div>
        <p className="text-sm text-ink-muted">Отменить отправку после подтверждения нельзя.</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button ref={cancel} type="button" disabled={isBusy} onClick={onCancel} className={secondaryButtonClass}>
          Отмена
        </button>
        <button type="button" disabled={isBusy} onClick={onConfirm} className={primaryButtonClass}>
          Отправить {recipientsCount} {plural(recipientsCount, 'письмо', 'письма', 'писем')}
        </button>
      </div>
    </dialog>
  )
}

export default ConfirmDialog
