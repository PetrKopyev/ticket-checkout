import { useState } from 'react'
import type { Recipient } from './client'
import type { Summary } from './status'
import { secondaryButtonClass } from '../components/ui'

const statusView = {
  pending: { label: 'Ожидает', className: 'text-ink-muted' },
  sent: { label: 'Отправлено', className: 'text-green' },
  failed: { label: 'Ошибка', className: 'text-red' },
}

type Filter = 'all' | 'failed' | 'excluded'

const filterButtonClass = `${secondaryButtonClass} aria-pressed:border-violet-bright aria-pressed:bg-surface-muted aria-pressed:text-ink`

const RecipientsTable = ({ recipients, summary, editable, excluded, onToggle }: {
  recipients: Recipient[]
  summary: Summary
  editable: boolean
  excluded: string[]
  onToggle: (email: string) => void
}) => {
  const [filter, setFilter] = useState<Filter>('all')

  const lists = {
    all: recipients,
    failed: recipients.filter((recipient) => recipient.status === 'failed' && !excluded.includes(recipient.email)),
    excluded: recipients.filter((recipient) => excluded.includes(recipient.email)),
  }
  if (lists[filter].length === 0 && filter !== 'all') setFilter('all')
  const shown = lists[filter]

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: `Все (${lists.all.length})` },
    { value: 'failed', label: `Ошибки (${lists.failed.length})` },
    { value: 'excluded', label: `Исключённые (${lists.excluded.length})` },
  ]

  return (
    <div className="mt-6">
      <h3 id="recipients-heading" className="text-base">Получатели</h3>
      {!editable && (
        <p className="mt-1 text-sm text-ink-soft tabular-nums">
          Отправлено {summary.sent}, ошибок {summary.failed}, ожидает {summary.pending}, исключено {summary.excluded}
        </p>
      )}
      <div role="group" aria-label="Показать получателей" className="mt-3 flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            disabled={lists[item.value].length === 0}
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
            <th scope="col" className="w-2/5 py-2 font-medium max-sm:w-[6em]">{editable ? 'Исключить' : 'Статус'}</th>
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
                    <label className="flex min-h-11 min-w-11 cursor-pointer flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isExcluded}
                        onChange={() => onToggle(recipient.email)}
                        aria-label={`Исключить ${recipient.email}`}
                        className="size-5 accent-violet"
                      />
                      <span className="max-sm:sr-only">Исключить</span>
                    </label>
                  )}
                  {!editable && isExcluded && <span className="text-ink-muted">Исключён</span>}
                  {!editable && !isExcluded && (
                    <>
                      <span className={status.className}>{status.label}</span>
                      {recipient.status === 'failed' && recipient.error && (
                        <p className="mt-1 text-xs text-ink-muted">{recipient.error}</p>
                      )}
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
