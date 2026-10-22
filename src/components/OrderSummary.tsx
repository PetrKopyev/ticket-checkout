import { orderTotal, parseAge, ticketPrice } from '../rules'
import type { Participant } from '../types'
import { formatPrice, ticketType } from './ui'

const OrderSummary = ({ participants }: { participants: Participant[] }) => (
  <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="summary-heading">
    <h2 id="summary-heading" className="text-lg font-semibold">Ваш заказ</h2>
    <ul className="mt-4 divide-y divide-slate-100">
      {participants.map((participant, index) => {
        const age = parseAge(participant.age)

        return (
          <li key={participant.id} className="py-3 first:pt-0">
            <p className="font-medium break-words">{participant.name.trim() || `Участник ${index + 1}`}</p>
            <p className="mt-1 text-sm text-slate-500">
              {age === null ? '—' : `Возраст: ${age} · ${ticketType(age)}`}
            </p>
            <p className="mt-1 text-sm font-medium">{age === null ? '—' : formatPrice(ticketPrice(age))}</p>
          </li>
        )
      })}
    </ul>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 font-semibold">
      <span>Итого</span>
      <span className="text-xl">{formatPrice(orderTotal(participants))}</span>
    </div>
  </section>
)

export default OrderSummary
