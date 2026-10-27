import type { Limits } from './client'

export type Draft = { subject: string; body: string; recipientsCount: number }

// Без лимитов (запрос не удался) длину проверит сервер.
export const validate = (draft: Draft, limits: Limits | null) => {
  const errors: string[] = []
  if (!draft.subject.trim()) errors.push('Укажите тему письма')
  if (limits && draft.subject.length > limits.subject) errors.push(`Тема длиннее ${limits.subject} символов`)
  if (/[\p{Cc}\p{Zl}\p{Zp}\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u.test(draft.subject)) errors.push('Тема должна быть одной строкой')
  if (!draft.body.trim()) errors.push('Добавьте текст письма')
  if (limits && draft.body.length > limits.body) errors.push(`Текст длиннее ${limits.body} символов`)
  if (draft.recipientsCount === 0) errors.push('Нет ни одного получателя')
  return errors
}
