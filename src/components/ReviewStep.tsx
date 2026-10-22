import { useState } from 'react'
import { confirmOrder, demoReset, demoTakeSeats } from '../api.mock'
import type { ConfirmResult } from '../api.mock'
import { validateEmail } from '../rules'
import type { Order } from '../types'
import OrderSummary from './OrderSummary'
import { inputClass, primaryButtonClass, secondaryButtonClass } from './ui'

const ReviewStep = ({ order, seats, onEmailChange, onBack, onResult }: {
  order: Order
  seats: number
  onEmailChange: (email: string) => void
  onBack: () => void
  onResult: (result: ConfirmResult) => void
}) => {
  const [touched, setTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const emailError = touched || submitted ? validateEmail(order.email) : undefined

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Проверьте заказ</h2>
      <div className="grid min-w-0 items-start gap-6 md:grid-cols-[1fr_18rem]">
        <form noValidate onSubmit={async (event) => {
          event.preventDefault()
          setSubmitted(true)
          if (validateEmail(order.email) || isSubmitting) return
          setIsSubmitting(true)
          const result = await confirmOrder(order)
          onResult(result)
        }} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label htmlFor="order-email" className="text-sm font-medium">Email</label>
          <input id="order-email" type="email" autoComplete="email" value={order.email} disabled={isSubmitting}
            onChange={(event) => onEmailChange(event.target.value)} onBlur={() => setTouched(true)}
            aria-invalid={Boolean(emailError)} aria-describedby={emailError ? 'order-email-error' : undefined} className={inputClass} />
          {emailError && <p id="order-email-error" role="alert" className="mt-2 text-sm text-red-600">{emailError}</p>}
          <p className="mt-3 text-sm text-slate-500">На этот адрес отправим билеты.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={onBack} disabled={isSubmitting} className={secondaryButtonClass}>Изменить</button>
            <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
              {isSubmitting ? 'Оформляем…' : 'Подтвердить'}
            </button>
          </div>
        </form>
        <OrderSummary participants={order.participants} />
      </div>
      <section aria-label="Демо" className="rounded-xl border border-dashed border-slate-300 bg-slate-100 p-5">
        <p className="text-sm text-slate-500">инструмент для демонстрации</p>
        <p className="mt-2 text-sm text-slate-600">Осталось мест: {seats}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={() => demoTakeSeats(0)} className={secondaryButtonClass}>Демо: кто-то купил билеты</button>
          <button type="button" onClick={() => demoTakeSeats(1)} className={secondaryButtonClass}>Демо: осталось 1 место</button>
          <button type="button" onClick={demoReset} className={secondaryButtonClass}>Сбросить демо</button>
        </div>
      </section>
    </div>
  )
}

export default ReviewStep
