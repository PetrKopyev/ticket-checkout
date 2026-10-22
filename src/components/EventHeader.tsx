import { EVENT } from '../event'
import { ADULT_AGE, CHILD_LIMIT, CHILD_PRICE, FULL_PRICE } from '../rules'
import { cardClass, chipClass, formatPrice } from './ui'

const EventHeader = () => (
  <header className={`${cardClass} mb-6`}>
    <p className="mb-3 text-sm font-medium text-violet-soft">Покупка билетов</p>
    <div className="flex min-w-0 items-start gap-3">
      <img src="/logo.svg" alt="" width={32} height={32} className="shrink-0" />
      <h1 className="min-w-0 break-words text-2xl sm:text-3xl">{EVENT.title}</h1>
    </div>
    <p className="mt-3 break-words text-ink-muted">{EVENT.date} · {EVENT.place}</p>
    <div className="mt-5 flex flex-wrap gap-2">
      <p className={chipClass}>Полный от {CHILD_LIMIT} лет — {formatPrice(FULL_PRICE)}</p>
      <p className={chipClass}>Детский до {CHILD_LIMIT} лет — {formatPrice(CHILD_PRICE)}</p>
    </div>
    <p className="mt-3 text-sm text-ink-muted">
      Дети до {CHILD_LIMIT} лет — только с участником от {ADULT_AGE} лет
    </p>
  </header>
)

export default EventHeader
