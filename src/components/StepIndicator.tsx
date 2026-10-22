import type { Step } from '../types'

const steps: { id: Step; label: string }[] = [
  { id: 'participants', label: 'Участники' },
  { id: 'review', label: 'Проверка' },
  { id: 'result', label: 'Результат' },
]

const StepIndicator = ({ step, failed }: {
  step: Step
  failed: boolean
}) => {
  const currentIndex = steps.findIndex((item) => item.id === step)

  return (
    <nav aria-label="Шаги оформления" className="mb-6 min-w-0">
      <ol className="flex min-w-0 items-center gap-1 sm:gap-3">
        {steps.map((item, index) => {
          const current = index === currentIndex
          const complete = index < currentIndex || (current && step === 'result' && !failed)
          const error = current && step === 'result' && failed
          let circleClass = 'border-line-strong text-ink-muted'
          let status = ''

          if (error) {
            circleClass = 'border-red bg-red/15 text-red'
            status = 'ошибка'
          } else if (complete) {
            circleClass = current ? 'border-green bg-green/15 text-green' : 'border-violet text-violet-soft'
            status = current ? 'успех' : 'пройден'
          } else if (current) {
            circleClass = 'border-violet bg-violet text-ink'
          }

          return (
            <li
              key={item.id}
              aria-current={current ? 'step' : undefined}
              className={[
                'flex min-w-0 items-center gap-1 sm:gap-3',
                index < steps.length - 1 ? 'flex-auto' : '',
              ].join(' ')}
            >
              <span
                aria-hidden="true"
                className={[
                  'flex size-6 shrink-0 items-center justify-center rounded-full border',
                  'text-sm font-semibold sm:size-8',
                  circleClass,
                ].join(' ')}
              >
                {error ? '!' : complete ? (
                  <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current">
                    <path d="m5 12 4 4L19 6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : index + 1}
              </span>
              <span className={current ? 'min-w-0 break-words text-sm' : 'sr-only sm:not-sr-only sm:text-sm'}>
                {item.label}
              </span>
              {status && <span className="sr-only"> — {status}</span>}
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`h-px min-w-2 flex-1 ${index < currentIndex ? 'bg-violet' : 'bg-line'}`}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default StepIndicator
