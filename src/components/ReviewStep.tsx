import { useState } from 'react'
import type { FormEvent } from 'react'
import { confirmOrder } from '../api.mock'
import type { ConfirmResult } from '../api.mock'
import { buildOrder, orderTotal, validateEmail } from '../rules'
import type { Participant } from '../types'
import OrderSummary from './OrderSummary'
import SubmitBar from './SubmitBar'
import { cardClass, inputClass, primaryButtonClass, secondaryButtonClass } from './ui'

const ReviewStep = ({ participants, email, onEmailChange, onBack, onResult }: {
  participants: Participant[]
  email: string
  onEmailChange: (email: string) => void
  onBack: () => void
  onResult: (result: ConfirmResult) => void
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
      onResult(result)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-w-0 max-w-2xl space-y-5">
      <h2 data-step-heading tabIndex={-1} className="scroll-mt-6 text-xl outline-none">Проверьте заказ</h2>
      <div className={cardClass}>
        <OrderSummary participants={order.participants} />
      </div>
      <form noValidate onSubmit={handleSubmit} className={cardClass}>
        <label htmlFor="order-email" className="text-sm font-medium">Email</label>
        <input
          id="order-email"
          type="email"
          autoComplete="email"
          value={email}
          disabled={isSubmitting}
          onChange={(event) => onEmailChange(event.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? 'order-email-error' : undefined}
          className={inputClass}
        />
        {emailError && <p id="order-email-error" className="mt-2 text-sm text-red">{emailError}</p>}
        <p className="mt-3 text-sm text-ink-muted">На этот адрес отправим билеты.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className={secondaryButtonClass}
          >
            Изменить
          </button>
          <SubmitBar total={orderTotal(participants)}>
            <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
              {isSubmitting ? 'Оформляем…' : 'Подтвердить'}
            </button>
          </SubmitBar>
        </div>
      </form>
    </div>
  )
}

export default ReviewStep
