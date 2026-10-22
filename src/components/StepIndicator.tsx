const steps = [
  { id: 'participants', label: 'Участники' },
  { id: 'review', label: 'Проверка' },
  { id: 'result', label: 'Готово' },
]

const StepIndicator = ({ step, failed }: {
  step: 'participants' | 'review' | 'result'
  failed: boolean
}) => {
  const currentIndex = steps.findIndex((item) => item.id === step)

  return (
    <nav aria-label="Шаги оформления" className="mb-6 min-w-0">
      <ol className="flex min-w-0 items-center gap-1 sm:gap-3">
        {steps.map((item, index) => {
          const current = index === currentIndex
          const complete = index < currentIndex || (current && step === 'result' && !failed)
          const circleClass = complete
            ? current ? 'border-green bg-green/15 text-green' : 'border-violet text-violet-soft'
            : current ? 'border-violet bg-violet text-ink' : 'border-line-strong text-ink-muted'

          return (
            <li
              key={item.id}
              aria-current={current ? 'step' : undefined}
              className="flex min-w-0 items-center gap-1 sm:gap-3 not-last:flex-auto"
            >
              <span className={[
                'flex size-6 shrink-0 items-center justify-center rounded-full border',
                'text-sm font-semibold sm:size-8',
                circleClass,
              ].join(' ')}>
                {complete ? (
                  <>
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-current">
                      <path d="m5 12 4 4L19 6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="sr-only">{index + 1} {current ? 'успех' : 'пройден'}</span>
                  </>
                ) : index + 1}
              </span>
              <span className={current ? 'min-w-0 break-words text-sm' : 'sr-only sm:not-sr-only sm:text-sm'}>
                {item.label}
              </span>
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
