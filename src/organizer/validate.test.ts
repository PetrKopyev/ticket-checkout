import { describe, expect, it } from 'vitest'
import { validate } from './validate'

describe('validate', () => {
  it.each([
    ['ошибок нет', { subject: 'Перенос', body: 'Текст', recipientsCount: 3 }, []],
    ['только тема', { subject: 'Перенос', body: '', recipientsCount: 3 }, ['Добавьте текст письма']],
    ['только текст', { subject: '', body: 'Текст', recipientsCount: 3 }, ['Укажите тему письма']],
    ['тема из пробелов', { subject: '   ', body: 'Текст', recipientsCount: 3 }, ['Укажите тему письма']],
    ['ноль получателей', { subject: 'Перенос', body: 'Текст', recipientsCount: 0 }, ['Нет ни одного получателя']],
  ])('%s', (_, draft, expected) => {
    expect(validate(draft)).toEqual(expected)
  })
})
