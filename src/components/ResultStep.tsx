import type { ConfirmResult } from '../api.mock'
import { EVENT } from '../event'
import type { Order } from '../types'
import OrderSummary from './OrderSummary'
import { cardClass, circleIconClass, primaryButtonClass, secondaryButtonClass } from './ui'

const ResultStep = ({ result, order, onEdit, onReset }: {
  result: ConfirmResult
  order: Order
  onEdit: () => void
  onReset: () => void
}) => (
  <div className="min-w-0 max-w-2xl space-y-6">
    {result.ok ? (
      <>
        <section className={cardClass}>
          <div className={`${circleIconClass} mb-4 bg-green/15 text-green`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 fill-none stroke-current">
              <path d="m5 12 4 4L19 6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 data-step-heading tabIndex={-1} className="scroll-mt-6 text-xl outline-none">
            Заказ оформлен
          </h2>
          <p className="mt-4 text-sm text-ink-muted">Номер заказа</p>
          <p className="mt-1 break-all font-mono text-3xl tracking-wider tabular-nums">{result.orderId}</p>
          <p className="mt-5 break-words font-semibold">{EVENT.title}</p>
          <p className="mt-2 break-words text-sm text-ink-muted">{EVENT.date} · {EVENT.place}</p>
          <div className="mt-6 border-t border-dashed border-line-strong pt-6">
            <OrderSummary participants={order.participants} />
          </div>
          <p className="mt-5 break-words text-sm text-ink-muted">Билеты отправим на {order.email}</p>
        </section>
        <button type="button" onClick={onReset} className={primaryButtonClass}>Оформить ещё</button>
      </>
    ) : result.reason === 'SOLD_OUT' ? (
      <>
        <section className={cardClass}>
          <div aria-hidden="true" className={`${circleIconClass} mb-4 bg-red/15 text-xl font-bold text-red`}>
            !
          </div>
          <h2 data-step-heading tabIndex={-1} className="scroll-mt-6 text-xl outline-none">
            Места закончились
          </h2>
          <p className="mt-2 text-ink-muted">Попробуйте позже</p>
        </section>
        <button type="button" onClick={onReset} className={primaryButtonClass}>Начать заново</button>
      </>
    ) : (
      <>
        <section className={cardClass}>
          <div aria-hidden="true" className={`${circleIconClass} mb-4 bg-red/15 text-xl font-bold text-red`}>
            !
          </div>
          <h2 data-step-heading tabIndex={-1} className="scroll-mt-6 text-xl outline-none">
            Не хватает мест
          </h2>
          <p className="mt-2 text-ink-muted">
            Осталось мест: {result.seats}, а в заказе {order.participants.length} — уберите лишних участников
          </p>
          <div className="mt-6 border-t border-line pt-6">
            <OrderSummary participants={order.participants} />
          </div>
        </section>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onEdit} className={primaryButtonClass}>Изменить состав</button>
          <button type="button" onClick={onReset} className={secondaryButtonClass}>Начать заново</button>
        </div>
      </>
    )}
  </div>
)

export default ResultStep
