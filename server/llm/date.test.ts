import { describe, expect, it } from 'vitest'
import { MONTHS, parseMoveDate } from './date.ts'

describe('parseMoveDate', () => {
  it.each(MONTHS)('распознаёт месяц %s без учёта регистра', (month) => {
    expect(parseMoveDate(`Перенос на 5 ${month.toUpperCase()}, в 9:00`))
      .toEqual({ day: 5, month, time: '9:00' })
  })

  it.each(['на 05 декабря, 09:00', 'на 05 декабря в 09:00', 'на 05 декабря 09:00', 'на 05 декабря,09:00'])('понимает формат %s', (text) => {
    expect(parseMoveDate(text)).toEqual({ day: 5, month: 'декабря', time: '09:00' })
  })

  it('берёт последнюю дату', () => {
    expect(parseMoveDate('Лекцию на 20 ноября, 19:00 переносим на 27 ноября, 19:00'))
      .toEqual({ day: 27, month: 'ноября', time: '19:00' })
  })

  it.each([
    'на 2 недели, в 19:00', 'на 31 апреля, 19:00', 'на 45 ноября, 19:00',
    'на 0 ноября, 19:00', 'на 30 февраля, 19:00', 'на 20 ноябрю, 19:00',
    'на 20 ноября, 24:00', 'на 20 ноября, 19:60', 'на 20 ноября, 9:0',
    'на 20 ноября, 019:00', 'на 20 ноября, 19:000', 'Напиши покупателям',
    'на 20 ноября, 19:00 переносим на 31 ноября, 19:00',
  ])('отклоняет неверную дату: %s', (text) => {
    expect(parseMoveDate(text)).toBeNull()
  })

  it.each(['на 29 февраля, 00:00', 'на 31 декабря, 23:59'])('принимает граничную дату: %s', (text) => {
    expect(parseMoveDate(text)).not.toBeNull()
  })
})
