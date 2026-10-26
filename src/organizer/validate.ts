import type { Limits } from './client'

export type Draft = { subject: string; body: string; recipientsCount: number }

export const validate = (draft: Draft, limits: Limits) => {
  const errors: string[] = []
  if (!draft.subject.trim()) errors.push('Укажите тему письма')
  if (draft.subject.length > limits.subject) errors.push(`Тема длиннее ${limits.subject} символов`)
  if (!draft.body.trim()) errors.push('Добавьте текст письма')
  if (draft.body.length > limits.body) errors.push(`Текст длиннее ${limits.body} символов`)
  if (draft.recipientsCount === 0) errors.push('Нет ни одного получателя')
  return errors
}
