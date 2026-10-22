import type { ConfirmResult } from '../api.mock'
import type { Order } from '../types'
import OrderSummary from './OrderSummary'
import { primaryButtonClass, secondaryButtonClass } from './ui'

const noticeClass = 'min-w-0 rounded-3xl border p-5 shadow-card'

const ResultStep = ({ result, order, onEdit, onReset }: {
  result: ConfirmResult
  order: Order
  onEdit: () => void
  onReset: () => void
}) => (
  <div className="space-y-6">
    {result.ok ? (
      <>
        <section className={`${noticeClass} border-green/40 bg-green/10 text-green`}>
          <h2 data-step-heading tabIndex={-1} className="scroll-mt-6 text-xl outline-none">
            Заказ оформлен
          </h2>
          <p className="mt-2">Номер заказа: <span className="font-semibold">{result.orderId}</span></p>
          <p className="mt-3 break-words">Билеты отправим на {order.email}</p>
        </section>
        <OrderSummary participants={order.participants} />
        <button type="button" onClick={onReset} className={primaryButtonClass}>Оформить ещё</button>
      </>
    ) : result.reason === 'SOLD_OUT' ? (
      <>
        <section className={`${noticeClass} border-red/40 bg-red/10 text-red`}>
          <h2 data-step-heading tabIndex={-1} className="scroll-mt-6 text-xl outline-none">
            Места закончились
          </h2>
          <p className="mt-2">Попробуйте позже</p>
        </section>
        <button type="button" onClick={onReset} className={primaryButtonClass}>Начать заново</button>
      </>
    ) : (
      <>
        <section className={`${noticeClass} border-red/40 bg-red/10 text-red`}>
          <h2 data-step-heading tabIndex={-1} className="scroll-mt-6 text-xl outline-none">
            Не хватает мест
          </h2>
          <p className="mt-2">
            Осталось мест: {result.seats}, а в заказе {order.participants.length} — уберите лишних участников
          </p>
        </section>
        <OrderSummary participants={order.participants} />
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onEdit} className={primaryButtonClass}>Изменить состав</button>
          <button type="button" onClick={onReset} className={secondaryButtonClass}>Начать заново</button>
        </div>
      </>
    )}
  </div>
)

export default ResultStep
