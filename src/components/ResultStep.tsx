import type { ConfirmResult } from '../api.mock'
import type { Order } from '../types'
import OrderSummary from './OrderSummary'
import { primaryButtonClass, secondaryButtonClass } from './ui'

const ResultStep = ({ result, order, onEdit, onReset }: {
  result: ConfirmResult
  order: Order
  onEdit: () => void
  onReset: () => void
}) => (
  <div className="space-y-6">
    {result.ok ? (
      <>
        <section role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
          <h2 tabIndex={-1} className="text-xl font-semibold outline-none">Заказ оформлен</h2>
          <p className="mt-2">Номер заказа: <span className="font-semibold">{result.orderId}</span></p>
          <p className="mt-3 break-words">Билеты отправим на {order.email}</p>
        </section>
        <OrderSummary participants={order.participants} />
        <button type="button" onClick={onReset} className={primaryButtonClass}>Оформить ещё</button>
      </>
    ) : (
      <>
        <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
          <h2 tabIndex={-1} className="text-xl font-semibold outline-none">
            {result.reason === 'SOLD_OUT' ? 'Места закончились' : `Осталось мест: ${result.seats}, а в заказе ${order.participants.length} — уберите лишних участников`}
          </h2>
        </section>
        {result.reason === 'NOT_ENOUGH' && <OrderSummary participants={order.participants} />}
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onEdit} className={primaryButtonClass}>Изменить состав</button>
          <button type="button" onClick={onReset} className={secondaryButtonClass}>Начать заново</button>
        </div>
      </>
    )}
  </div>
)

export default ResultStep
