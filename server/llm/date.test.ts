import { describe, expect, it } from 'vitest'
import { MONTHS, parseLetterDates, parseMoveDate, timeMinutes } from './date.ts'

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
    '20 ноября, 19:00', '20 ноября 2026, 19:00', '20 ноября 2026 года, 19:00',
    '20.11, 19:00', '20.11.2026, 19:00', '20.11.2026 19.00',
    'в 19:00 20 ноября', 'в 19.00 20 ноября 2026 года', 'в 19:00 20.11.2026',
    'в 19.00 20.11', '19.00 20.11', '20.11, 19.00',
  ])('одинаково разбирает дату запроса и письма: %s', (phrase) => {
    const date = { day: 20, month: 'ноября', time: '19:00' }
    expect(parseMoveDate(`Переносим на ${phrase}`)).toEqual(date)
    expect(parseLetterDates(`Керамика переносится ${phrase}. Место прежнее.`)).toEqual([date])
  })

  it.each(['версия 1.20.11, 19:00', 'цена 120.11.2026, 19:00', '20.110, 19:00'])(
    'не берёт дату из части числа: %s', (text) => {
      expect(parseMoveDate(text)).toBeNull()
      expect(parseLetterDates(text)).toEqual([])
    },
  )

  it.each([
    ['20 декабря, 19:00', { day: 20, month: 'декабря', time: '19:00' }],
    ['20 ноября, 19:30', { day: 20, month: 'ноября', time: '19:30' }],
  ])('сохраняет месяц и время письма: %s', (text, date) => {
    expect(parseLetterDates(text)).toEqual([date])
    expect(parseLetterDates(text)).not.toContainEqual(parseMoveDate('на 20 ноября, 19:00'))
  })

  it.each([
    'на 2 недели, в 19:00', 'на 31 апреля, 19:00', 'на 45 ноября, 19:00',
    'на 0 ноября, 19:00', 'на 30 февраля, 19:00', 'на 20 ноябрю, 19:00',
    'на 20 ноября, 24:00', 'на 20 ноября, 19:60', 'на 20 ноября, 9:0',
    'на 20 ноября, 019:00', 'на 20 ноября, 19:000', 'Напиши покупателям',
    'на 31.04.2026, 19.00', 'на 20.13, 19:00', 'на 20.00, 19:00',
    'на 20.11, 24.00', 'на 20 ноября, 19.60', 'на 20 ноября, 9.0',
    'на 20 ноября, 19:00 переносим на 31 ноября, 19:00',
  ])('отклоняет неверную дату: %s', (text) => {
    expect(parseMoveDate(text)).toBeNull()
  })

  it.each(['на 29 февраля, 00:00', 'на 31 декабря, 23:59'])('принимает граничную дату: %s', (text) => {
    expect(parseMoveDate(text)).not.toBeNull()
  })
})

describe('timeMinutes', () => {
  it.each([
    ['00:00', 0], ['9:00', 540], ['09:00', 540], ['09.00', 540], ['19:30', 1170], ['23:59', 1439],
  ])('переводит %s в минуты', (time, minutes) => {
    expect(timeMinutes(time)).toBe(minutes)
  })
})
