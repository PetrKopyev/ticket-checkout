import { formatPrice } from '../format'
import { parseAge, ticketPrice, ticketType, validateParticipant } from '../rules'
import type { Participant } from '../types'
import { cardClass, chipClass, fieldId, inputClass, secondaryButtonClass } from './ui'


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

export default ParticipantCard
