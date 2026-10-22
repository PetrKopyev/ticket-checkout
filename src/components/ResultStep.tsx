import type { ConfirmResult } from '../api.mock'
import type { Order } from '../types'
import OrderSummary from './OrderSummary'
import { cardClass, primaryButtonClass, secondaryButtonClass } from './ui'

const ResultStep = ({ result, order, onEdit, onReset }: {
  result: ConfirmResult
  order: Order
  onEdit: () => void
  onReset: () => void
}) => (
  <div className="space-y-6">
    {result.ok ? (
      <>
        <section role="status" className={`${cardClass} border-green/40! bg-green/10! text-green`}>
          <h2 tabIndex={-1} className="text-xl outline-none">Заказ оформлен</h2>
          <p className="mt-2">Номер заказа: <span className="font-semibold">{result.orderId}</span></p>
          <p className="mt-3 break-words">Билеты отправим на {order.email}</p>
        </section>
        <OrderSummary participants={order.participants} />
        <button type="button" onClick={onReset} className={primaryButtonClass}>Оформить ещё</button>
      </>
    ) : (
      <>
        <section role="alert" className={`${cardClass} border-red/40! bg-red/10! text-red`}>
          <h2 tabIndex={-1} className="text-xl outline-none">
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
