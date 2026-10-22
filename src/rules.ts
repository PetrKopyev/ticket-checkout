import type { Participant } from './types'

export const ADULT_AGE = 18
export const CHILD_LIMIT = 14
export const FULL_PRICE = 2000
export const CHILD_PRICE = 1000
export const MAX_PARTICIPANTS = 4

const MAX_AGE = 120
const MAX_NAME_LENGTH = 60
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ParticipantErrors = { name?: string; age?: string }

export const parseAge = (age: string): number | null => {
  const value = age.trim()
  if (!/^\d+$/.test(value)) return null
  const n = Number(value)
  return n <= MAX_AGE ? n : null
}

export const ticketPrice = (age: number) => (age < CHILD_LIMIT ? CHILD_PRICE : FULL_PRICE)

const validAges = (participants: Participant[]) =>
  participants.map((p) => parseAge(p.age)).filter((age) => age !== null)

export const orderTotal = (participants: Participant[]) =>
  validAges(participants).reduce((sum, age) => sum + ticketPrice(age), 0)

export const validateParticipant = (p: Participant): ParticipantErrors => {
  const errors: ParticipantErrors = {}
  const name = p.name.trim()
  if (!name) errors.name = 'Введите имя'
  else if (name.length > MAX_NAME_LENGTH) errors.name = `Имя не длиннее ${MAX_NAME_LENGTH} символов`
  if (parseAge(p.age) === null) errors.age = `Введите возраст — целое число от 0 до ${MAX_AGE}`
  return errors
}

export const validateEmail = (email: string) => {
  const value = email.trim()
  if (!value) return 'Введите email'
  if (!EMAIL_RE.test(value)) return 'Проверьте email'
}

export const validateOrder = (participants: Participant[], seats: number) => {
  const count = participants.length
  if (count < 1 || count > MAX_PARTICIPANTS) return `В заказе от 1 до ${MAX_PARTICIPANTS} участников`
  if (count > seats) return seats === 0 ? 'Мест нет' : `Доступно мест: ${seats}`
  const ages = validAges(participants)
  const hasChild = ages.some((age) => age < CHILD_LIMIT)
  const hasAdult = ages.some((age) => age >= ADULT_AGE)
  if (hasChild && !hasAdult) return `Детям до ${CHILD_LIMIT} лет нужен участник от ${ADULT_AGE} лет в заказе`
}

export const validateParticipants = (participants: Participant[]) =>
  participants.every((p) => Object.keys(validateParticipant(p)).length === 0)
