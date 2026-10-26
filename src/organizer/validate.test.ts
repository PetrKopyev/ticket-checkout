import { describe, expect, it } from 'vitest'
import { defaultLimits } from './client'
import { validate } from './validate'

describe('validate', () => {
  it.each([
    ['ошибок нет', { subject: 'Перенос', body: 'Текст', recipientsCount: 3 }, []],
    ['только тема', { subject: 'Перенос', body: '', recipientsCount: 3 }, ['Добавьте текст письма']],
    ['только текст', { subject: '', body: 'Текст', recipientsCount: 3 }, ['Укажите тему письма']],
    ['тема из пробелов', { subject: '   ', body: 'Текст', recipientsCount: 3 }, ['Укажите тему письма']],
    ['ноль получателей', { subject: 'Перенос', body: 'Текст', recipientsCount: 0 }, ['Нет ни одного получателя']],
    ['тема ровно по лимиту', { subject: 'т'.repeat(200), body: 'Текст', recipientsCount: 3 }, []],
    ['тема длиннее лимита', { subject: 'т'.repeat(201), body: 'Текст', recipientsCount: 3 }, ['Тема длиннее 200 символов']],
    ['текст длиннее лимита', { subject: 'Перенос', body: 'т'.repeat(5001), recipientsCount: 3 }, ['Текст длиннее 5000 символов']],
  ])('%s', (_, draft, expected) => {
    expect(validate(draft, defaultLimits)).toEqual(expected)
  })

  it('берёт лимиты из настроек сервера', () => {
    expect(validate({ subject: 'Перенос', body: 'Текст', recipientsCount: 1 }, { subject: 5, body: 3 }))
      .toEqual(['Тема длиннее 5 символов', 'Текст длиннее 3 символов'])
  })
})
