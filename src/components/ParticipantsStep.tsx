import { useEffect, useRef, useState } from 'react'
import {
  ADULT_AGE,
  CHILD_LIMIT,
  CHILD_PRICE,
  MAX_PARTICIPANTS,
  NO_SEATS_MESSAGE,
  parseAge,
  ticketPrice,
  ticketType,
  validateOrder,
  validateParticipant,
} from '../rules'
import type { Participant } from '../types'
import OrderSummary from './OrderSummary'
import { formatPrice, inputClass, primaryButtonClass, secondaryButtonClass } from './ui'

const ParticipantsStep = ({ participants, seats, onChange, onAdd, onRemove, onContinue }: {
  participants: Participant[]
  seats: number
  onChange: (participant: Participant) => void
  onAdd: () => void
  onRemove: (id: number) => void
  onContinue: () => void
}) => {
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)
  const addButton = useRef<HTMLButtonElement>(null)
  const shouldFocusAfterRemove = useRef(false)
  const orderError = submitted ? validateOrder(participants, seats) : undefined

  useEffect(() => {
    if (!shouldFocusAfterRemove.current) return
    shouldFocusAfterRemove.current = false
    const target = addButton.current ?? document.querySelector<HTMLInputElement>('input[autocomplete="name"]')
    target?.focus()
  }, [participants.length])

  return (
    <div className="grid min-w-0 items-start gap-6 md:grid-cols-[1fr_18rem]">
      <form noValidate onSubmit={(event) => {
        event.preventDefault()
        setSubmitted(true)
        setTouched(Object.fromEntries(participants.flatMap((participant) => [
          [`${participant.id}-name`, true],
          [`${participant.id}-age`, true],
        ])))
        for (const participant of participants) {
          const errors = validateParticipant(participant)
          const field = errors.name ? 'name' : errors.age ? 'age' : undefined
          if (field) {
            document.getElementById(`participant-${participant.id}-${field}`)?.focus()
            return
          }
        }
        if (!validateOrder(participants, seats)) onContinue()
      }} className="min-w-0 space-y-5">
        <div>
          <h2 tabIndex={-1} className="text-xl font-semibold outline-none">Участники</h2>
          <p className="mt-1 text-slate-600">Осталось мест: {seats}</p>
        </div>
        {seats === 0 && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">{NO_SEATS_MESSAGE}</p>
        )}
        {participants.map((participant, index) => {
          const errors = validateParticipant(participant)
          const nameId = `participant-${participant.id}-name`
          const ageId = `participant-${participant.id}-age`
          const nameError = touched[`${participant.id}-name`] && errors.name
          const ageError = touched[`${participant.id}-age`] && errors.age
          const age = parseAge(participant.age)

          return (
            <section key={participant.id} aria-labelledby={`participant-${participant.id}-heading`} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 id={`participant-${participant.id}-heading`} className="font-semibold">Участник {index + 1}</h3>
                {participants.length > 1 && (
                  <button type="button" onClick={() => {
                    shouldFocusAfterRemove.current = true
                    onRemove(participant.id)
                  }} aria-label={`Удалить участника ${index + 1}`} className={secondaryButtonClass}>Удалить</button>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <label htmlFor={nameId} className="text-sm font-medium">Имя</label>
                  <input id={nameId} type="text" autoComplete="name" value={participant.name}
                    onChange={(event) => onChange({ ...participant, name: event.target.value })}
                    onBlur={() => setTouched((previous) => ({ ...previous, [`${participant.id}-name`]: true }))}
                    aria-invalid={Boolean(nameError)} aria-describedby={nameError ? `${nameId}-error` : undefined} className={inputClass} />
                  {nameError && <p id={`${nameId}-error`} className="mt-2 text-sm text-red-600">{nameError}</p>}
                </div>
                <div>
                  <label htmlFor={ageId} className="text-sm font-medium">Возраст</label>
                  <input id={ageId} type="text" inputMode="numeric" value={participant.age}
                    onChange={(event) => onChange({ ...participant, age: event.target.value })}
                    onBlur={() => setTouched((previous) => ({ ...previous, [`${participant.id}-age`]: true }))}
                    aria-invalid={Boolean(ageError)} aria-describedby={ageError ? `${ageId}-error` : undefined} className={inputClass} />
                  {ageError && <p id={`${ageId}-error`} className="mt-2 text-sm text-red-600">{ageError}</p>}
                </div>
              </div>
              <p className="mt-4 text-sm font-medium text-slate-600">
                {age === null ? '—' : `${ticketType(age)} · ${formatPrice(ticketPrice(age))}`}
              </p>
            </section>
          )
        })}
        {participants.length < Math.min(MAX_PARTICIPANTS, seats) && (
          <button ref={addButton} type="button" onClick={onAdd} className={secondaryButtonClass}>Добавить участника</button>
        )}
        <p className="text-sm leading-6 text-slate-500">
          Детям до {CHILD_LIMIT} лет билет за {formatPrice(CHILD_PRICE)}; в заказе с ребёнком должен быть участник от {ADULT_AGE} лет
        </p>
        {orderError && <p role="alert" className="text-sm text-red-600">{orderError}</p>}
        <button type="submit" className={primaryButtonClass}>Продолжить</button>
      </form>
      <aside className="min-w-0 md:sticky md:top-6">
        <OrderSummary participants={participants} />
      </aside>
    </div>
  )
}

export default ParticipantsStep
