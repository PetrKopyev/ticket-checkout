import { describe, expect, it } from 'vitest'
import { validate } from './validate'

describe('validate', () => {
  it('пропускает заполненный черновик', () => {
    expect(validate({ subject: 'Перенос', body: 'Текст', recipientsCount: 3 })).toEqual([])
  })

  it('находит пустую тему, пустой текст и отсутствие получателей', () => {
    expect(validate({ subject: '  ', body: '\n', recipientsCount: 0 })).toEqual([
      'Укажите тему письма',
      'Добавьте текст письма',
      'Нет ни одного получателя',
    ])
  })
})
