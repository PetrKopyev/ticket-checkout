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
            <p className={`mt-2 ${chipClass}`}>
              {age === null ? '—' : `Возраст: ${age} · ${ticketType(age)}`}
            </p>
            <p className="mt-1 text-sm font-medium">{age === null ? '—' : formatPrice(ticketPrice(age))}</p>
          </li>
        )
      })}
    </ul>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xl font-extrabold">
      <span>Итого</span>
      <span className="text-2xl text-violet-soft">{formatPrice(orderTotal(participants))}</span>
    </div>
  </section>
)

export default OrderSummary
