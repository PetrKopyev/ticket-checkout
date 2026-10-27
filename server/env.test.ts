import { describe, expect, it } from 'vitest'
import { parseDelay, parsePort } from './env.ts'

describe('parsePort', () => {
  it.each([undefined, '', '  '])('использует порт по умолчанию для %j', (value) => {
    expect(parsePort(value)).toBe(3001)
  })

  it.each(['1', '3001', '65535'])('принимает порт %s', (value) => {
    expect(parsePort(value)).toBe(Number(value))
  })

  it.each(['abc', 'NaN', 'Infinity', '-Infinity'])('отклоняет нечисловой порт %s', (value) => {
    expect(() => parsePort(value)).toThrow('PORT должен быть числом')
  })

  it.each(['0', '-1', '65536', '3001.5'])('отклоняет недопустимый порт %s', (value) => {
    expect(() => parsePort(value)).toThrow('PORT должен быть целым числом от 1 до 65535')
  })
})

describe('parseDelay', () => {
  it.each([undefined, '', '  '])('использует задержку по умолчанию для %j', (value) => {
    expect(parseDelay(value)).toBe(400)
  })

  it.each(['0', '1500', '0.5'])('принимает задержку %s', (value) => {
    expect(parseDelay(value)).toBe(Number(value))
  })

  it.each(['abc', 'NaN', 'Infinity', '-Infinity', '-1'])('отклоняет недопустимую задержку %s', (value) => {
    expect(() => parseDelay(value)).toThrow('MAIL_DELAY_MS должен быть неотрицательным числом')
  })
})
