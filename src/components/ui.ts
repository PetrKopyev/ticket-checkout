import { CHILD_PRICE, ticketPrice } from '../rules'

export const formatPrice = (price: number) => price.toLocaleString('ru-RU') + ' ₽'

export const ticketType = (age: number) => ticketPrice(age) === CHILD_PRICE ? 'Детский' : 'Полный'

export const focusClass = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'

export const primaryButtonClass = `min-h-11 rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`

export const secondaryButtonClass = `min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`

export const inputClass = `mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 aria-invalid:border-red-500 ${focusClass}`
