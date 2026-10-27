import { useEffect, useRef } from 'react'
import { plural } from '../format'
import { alertClass, primaryButtonClass, secondaryButtonClass } from '../components/ui'

const ConfirmDialog = ({ eventTitle, eventDate, subject, body, recipientsCount, excludedCount, email, isBusy, error, onConfirm, onClose }: {
  eventTitle: string
  eventDate: string
  subject: string
  body: string
  recipientsCount: number
  excludedCount: number
  email?: string
  isBusy: boolean
  error: string
  onConfirm: () => Promise<boolean>
  onClose: (sent: boolean) => void
}) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    dialog.current?.showModal()
    cancel.current?.focus()
  }, [])

  const confirm = async () => {
    if (await onConfirm()) dialog.current?.close('sent')
  }

  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-labelledby="confirm-heading"
      aria-describedby="confirm-summary"
      onCancel={(event) => isBusy && event.preventDefault()}
      onClose={(event) => onClose(event.currentTarget.returnValue === 'sent')}
      className="m-auto w-[calc(100%-1rem)] max-w-lg rounded-3xl border border-line-strong bg-card p-0 text-ink shadow-card backdrop:bg-black/70"
    >
      <div className="p-5 max-sm:px-3 max-sm:py-4">
        <h2 id="confirm-heading" className="text-lg sm:text-xl">{email ? 'Дослать письмо?' : 'Отправить рассылку?'}</h2>
        <div id="confirm-summary" className="mt-3 flex flex-col gap-3">
          <div>
            <p className="break-words font-semibold">{eventTitle}</p>
            <p className="text-sm text-ink-muted">{eventDate}</p>
          </div>
          {email ? (
            <div>
              <p>Отправить 1{'\u00a0'}получателю</p>
              <p className="break-all font-semibold">{email}</p>
            </div>
          ) : (
            <p>
              Отправить {recipientsCount}{'\u00a0'}{plural(recipientsCount, 'получателю', 'получателям', 'получателям')},
              исключено{'\u00a0'}{excludedCount}
            </p>
          )}
          <div className="rounded-control border border-line bg-bg-soft p-3">
            <p className="break-words font-bold">{subject}</p>
            {/* Обрезка по высоте строк, без многоточия: строка не рвётся посреди слова. */}
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-ink-soft">{body}</p>
          </div>
          <p className="text-sm text-ink-muted">Отменить отправку после подтверждения нельзя.</p>
        </div>
        {error && <p role="alert" className={`${alertClass} mt-4`}>{error}</p>}
      </div>
      <div className="sticky bottom-0 flex flex-wrap gap-3 border-t border-line bg-card px-5 py-4 max-sm:px-3">
        <button
          ref={cancel}
          type="button"
          disabled={isBusy}
          onClick={() => dialog.current?.close()}
          className={secondaryButtonClass}
        >
          Отмена
        </button>
        <button type="button" disabled={isBusy} onClick={confirm} className={primaryButtonClass}>
          Отправить {recipientsCount} {plural(recipientsCount, 'письмо', 'письма', 'писем')}
        </button>
      </div>
    </dialog>
  )
}

export default ConfirmDialog
