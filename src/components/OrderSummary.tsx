import { orderTotal, parseAge, ticketPrice, ticketType } from '../rules'
import type { Participant } from '../types'
import { cardClass, chipClass, formatPrice } from './ui'

const OrderSummary = ({ participants }: { participants: Participant[] }) => (
  <section className={cardClass} aria-labelledby="summary-heading">
    <h2 id="summary-heading" className="text-lg">Ваш заказ</h2>
    <ul className="mt-4 divide-y divide-line">
      {participants.map((participant, index) => {
        const age = parseAge(participant.age)

        return (
          <li key={participant.id} className="py-3 first:pt-0">
            <p className="font-medium break-words">{participant.name.trim() || `Участник ${index + 1}`}</p>
            {age === null ? (
              <p className="mt-2 text-sm text-ink-muted">Укажите возраст</p>
            ) : (
              <>
                <p className={`mt-2 ${chipClass}`}>Возраст: {age} · {ticketType(age)}</p>
                <p className="mt-1 text-sm font-medium">{formatPrice(ticketPrice(age))}</p>
              </>
            )}
          </li>
        )
      })}
    </ul>
    <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-4">
      <span className="text-xl font-extrabold">Итого</span>
      <span className="text-2xl font-extrabold text-violet-soft">
        {formatPrice(orderTotal(participants))}
      </span>
    </div>
  </section>
)

export default OrderSummary
