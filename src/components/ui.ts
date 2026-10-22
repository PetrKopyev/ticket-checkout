export const formatPrice = (price: number) => price.toLocaleString('ru-RU') + ' ₽'

export const plural = (count: number, one: string, few: string, many: string) => {
  const lastTwo = count % 100
  const last = count % 10
  if (lastTwo >= 11 && lastTwo <= 14) return many
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

export const formatAge = (age: number) => `${age} ${plural(age, 'год', 'года', 'лет')}`

const focusClass = [
  'focus-visible:outline-2 focus-visible:outline-offset-2',
  'focus-visible:outline-violet-bright',
].join(' ')

export const primaryButtonClass = [
  'min-h-12 max-w-full whitespace-normal break-words rounded-[18px] px-5 py-2.5 font-[750]',
  'bg-brand-gradient bg-size-[180%_100%] text-ink shadow-button',
  'transition-[background-position,transform] motion-reduce:transition-none',
  'hover:bg-position-[100%_50%] hover:-translate-y-px',
  'disabled:cursor-not-allowed disabled:opacity-60',
  focusClass,
].join(' ')

export const secondaryButtonClass = [
  'min-h-11 max-w-full whitespace-normal break-words rounded-[18px] px-4 py-2.5 font-[750]',
  'border border-line-strong bg-transparent text-ink-soft',
  'hover:bg-surface-muted',
  'disabled:cursor-not-allowed disabled:opacity-60',
  focusClass,
].join(' ')

export const inputClass = [
  'mt-2 min-h-11 w-full rounded-[18px] px-3 py-2',
  'border border-line-strong bg-bg-soft text-ink aria-invalid:border-red',
  focusClass,
].join(' ')

export const cardClass = 'min-w-0 rounded-3xl border border-line bg-card p-5 shadow-card'

export const alertClass = 'rounded-3xl border border-red/40 bg-red/10 p-4 font-semibold text-red'

export const chipClass = [
  'w-fit max-w-full rounded-full px-3 py-1 text-sm font-medium',
  'border border-line-strong bg-surface-muted text-violet-soft',
].join(' ')

export const dangerChipClass = [
  'w-fit max-w-full rounded-full px-3 py-1 text-sm font-medium',
  'border border-red/40 bg-red/10 text-red',
].join(' ')

export const circleIconClass = 'flex size-11 shrink-0 items-center justify-center rounded-full'
