export type Draft = { subject: string; body: string; recipientsCount: number }

export const validate = (draft: Draft) => {
  const errors: string[] = []
  if (!draft.subject.trim()) errors.push('Укажите тему письма')
  if (!draft.body.trim()) errors.push('Добавьте текст письма')
  if (draft.recipientsCount === 0) errors.push('Нет ни одного получателя')
  return errors
}
