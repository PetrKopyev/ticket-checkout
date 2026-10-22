import { describe, expect, it } from 'vitest'
import { formatAge, formatPrice, plural } from './format'

describe('plural', () => {
  it.each([
    [0, 'мест'],
    [1, 'место'],
    [2, 'места'],
    [4, 'места'],
    [5, 'мест'],
    [11, 'мест'],
    [12, 'мест'],
    [14, 'мест'],
    [21, 'место'],
    [22, 'места'],
    [111, 'мест'],
  ])('%i — %s', (count, expected) => {
    expect(plural(count, 'место', 'места', 'мест')).toBe(expected)
  })
})

describe('formatAge', () => {
  it.each([
    [1, '1 год'],
    [13, '13 лет'],
    [21, '21 год'],
    [33, '33 года'],
  ])('%i — %s', (age, expected) => {
    expect(formatAge(age)).toBe(expected)
  })
})

describe('formatPrice', () => {
  it.each([
    [1000, '1\u00a0000 ₽'],
    [2000, '2\u00a0000 ₽'],
    [500, '500 ₽'],
  ])('%i — %s', (price, expected) => {
    expect(formatPrice(price)).toBe(expected)
  })
})
