import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ADULT_AGE,
  CHILD_LIMIT,
  CHILD_PRICE,
  FULL_PRICE,
  MAX_PARTICIPANTS,
  NO_SEATS_MESSAGE,
  orderTotal,
  parseAge,
  ticketPrice,
  ticketType,
  validateOrder,
  validateParticipant,
} from '../rules'
import type { Participant } from '../types'
import OrderSummary from './OrderSummary'
import {
  alertClass,
  cardClass,
  chipClass,
  formatPrice,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './ui'

const fieldId = (id: number, field: 'name' | 'age') => `participant-${id}-${field}`

const ParticipantCard = ({ participant, index, canRemove, touched, onChange, onTouch, onRemove }: {
  participant: Participant
  index: number
  canRemove: boolean
  touched: Record<string, boolean>
  onChange: (participant: Participant) => void
  onTouch: (id: string) => void
  onRemove: () => void
}) => {
  const errors = validateParticipant(participant)
  const headingId = `participant-${participant.id}-heading`
  const nameId = fieldId(participant.id, 'name')
  const ageId = fieldId(participant.id, 'age')
  const nameError = touched[nameId] && errors.name
  const ageError = touched[ageId] && errors.age
  const age = parseAge(participant.age)

  return (
    <section aria-labelledby={headingId} className={cardClass}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId}>Участник {index + 1}</h3>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Удалить участника ${index + 1}`}
            className={secondaryButtonClass}
          >
            Удалить
          </button>
        )}
      </div>
      <div className="space-y-4">
        <div>
          <label htmlFor={nameId} className="text-sm font-medium">Имя</label>
          <input
            id={nameId}
            type="text"
            autoComplete="name"
            value={participant.name}
            onChange={(event) => onChange({ ...participant, name: event.target.value })}
            onBlur={() => onTouch(nameId)}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? `${nameId}-error` : undefined}
            className={inputClass}
          />
          {nameError && <p id={`${nameId}-error`} className="mt-2 text-sm text-red">{nameError}</p>}
        </div>
        <div>
          <label htmlFor={ageId} className="text-sm font-medium">Возраст</label>
          <input
            id={ageId}
            type="text"
            inputMode="numeric"
            value={participant.age}
            onChange={(event) => onChange({ ...participant, age: event.target.value })}
            onBlur={() => onTouch(ageId)}
            aria-invalid={Boolean(ageError)}
            aria-describedby={ageError ? `${ageId}-error` : undefined}
            className={inputClass}
          />
          {ageError && <p id={`${ageId}-error`} className="mt-2 text-sm text-red">{ageError}</p>}
        </div>
      </div>
      {age !== null && (
        <p className={`mt-4 ${chipClass}`}>{ticketType(age)} · {formatPrice(ticketPrice(age))}</p>
      )}
      {age === null && !ageError && <p className="mt-4 text-sm text-ink-muted">Укажите возраст</p>}
    </section>
  )
}

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
  const orderError = submitted && seats > 0 ? validateOrder(participants, seats) : undefined

  useEffect(() => {
    if (!shouldFocusAfterRemove.current) return
    shouldFocusAfterRemove.current = false
    const target = addButton.current ?? document.getElementById(fieldId(participants[0].id, 'name'))
    target?.focus()
  }, [participants])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    setTouched(Object.fromEntries(participants.flatMap((participant) => [
      [fieldId(participant.id, 'name'), true],
      [fieldId(participant.id, 'age'), true],
    ])))
    for (const participant of participants) {
      const errors = validateParticipant(participant)
      const field = errors.name ? 'name' : errors.age ? 'age' : undefined
      if (field) {
        document.getElementById(fieldId(participant.id, field))?.focus()
        return
      }
    }
    if (!validateOrder(participants, seats)) onContinue()
  }

  return (
    <div className="grid min-w-0 items-start gap-6 md:grid-cols-[1fr_18rem]">
      <form noValidate onSubmit={handleSubmit} className="min-w-0 space-y-5">
        <div>
          <h2 data-step-heading tabIndex={-1} className="scroll-mt-6 text-xl outline-none">Участники</h2>
          <p className="mt-1 text-ink-muted">
            Осталось мест: {seats} · Участников: {participants.length} (не более {MAX_PARTICIPANTS})
          </p>
        </div>
        {seats === 0 && <p role="alert" className={alertClass}>{NO_SEATS_MESSAGE}</p>}
        {participants.map((participant, index) => (
          <ParticipantCard
            key={participant.id}
            participant={participant}
            index={index}
            canRemove={participants.length > 1}
            touched={touched}
            onChange={onChange}
            onTouch={(id) => setTouched((previous) => ({ ...previous, [id]: true }))}
            onRemove={() => {
              shouldFocusAfterRemove.current = true
              onRemove(participant.id)
            }}
          />
        ))}
        {participants.length < Math.min(MAX_PARTICIPANTS, seats) && (
          <button ref={addButton} type="button" onClick={onAdd} className={secondaryButtonClass}>
            Добавить участника
          </button>
        )}
        <p aria-hidden="true" className="text-lg font-extrabold md:hidden">
          Итого: <span className="text-violet-soft">{formatPrice(orderTotal(participants))}</span>
        </p>
        {orderError ? (
          <p role="alert" className={alertClass}>{orderError}</p>
        ) : (
          <p className="text-sm leading-6 text-ink-muted">
            Детям до {CHILD_LIMIT} лет билет за {formatPrice(CHILD_PRICE)},
            полный — {formatPrice(FULL_PRICE)}; в заказе с ребёнком должен быть участник от {ADULT_AGE} лет
          </p>
        )}
        <button type="submit" disabled={seats === 0} className={primaryButtonClass}>
          Продолжить
        </button>
      </form>
      <aside className="min-w-0 md:sticky md:top-6">
        <OrderSummary participants={participants} />
      </aside>
    </div>
  )
}

export default ParticipantsStep
