import type { Order } from './types'

export type ConfirmResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: 'SOLD_OUT' | 'NOT_ENOUGH'; seats: number }

const INITIAL_SEATS = 10
let seats = INITIAL_SEATS
const listeners = new Set<() => void>()

const notify = (): void => {
  listeners.forEach((listener) => listener())
}

export const getSeats = (): number => seats

export const confirmOrder = async (order: Order): Promise<ConfirmResult> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 400))

  if (seats === 0) {
    return { ok: false, reason: 'SOLD_OUT', seats }
  }

  if (seats < order.participants.length) {
    return { ok: false, reason: 'NOT_ENOUGH', seats }
  }

  seats -= order.participants.length
  notify()

  const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const orderId = 'T-' + Array.from(
    { length: 6 },
    () => characters[Math.floor(Math.random() * characters.length)],
  ).join('')

  return { ok: true, orderId }
}

export const demoTakeSeats = (left: number): void => {
  seats = Math.min(seats, left)
  notify()
}

export const demoReset = (): void => {
  seats = INITIAL_SEATS
  notify()
}

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
