import type { Recipient } from './client'

const statusView = {
  pending: { label: 'Ожидает', className: 'text-ink-muted' },
  sent: { label: 'Отправлено', className: 'text-green' },
  failed: { label: 'Ошибка', className: 'text-red' },
}

const RecipientsTable = ({ recipients, editable, excluded, onToggle }: {
  recipients: Recipient[]
  editable: boolean
  excluded: string[]
  onToggle: (email: string) => void
}) => (
  <table className="mt-4 w-full table-fixed text-left text-sm">
    <caption className="mb-2 text-left font-bold">Получатели ({recipients.length})</caption>
    <thead className="text-ink-muted">
      <tr>
        <th scope="col" className="py-2 pr-3 font-medium">Email</th>
        <th scope="col" className="w-32 py-2 font-medium">{editable ? 'Исключить' : 'Статус'}</th>
      </tr>
    </thead>
    <tbody>
      {recipients.map((recipient) => {
        const isExcluded = excluded.includes(recipient.email)
        const status = statusView[recipient.status]
        return (
          <tr key={recipient.email} className="border-t border-line align-top">
            <td className={`break-all py-2 pr-3 ${isExcluded ? 'text-ink-muted line-through' : ''}`}>
              {recipient.email}
            </td>
            <td className="py-2">
              {editable && (
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isExcluded}
                    onChange={() => onToggle(recipient.email)}
                    aria-label={`Исключить ${recipient.email}`}
                    className="size-5 accent-violet"
                  />
                  <span aria-hidden="true">Исключить</span>
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
)

export default RecipientsTable
