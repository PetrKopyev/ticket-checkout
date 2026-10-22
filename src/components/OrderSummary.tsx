import { orderTotal, parseAge, ticketPrice, ticketType } from '../rules'
import type { Participant } from '../types'
import { chipClass, formatAge, formatPrice } from './ui'

const nameClass = 'break-words font-medium first-letter:uppercase'
const priceClass = 'shrink-0 whitespace-nowrap text-right font-semibold tabular-nums'

const OrderRow = ({ participant, index, compact }: {
  participant: Participant
  index: number
  compact: boolean
}) => {
  const age = parseAge(participant.age)
  const name = participant.name.trim() || `Участник ${index + 1}`
  const details = age === null ? 'Укажите возраст' : `${formatAge(age)} · ${ticketType(age)}`
  const price = age === null ? '' : formatPrice(ticketPrice(age))

  if (compact) {
    return (
      <li className="flex items-start justify-between gap-3 py-3 first:pt-0">
        <div className="min-w-0">
          <p className={nameClass}>{name}</p>
          <p className="mt-1 text-sm text-ink-muted">{details}</p>
        </div>
        <p className={priceClass}>{price}</p>
      </li>
    )
  }

  return (
    <li className={[
      'flex items-start justify-between gap-3 py-3 first:pt-0',
      'sm:grid sm:grid-cols-[minmax(0,1fr)_5rem_6rem_6rem] sm:items-center',
    ].join(' ')}>
      <div className="min-w-0">
        <p className={nameClass}>{name}</p>
        <p className="mt-1 text-sm text-ink-muted sm:hidden">{details}</p>
      </div>
      {age === null ? (
        <p className="hidden text-sm text-ink-muted sm:col-span-2 sm:block">Укажите возраст</p>
      ) : (
        <>
          <p className="hidden text-sm text-ink-muted sm:block">{formatAge(age)}</p>
          <p className={`hidden sm:block ${chipClass}`}>{ticketType(age)}</p>
        </>
      )}
      <p className={priceClass}>{price}</p>
    </li>
  )
}

const OrderSummary = ({ participants, compact = false }: {
  participants: Participant[]
  compact?: boolean
}) => (
  <section aria-labelledby="summary-heading">
    <h2 id="summary-heading" className="text-lg">Ваш заказ</h2>
    <ul className="mt-4 divide-y divide-line">
      {participants.map((participant, index) => (
        <OrderRow key={participant.id} participant={participant} index={index} compact={compact} />
      ))}
    </ul>
    <p className="mt-3 text-sm text-ink-muted">Билетов: {participants.length}</p>
    <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-4">
      <span className="text-xl font-extrabold">Итого</span>
      <span className="text-2xl font-extrabold tabular-nums text-violet-soft">
        {formatPrice(orderTotal(participants))}
      </span>
    </div>
  </section>
)

export default OrderSummary
