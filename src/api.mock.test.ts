import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmOrder, demoReset, demoTakeSeats, getSeats, subscribe } from './api.mock'
import type { Order } from './types'

const order = (count: number): Order => ({
  email: 'a@b.ru',
  participants: Array.from({ length: count }, (_, i) => ({ id: i, name: `Гость ${i}`, age: '30' })),
})

const confirm = async (count: number) => {
  const result = confirmOrder(order(count))
  await vi.advanceTimersByTimeAsync(400)
  return result
}

beforeEach(() => {
  vi.useFakeTimers()
  demoReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('confirmOrder', () => {
  it('оформляет заказ и уменьшает места', async () => {
    const result = await confirm(2)
    expect(result).toMatchObject({ ok: true })
    if (result.ok) expect(result.orderId).toMatch(/^T-[0-9A-Z]{6}$/)
    expect(getSeats()).toBe(8)
  })

  it('SOLD_OUT, когда мест нет', async () => {
    demoTakeSeats(0)
    expect(await confirm(1)).toEqual({ ok: false, reason: 'SOLD_OUT', seats: 0 })
    expect(getSeats()).toBe(0)
  })

  it('NOT_ENOUGH, когда мест меньше участников', async () => {
    demoTakeSeats(1)
    expect(await confirm(2)).toEqual({ ok: false, reason: 'NOT_ENOUGH', seats: 1 })
    expect(getSeats()).toBe(1)
  })

  it('берёт последние места, дальше SOLD_OUT', async () => {
    demoTakeSeats(2)
    expect(await confirm(2)).toMatchObject({ ok: true })
    expect(getSeats()).toBe(0)
    expect(await confirm(1)).toMatchObject({ ok: false, reason: 'SOLD_OUT' })
  })

  it('два заказа подряд: второй не влезает', async () => {
    const first = confirmOrder(order(6))
    const second = confirmOrder(order(6))
    await vi.advanceTimersByTimeAsync(400)
    expect(await first).toMatchObject({ ok: true })
    expect(await second).toEqual({ ok: false, reason: 'NOT_ENOUGH', seats: 4 })
  })
})

describe('демо и подписка', () => {
  it('demoTakeSeats не увеличивает места, demoReset возвращает 10', () => {
    demoTakeSeats(5)
    demoTakeSeats(8)
    expect(getSeats()).toBe(5)
    demoReset()
    expect(getSeats()).toBe(10)
  })

  it('слушатель вызывается при изменении мест, но не при отказе и после отписки', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    await confirm(1)
    demoTakeSeats(0)
    expect(listener).toHaveBeenCalledTimes(2)

    await confirm(1)
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    demoReset()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
