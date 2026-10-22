const focusClass = [
  'focus-visible:outline-2 focus-visible:outline-offset-2',
  'focus-visible:outline-violet-bright',
].join(' ')

export const primaryButtonClass = [
  'min-h-12 max-w-full whitespace-normal break-words rounded-control px-5 py-2.5 font-bold',
  'bg-brand-gradient bg-size-[180%_100%] text-ink shadow-button',
  'transition-[background-position,transform] motion-reduce:transition-none',
  'enabled:hover:bg-position-[100%_50%] motion-safe:enabled:hover:-translate-y-px',
  'disabled:cursor-not-allowed disabled:opacity-60',
  focusClass,
].join(' ')

export const secondaryButtonClass = [
  'min-h-11 max-w-full whitespace-normal break-words rounded-control px-4 py-2.5 font-bold',
  'border border-line-strong bg-transparent text-ink-soft',
  'hover:bg-surface-muted',
  'disabled:cursor-not-allowed disabled:opacity-60',
  focusClass,
].join(' ')

export const inputClass = [
  'mt-2 min-h-11 w-full rounded-control px-3 py-2',
  'border border-line-strong bg-bg-soft text-ink aria-invalid:border-red',
  focusClass,
].join(' ')

export const stepHeadingClass = 'text-xl outline-none'

export const cardClass = 'min-w-0 rounded-3xl border border-line bg-card p-5 shadow-card'

export const alertClass = 'rounded-3xl border border-red/40 bg-red/10 p-4 font-semibold text-red'

const chipBase = 'w-fit max-w-full rounded-full border px-3 py-1 text-sm font-medium'

export const chipClass = [
  chipBase,
  'border-line-strong bg-surface-muted text-violet-soft',
].join(' ')

export const dangerChipClass = [
  chipBase,
  'border-red/40 bg-red/10 text-red',
].join(' ')

export const circleIconClass = 'flex size-11 shrink-0 items-center justify-center rounded-full'

export const fieldId = (id: number, field: 'name' | 'age') => `participant-${id}-${field}`
