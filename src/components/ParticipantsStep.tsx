import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { plural } from '../format'
import {
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
import SubmitBar from './SubmitBar'
import {
  alertClass,
  cardClass,
  chipClass,
  dangerChipClass,
  formatPrice,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  stepHeadingClass,
} from './ui'

const LOW_SEATS = 3

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
      <h3 id={headingId} className="mb-4 text-sm font-semibold text-ink-muted">
        Участник {index + 1}
      </h3>
      <div className={[
        'grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4',
        'md:grid-cols-[minmax(0,1fr)_8rem_10rem_auto] md:gap-y-0',
      ].join(' ')}>
        <div className="min-w-0 md:contents">
          <label htmlFor={nameId} className="text-sm font-medium md:col-start-1 md:row-start-1">Имя</label>
          <input
            id={nameId}
            type="text"
            autoComplete="name"
            value={participant.name}
            onChange={(event) => onChange({ ...participant, name: event.target.value })}
            onBlur={() => onTouch(nameId)}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? `${nameId}-error` : undefined}
            className={`${inputClass} md:col-start-1 md:row-start-2`}
          />
          <p id={`${nameId}-error`} className="mt-2 min-h-5 text-sm text-red md:col-start-1 md:row-start-3">
            {nameError}
          </p>
        </div>
        <div className="min-w-0 md:contents">
          <label htmlFor={ageId} className="text-sm font-medium md:col-start-2 md:row-start-1">Возраст</label>
          <input
            id={ageId}
            type="text"
            inputMode="numeric"
            value={participant.age}
            onChange={(event) => onChange({ ...participant, age: event.target.value })}
            onBlur={() => onTouch(ageId)}
            aria-invalid={Boolean(ageError)}
            aria-describedby={ageError ? `${ageId}-error` : undefined}
            className={`${inputClass} md:col-start-2 md:row-start-2`}
          />
          <p id={`${ageId}-error`} className="mt-2 min-h-5 text-sm text-red md:col-start-2 md:row-start-3">
            {ageError}
          </p>
        </div>
        <div className={[
          'flex min-w-0 flex-wrap items-start justify-between gap-3 md:contents',
          age === null && !canRemove ? 'max-md:hidden' : '',
        ].join(' ')}>
          <div className={[
            'flex min-h-11 min-w-0 flex-wrap items-center gap-2 self-start',
            'md:col-start-3 md:row-start-2 md:self-end',
          ].join(' ')}>
            {age !== null && (
              <>
                <span className={chipClass}>{ticketType(age)}</span>
                <span className="whitespace-nowrap font-semibold tabular-nums">
                  {formatPrice(ticketPrice(age))}
                </span>
              </>
            )}
          </div>
          {canRemove && (
            <div className={[
              'flex min-h-11 min-w-0 items-center self-start',
              'md:col-start-4 md:row-start-2 md:self-end',
            ].join(' ')}>
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Удалить участника ${index + 1}`}
                className={secondaryButtonClass}
              >
                Удалить
              </button>
            </div>
          )}
        </div>
      </div>
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
  const [attempts, setAttempts] = useState(0)
  const addButton = useRef<HTMLButtonElement>(null)
  const orderAlert = useRef<HTMLParagraphElement>(null)
  const shouldFocusAfterRemove = useRef(false)
  const shouldFocusOrderError = useRef(false)
  const orderError = attempts > 0 && seats > 0 ? validateOrder(participants, seats) : undefined
  const fewSeats = seats <= LOW_SEATS
  const seatsLabel = `Осталось ${fewSeats ? 'всего ' : ''}${seats} ${plural(seats, 'место', 'места', 'мест')}`

  useEffect(() => {
    if (!shouldFocusAfterRemove.current) return
    shouldFocusAfterRemove.current = false
    const target = addButton.current ?? document.getElementById(fieldId(participants[0].id, 'name'))
    target?.focus()
  }, [participants])

  useEffect(() => {
    if (!shouldFocusOrderError.current) return
    shouldFocusOrderError.current = false
    orderAlert.current?.focus()
  }, [attempts])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAttempts((previous) => previous + 1)
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
    if (validateOrder(participants, seats)) shouldFocusOrderError.current = true
    else onContinue()
  }

  return (
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <form noValidate onSubmit={handleSubmit} className="min-w-0 space-y-5">
        <div>
          <h2 data-step-heading tabIndex={-1} className={stepHeadingClass}>Участники</h2>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3">
            {seats > 0 && <p className={fewSeats ? dangerChipClass : chipClass}>{seatsLabel}</p>}
            <p className="text-sm text-ink-muted">
              Участников: {participants.length} из {MAX_PARTICIPANTS}
            </p>
          </div>
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
          <button ref={addButton} type="button" onClick={onAdd} className={`block ${secondaryButtonClass}`}>
            Добавить участника
          </button>
        )}
        {orderError && (
          <p ref={orderAlert} role="alert" tabIndex={-1} className={`${alertClass} outline-none`}>
            {orderError}
          </p>
        )}
        <SubmitBar total={orderTotal(participants)}>
          <button type="submit" disabled={seats === 0} className={primaryButtonClass}>
            Продолжить
          </button>
        </SubmitBar>
      </form>
      <aside className={`${cardClass} lg:sticky lg:top-6`}>
        <OrderSummary participants={participants} compact />
      </aside>
    </div>
  )
}

export default ParticipantsStep
