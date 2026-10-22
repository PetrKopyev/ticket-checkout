import { useState } from 'react'
import { confirmOrder } from '../api.mock'
import type { ConfirmResult } from '../api.mock'
import { validateEmail } from '../rules'
import type { Order } from '../types'
import OrderSummary from './OrderSummary'
import { cardClass, inputClass, primaryButtonClass, secondaryButtonClass } from './ui'

const ReviewStep = ({ order, email, onEmailChange, onBack, onResult }: {
  order: Order
  email: string
  onEmailChange: (email: string) => void
  onBack: () => void
  onResult: (result: ConfirmResult) => void
}) => {
  const [touched, setTouched] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const emailError = touched ? validateEmail(order.email) : undefined

  return (
    <div className="space-y-6">
      <h2 tabIndex={-1} className="text-xl outline-none">Проверьте заказ</h2>
      <div className="grid min-w-0 items-start gap-6 md:grid-cols-[1fr_18rem]">
        <form noValidate onSubmit={async (event) => {
          event.preventDefault()
          setTouched(true)
          if (isSubmitting) return
          if (validateEmail(order.email)) {
            document.getElementById('order-email')?.focus()
            return
          }
          setIsSubmitting(true)
          try {
            const result = await confirmOrder(order)
            onResult(result)
          } finally {
            setIsSubmitting(false)
          }
        }} className={cardClass}>
          <label htmlFor="order-email" className="text-sm font-medium">Email</label>
          <input id="order-email" type="email" autoComplete="email" value={email} disabled={isSubmitting}
            onChange={(event) => onEmailChange(event.target.value)} onBlur={() => setTouched(true)}
            aria-invalid={Boolean(emailError)} aria-describedby={emailError ? 'order-email-error' : undefined} className={inputClass} />
          {emailError && <p id="order-email-error" className="mt-2 text-sm text-red">{emailError}</p>}
          <p className="mt-3 text-sm text-ink-muted">На этот адрес отправим билеты.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={onBack} disabled={isSubmitting} className={secondaryButtonClass}>Изменить</button>
            <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
              {isSubmitting ? 'Оформляем…' : 'Подтвердить'}
            </button>
          </div>
        </form>
        <OrderSummary participants={order.participants} />
      </div>
    </div>
  )
}

export default ReviewStep
