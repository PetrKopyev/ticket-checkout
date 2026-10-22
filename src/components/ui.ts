export const formatPrice = (price: number) => price.toLocaleString('ru-RU') + ' ₽'

export const focusClass = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-bright'

export const primaryButtonClass = `min-h-12 max-w-full rounded-[18px] bg-brand-gradient bg-size-[180%_100%] px-5 py-2.5 font-[750] text-ink shadow-button transition-[background-position,transform] hover:bg-position-[100%_50%] hover:-translate-y-px motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`

export const secondaryButtonClass = `min-h-11 max-w-full rounded-[18px] border border-line-strong bg-transparent px-4 py-2.5 font-[750] text-[#ded9e2] hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`

export const inputClass = `mt-2 min-h-11 w-full rounded-[18px] border border-line-strong bg-bg-soft px-3 py-2 text-ink aria-invalid:border-red ${focusClass}`

export const cardClass = 'min-w-0 rounded-3xl border border-line bg-card p-5 shadow-card'

export const chipClass = 'w-fit max-w-full rounded-full border border-line-strong bg-surface-muted px-3 py-1 text-sm font-medium text-violet-soft'
