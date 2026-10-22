import type { Order, Participant } from './types'

export const ADULT_AGE = 18
export const CHILD_LIMIT = 14
export const FULL_PRICE = 2000
export const CHILD_PRICE = 1000
export const MAX_PARTICIPANTS = 4
export const NO_SEATS_MESSAGE = 'Мест нет'

const MAX_AGE = 120
const MAX_NAME_LENGTH = 60
const MAX_EMAIL_LENGTH = 254
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

type ParticipantErrors = { name?: string; age?: string }

export const parseAge = (age: string): number | null => {
  const value = age.trim()
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return parsed <= MAX_AGE ? parsed : null
}

export const ticketPrice = (age: number) => age < CHILD_LIMIT ? CHILD_PRICE : FULL_PRICE
export const ticketType = (age: number) => age < CHILD_LIMIT ? 'Детский' : 'Полный'

const validAges = (participants: Participant[]) =>
  participants.map((participant) => parseAge(participant.age)).filter((age) => age !== null)

export const orderTotal = (participants: Participant[]) =>
  validAges(participants).reduce((sum, age) => sum + ticketPrice(age), 0)

const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ')

export const validateParticipant = (participant: Participant): ParticipantErrors => {
  const errors: ParticipantErrors = {}
  const name = normalizeName(participant.name)
  if (!name) errors.name = 'Введите имя'
  else if (name.length > MAX_NAME_LENGTH) errors.name = `Имя не длиннее ${MAX_NAME_LENGTH} символов`
  if (parseAge(participant.age) === null) errors.age = `Введите возраст — целое число от 0 до ${MAX_AGE}`
  return errors
}

export const validateEmail = (email: string): string | undefined => {
  const value = email.trim()
  if (!value) return 'Введите email'
  if (value.length > MAX_EMAIL_LENGTH) return `Email не длиннее ${MAX_EMAIL_LENGTH} символов`
  if (!EMAIL_RE.test(value)) return 'Проверьте email'
}

export const validateOrder = (participants: Participant[], seats: number): string | undefined => {
  const count = participants.length
  if (count < 1 || count > MAX_PARTICIPANTS) return `В заказе от 1 до ${MAX_PARTICIPANTS} участников`
  if (count > seats) return seats === 0 ? NO_SEATS_MESSAGE : `Доступно мест: ${seats}`
  const ages = validAges(participants)
  const hasChild = ages.some((age) => age < CHILD_LIMIT)
  const hasAdult = ages.some((age) => age >= ADULT_AGE)
  if (hasChild && !hasAdult) {
    return `Детям до ${CHILD_LIMIT} лет нужен участник от ${ADULT_AGE} лет в заказе`
  }
}

export const buildOrder = (participants: Participant[], email: string): Order => ({
  participants: participants.map((participant) => ({
    ...participant,
    name: normalizeName(participant.name),
    age: participant.age.trim(),
  })),
  email: email.trim(),
})
