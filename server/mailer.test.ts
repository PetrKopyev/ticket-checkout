import { describe, expect, it } from 'vitest'
import { pauseMs } from './mailer.ts'

describe('pauseMs', () => {
  it.each([
    [400, 6, 400],
    [400, 1000, 8],
    [400, 1, 400],
    [10000, 1, 8000],
    [400, 20, 400],
    [0, 1000, 0],
    [1500, 100, 80],
  ])('предел %i мс и %i получателей — %i мс', (maxDelayMs, recipients, expected) => {
    expect(pauseMs(maxDelayMs, recipients)).toBe(expected)
  })
})
