export const formatPrice = (price: number) => price.toLocaleString('ru-RU') + ' ₽'

export const plural = (count: number, one: string, few: string, many: string) => {
  const lastTwo = count % 100
  const last = count % 10
  if (lastTwo >= 11 && lastTwo <= 14) return many
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

export const formatAge = (age: number) => `${age} ${plural(age, 'год', 'года', 'лет')}`
