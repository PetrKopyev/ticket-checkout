import { describe, expect, it } from 'vitest'
import {
  buildOrder,
  orderTotal,
  parseAge,
  ticketPrice,
  ticketType,
  validateEmail,
  validateOrder,
  validateParticipant,
} from './rules'
import type { Participant } from './types'

let nextId = 0
const person = (age: string, name = 'Аня'): Participant => ({ id: nextId++, name, age })

const ESCORT_ERROR = 'Детям до 14 лет нужен участник от 18 лет в заказе'
const COUNT_ERROR = 'В заказе от 1 до 4 участников'

describe('ticketPrice', () => {
  it('детский билет до 14 лет', () => {
    expect(ticketPrice(0)).toBe(1000)
    expect(ticketPrice(13)).toBe(1000)
    expect(ticketPrice(14)).toBe(2000)
    expect(ticketPrice(17)).toBe(2000)
    expect(ticketPrice(18)).toBe(2000)
  })
})

describe('ticketType', () => {
  it('детский до 14 лет, затем полный', () => {
    expect(ticketType(13)).toBe('Детский')
    expect(ticketType(14)).toBe('Полный')
  })
})

describe('parseAge', () => {
  it.each(['', '  ', '-1', 'abc', '10.5', '121'])('«%s» — не возраст', (age) => {
    expect(parseAge(age)).toBeNull()
    expect(validateParticipant(person(age)).age).toBe('Введите возраст — целое число от 0 до 120')
  })

  it('целые 0–120 с пробелами по краям', () => {
    expect(parseAge(' 30 ')).toBe(30)
    expect(parseAge('0')).toBe(0)
    expect(parseAge('120')).toBe(120)
  })
})

describe('validateParticipant', () => {
  it.each(['', '   '])('пустое имя «%s»', (name) => {
    expect(validateParticipant(person('30', name)).name).toBe('Введите имя')
  })

  it('считает длину имени после схлопывания пробелов', () => {
    expect(validateParticipant(person('30', 'А' + ' '.repeat(60) + 'Б'))).toEqual({})
  })

  it('имя длиннее 60 символов', () => {
    expect(validateParticipant(person('30', 'я'.repeat(61))).name).toBe('Имя не длиннее 60 символов')
    expect(validateParticipant(person('30', 'я'.repeat(60)))).toEqual({})
  })
})

describe('validateEmail', () => {
  it.each(['a@b', 'a b@c.d', 'a@b..c', 'a@.b.c', 'a@b.c.'])('«%s» — неверный', (email) => {
    expect(validateEmail(email)).toBe('Проверьте email')
  })

  it('пустой и верный', () => {
    expect(validateEmail('')).toBe('Введите email')
    expect(validateEmail(' anya@mail.ru ')).toBeUndefined()
    expect(validateEmail('a.b@mail.co.uk')).toBeUndefined()
  })

  it('email не длиннее 254 символов', () => {
    expect(validateEmail('a'.repeat(249) + '@b.ru')).toBeUndefined()
    expect(validateEmail('a'.repeat(250) + '@b.ru')).toBe('Email не длиннее 254 символов')
  })
})

describe('buildOrder', () => {
  it('обрезает пробелы, схлопывает пробелы в имени и сохраняет id', () => {
    const participant = person(' 30 ', '  Анна   Мария ')
    expect(buildOrder([participant], ' a@b.ru ')).toEqual({
      participants: [{ id: participant.id, name: 'Анна Мария', age: '30' }],
      email: 'a@b.ru',
    })
  })
})

describe('validateOrder', () => {
  it('один 15-летний проходит', () => {
    expect(validateOrder([person('15')], 10)).toBeUndefined()
  })

  it('невалидный возраст не считается взрослым', () => {
    expect(validateOrder([person('13'), person('abc')], 10)).toBe(ESCORT_ERROR)
  })

  it('четыре участника на четыре места проходят', () => {
    expect(validateOrder([person('20'), person('21'), person('22'), person('23')], 4)).toBeUndefined()
  })

  it('ребёнку 13 нужен участник от 18, 17 лет не считается', () => {
    expect(validateOrder([person('13'), person('17')], 10)).toBe(ESCORT_ERROR)
    expect(validateOrder([person('13')], 10)).toBe(ESCORT_ERROR)
  })

  it('13 + 18 — можно, итог 3000', () => {
    const participants = [person('13'), person('18')]
    expect(validateOrder(participants, 10)).toBeUndefined()
    expect(orderTotal(participants)).toBe(3000)
  })

  it('один взрослый на нескольких детей', () => {
    expect(validateOrder([person('30'), person('5'), person('7'), person('10')], 10)).toBeUndefined()
  })

  it('места', () => {
    expect(validateOrder([person('30')], 0)).toBe('Мест нет')
    expect(validateOrder([person('30'), person('31'), person('32')], 2)).toBe('Доступно мест: 2')
  })

  it('от 1 до 4 участников', () => {
    expect(validateOrder([], 10)).toBe(COUNT_ERROR)
    expect(validateOrder(['20', '21', '22', '23', '24'].map((age) => person(age)), 10)).toBe(COUNT_ERROR)
  })
})

describe('orderTotal', () => {
  it('невалидные возрасты пропускаются', () => {
    expect(orderTotal([person('30'), person('abc')])).toBe(2000)
  })
})
