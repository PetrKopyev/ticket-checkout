import { QRCodeSVG } from 'qrcode.react'
import type { ConfirmResult } from '../api.mock'
import { EVENT } from '../event'
import type { Order } from '../types'
import CheckIcon from './CheckIcon'
import OrderSummary from './OrderSummary'
import {
  cardClass,
  circleIconClass,
  primaryButtonClass,
  secondaryButtonClass,
  stepHeadingClass,
} from './ui'

const ErrorIcon = () => (
  <div aria-hidden="true" className={`${circleIconClass} mb-4 bg-red/15 text-xl font-bold text-red`}>
    !
  </div>
)

const ResultStep = ({ result, order, onEdit, onReset }: {
  result: ConfirmResult
  order: Order
  onEdit: () => void
  onReset: () => void
}) => (
  <div className="mx-auto min-w-0 max-w-2xl space-y-6">
    {result.ok ? (
      <>
        <section data-print-ticket className={cardClass}>
          <div className={`${circleIconClass} mb-4 bg-green/15 text-green`}>
            <CheckIcon className="size-6" />
          </div>
          <h2 data-step-heading tabIndex={-1} className={stepHeadingClass}>
            Заказ оформлен
          </h2>
          <div className="mt-4 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-ink-muted">Номер заказа</p>
              <p className="mt-1 break-all font-mono text-3xl tracking-wider">{result.orderId}</p>
            </div>
            <div
              role="img"
              aria-label={`QR-код заказа ${result.orderId}`}
              className="w-fit shrink-0 rounded-2xl bg-white p-3 text-black"
            >
              <QRCodeSVG value={result.orderId} size={120} bgColor="#ffffff" fgColor="#000000" />
            </div>
          </div>
          <p className="mt-5 break-words font-semibold">{EVENT.title}</p>
          <p className="mt-2 break-words text-sm text-ink-muted">{EVENT.date} · {EVENT.place}</p>
          <div className="mt-6 border-t border-dashed border-line-strong pt-6">
            <OrderSummary participants={order.participants} headingLevel={3} />
          </div>
          <p className="mt-5 break-words text-sm text-ink-muted">Билеты отправим на {order.email}</p>
        </section>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onReset} className={primaryButtonClass}>Оформить ещё</button>
          <button
            type="button"
            onClick={() => window.print()}
            title="Откроется окно печати, где можно сохранить билеты как PDF"
            className={secondaryButtonClass}
          >
            Скачать билеты
            <span className="sr-only"> (откроется окно печати)</span>
          </button>
        </div>
      </>
    ) : result.reason === 'SOLD_OUT' ? (
      <>
        <section className={cardClass}>
          <ErrorIcon />
          <h2 data-step-heading tabIndex={-1} className={stepHeadingClass}>
            Места закончились
          </h2>
          <p className="mt-2 text-ink-muted">Попробуйте позже</p>
        </section>
        <button type="button" onClick={onReset} className={primaryButtonClass}>Начать заново</button>
      </>
    ) : (
      <>
        <section className={cardClass}>
          <ErrorIcon />
          <h2 data-step-heading tabIndex={-1} className={stepHeadingClass}>
            Не хватает мест
          </h2>
          <p className="mt-2 text-ink-muted">
            Осталось мест: {result.seats}, а в заказе {order.participants.length} — уберите лишних участников
          </p>
          <div className="mt-6 border-t border-line pt-6">
            <OrderSummary participants={order.participants} headingLevel={3} />
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
