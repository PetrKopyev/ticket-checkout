import { useState } from 'react'
import type { Recipient } from './client'
import { secondaryButtonClass } from '../components/ui'

const statusView = {
  pending: { label: 'Ожидает', className: 'text-ink-muted' },
  sent: { label: 'Отправлено', className: 'text-green' },
  failed: { label: 'Ошибка', className: 'text-red' },
}

type Filter = 'all' | 'failed' | 'excluded'

const filterButtonClass = `${secondaryButtonClass} aria-pressed:border-violet-bright aria-pressed:bg-surface-muted aria-pressed:text-ink`

const RecipientsTable = ({ recipients, editable, excluded, onToggle }: {
  recipients: Recipient[]
  editable: boolean
  excluded: string[]
  onToggle: (email: string) => void
}) => {
  const [filter, setFilter] = useState<Filter>('all')

  const active = recipients.filter((recipient) => !excluded.includes(recipient.email))
  const countOf = (status: Recipient['status']) => active.filter((recipient) => recipient.status === status).length
  const failed = active.filter((recipient) => recipient.status === 'failed')
  const excludedRecipients = recipients.filter((recipient) => excluded.includes(recipient.email))
  const shown = { all: recipients, failed, excluded: excludedRecipients }[filter]

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: `Все (${recipients.length})` },
    { value: 'failed', label: `Ошибки (${failed.length})` },
    { value: 'excluded', label: `Исключённые (${excludedRecipients.length})` },
  ]

  return (
    <div className="mt-6">
      <h3 id="recipients-heading" className="text-base">Получатели</h3>
      <p className="mt-1 text-sm text-ink-soft tabular-nums">
        Отправлено {countOf('sent')}, ошибок {failed.length}, ожидает {countOf('pending')},
        исключено {excludedRecipients.length}
      </p>
      <div role="group" aria-label="Показать получателей" className="mt-3 flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
            className={filterButtonClass}
          >
            {item.label}
          </button>
        ))}
      </div>
      <table aria-labelledby="recipients-heading" className="mt-3 w-full table-fixed text-left text-sm">
        <thead className="text-ink-muted">
          <tr>
            <th scope="col" className="py-2 pr-3 font-medium">Email</th>
            <th scope="col" className="w-32 py-2 font-medium">{editable ? 'Исключить' : 'Статус'}</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr className="border-t border-line">
              <td colSpan={2} className="py-3 text-ink-muted">Таких получателей нет</td>
            </tr>
          )}
          {shown.map((recipient) => {
            const isExcluded = excluded.includes(recipient.email)
            const status = statusView[recipient.status]
            return (
              <tr key={recipient.email} className="border-t border-line">
                <td className={`break-all py-2 pr-3 align-middle ${isExcluded ? 'text-ink-muted line-through' : ''}`}>
                  {recipient.email}
                </td>
                <td className="py-2 align-middle">
                  {editable && (
                    <label className="flex min-h-11 min-w-11 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isExcluded}
                        onChange={() => onToggle(recipient.email)}
                        aria-label={`Исключить ${recipient.email}`}
                        className="size-5 accent-violet"
                      />
                      <span>Исключить</span>
                    </label>
                  )}
                  {!editable && isExcluded && <span className="text-ink-muted">Исключён</span>}
                  {!editable && !isExcluded && (
                    <>
                      <span className={status.className}>{status.label}</span>
                      {recipient.error && <p className="mt-1 break-words text-xs text-ink-muted">{recipient.error}</p>}
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default RecipientsTable
