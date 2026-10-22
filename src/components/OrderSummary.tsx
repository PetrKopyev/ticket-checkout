import { useId } from 'react'
import { formatAge } from '../format'
import { normalizeName, orderTotal, parseAge, ticketPrice, ticketType, validAges } from '../rules'
import type { Participant } from '../types'
import { chipClass, formatPrice } from './ui'

const nameClass = 'break-words font-medium'
const priceClass = 'shrink-0 whitespace-nowrap text-right font-semibold tabular-nums'

const OrderRow = ({ participant, index, compact }: {
  participant: Participant
  index: number
  compact: boolean
}) => {
  const age = parseAge(participant.age)
  const name = normalizeName(participant.name) || `Участник ${index + 1}`

  if (compact) {
    const details = age === null ? 'Укажите возраст' : `${formatAge(age)} · ${ticketType(age)}`
    const price = age === null ? '' : formatPrice(ticketPrice(age))

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

  if (age === null) return null

  return (
    <li className={[
      'flex items-start justify-between gap-3 py-3 first:pt-0',
      'sm:grid sm:grid-cols-[minmax(0,1fr)_5rem_6rem_6rem] sm:items-center',
    ].join(' ')}>
      <div className="min-w-0">
        <p className={nameClass}>{name}</p>
        <p className="mt-1 text-sm text-ink-muted sm:hidden">
          {formatAge(age)} · {ticketType(age)}
        </p>
      </div>
      <p className="hidden text-sm text-ink-muted sm:block">{formatAge(age)}</p>
      <p className={`hidden sm:block ${chipClass}`}>{ticketType(age)}</p>
      <p className={priceClass}>{formatPrice(ticketPrice(age))}</p>
    </li>
  )
}

const OrderSummary = ({ participants, compact = false, headingLevel = 2 }: {
  participants: Participant[]
  compact?: boolean
  headingLevel?: 2 | 3
}) => {
  const headingId = useId()
  const Heading = headingLevel === 3 ? 'h3' : 'h2'

  return (
    <section aria-labelledby={headingId}>
      <Heading id={headingId} className="text-lg">Ваш заказ</Heading>
      <ul className="mt-4 divide-y divide-line">
        {participants.map((participant, index) => (
          <OrderRow key={participant.id} participant={participant} index={index} compact={compact} />
        ))}
      </ul>
      <p className="mt-3 text-sm text-ink-muted">Билетов: {validAges(participants).length}</p>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-4">
        <span className="text-xl font-extrabold">Итого</span>
        <span className="text-2xl font-extrabold tabular-nums text-violet-soft">
          {formatPrice(orderTotal(participants))}
        </span>
      </div>
    </section>
  )
}

export default OrderSummary
