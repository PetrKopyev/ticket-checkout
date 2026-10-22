import { useState } from 'react'
import type { FormEvent } from 'react'
import { confirmOrder } from '../api.mock'
import type { ConfirmResult } from '../api.mock'
import { buildOrder, orderTotal, validateEmail } from '../rules'
import type { Order, Participant } from '../types'
import OrderSummary from './OrderSummary'
import SubmitBar from './SubmitBar'
import { cardClass, inputClass, primaryButtonClass, secondaryButtonClass, stepHeadingClass } from './ui'

const ReviewStep = ({ participants, email, onEmailChange, onBack, onResult }: {
  participants: Participant[]
  email: string
  onEmailChange: (email: string) => void
  onBack: () => void
  onResult: (result: ConfirmResult, order: Order) => void
}) => {
  const [touched, setTouched] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const order = buildOrder(participants, email)
  const emailError = touched ? validateEmail(email) : undefined

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setTouched(true)
    if (isSubmitting) return
    if (validateEmail(email)) {
      document.getElementById('order-email')?.focus()
      return
    }
    setIsSubmitting(true)
    try {
      const result = await confirmOrder(order)
      onResult(result, order)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className={[
        'grid min-w-0 items-start gap-6',
        'lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-[auto_auto_1fr]',
      ].join(' ')}
    >
      <h2 data-step-heading tabIndex={-1} className={stepHeadingClass}>Проверьте заказ</h2>
      <aside className={`${cardClass} lg:col-start-2 lg:row-start-1 lg:row-span-3`}>
        <OrderSummary participants={order.participants} compact />
      </aside>
      <div className={`${cardClass} lg:col-start-1 lg:row-start-2`}>
        <label htmlFor="order-email" className="text-sm font-medium">Email</label>
        <input
          id="order-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? 'order-email-error' : undefined}
          className={inputClass}
        />
        <p id="order-email-error" className="mt-2 min-h-5 text-sm text-red">{emailError}</p>
        <p className="mt-1 text-sm text-ink-muted">На этот адрес отправим билеты.</p>
      </div>
      <SubmitBar total={orderTotal(order.participants)}>
        <div className="flex flex-wrap gap-3 lg:col-start-1 lg:row-start-3">
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className={secondaryButtonClass}
          >
            Изменить
          </button>
          <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
            {isSubmitting ? 'Оформляем…' : 'Подтвердить'}
          </button>
        </div>
      </SubmitBar>
    </form>
  )
}

export default ReviewStep
