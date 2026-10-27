export const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const DATE_RE = /(?<![\d.])(?:(\d+)\s+([а-яё]+)(?:\s+\d{4}(?:\s+года)?)?|(\d{1,2})\.(\d{1,2})(?:\.\d{4})?)(?!\d)/i
const TIME_RE = /(?<![\d.:])(\d+[:.]\d+)(?![\d:])/
const BETWEEN = '\\s*,?\\s*(?:(?:в|на)\\s+)?'
const DATE_TIME = `(?<date>${DATE_RE.source})${BETWEEN}(?<time>${TIME_RE.source})`
const TIME_DATE = `(?<time>${TIME_RE.source})${BETWEEN}(?<date>${DATE_RE.source})`
const DATE_TIME_RE = new RegExp(`^${DATE_TIME}$`, 'i')
const TIME_DATE_RE = new RegExp(`^${TIME_DATE}$`, 'i')
const PHRASE_RE = new RegExp(`(?:в\\s+)?(?:${DATE_RE.source}${BETWEEN}${TIME_RE.source}|${TIME_RE.source}${BETWEEN}${DATE_RE.source})`, 'gi')

type MoveDate = { day: number; month: string; time: string }

export const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()

export const eventTitle = (title: string) => title.match(/["“”„«»'‘’]([^"“”„«»'‘’]+)["“”„«»'‘’]/)?.[1] ?? title

export const mentions = (text: string, title: string) => {
  const lower = normalize(text)
  return normalize(eventTitle(title)).split(' ')
    .every((word) => lower.includes(word.length > 1 ? word.slice(0, -1) : word))
}

const parseDate = (date: string, rawTime: string): MoveDate | null => {
  const match = date.match(DATE_RE)!
  const day = Number(match[1] ?? match[3])
  const month = match[2]?.toLowerCase() ?? MONTHS[Number(match[4]) - 1]
  const time = rawTime.replace('.', ':')
  const [hours, minutes] = time.split(':').map(Number)
  if (day < 1 || day > DAYS[MONTHS.indexOf(month)] || !MONTHS.includes(month)
    || !/^\d{1,2}:\d{2}$/.test(time) || hours > 23 || minutes > 59) return null
  return { day, month, time }
}

const parsePhrase = (phrase: RegExpMatchArray) => {
  const timeFirst = /^в\s+/i.test(phrase[0])
  const text = phrase[0].replace(/^в\s+/i, '')
  const patterns = timeFirst ? [TIME_DATE_RE, DATE_TIME_RE] : [DATE_TIME_RE, TIME_DATE_RE]
  for (const pattern of patterns) {
    const parts = text.match(pattern)?.groups
    if (!parts) continue
    const date = parseDate(parts.date, parts.time)
    if (date) return date
  }
  return null
}

export const moveDateMatch = (text: string) => [...text.matchAll(PHRASE_RE)].at(-1)

export const parseMoveDate = (text: string): MoveDate | null => {
  const match = moveDateMatch(text)
  return match ? parsePhrase(match) : null
}

export const parseLetterDates = (text: string) => [...text.matchAll(PHRASE_RE)]
  .map(parsePhrase).filter((date) => date !== null)

export const timeMinutes = (time: string) => {
  const [hours, minutes] = time.split(/[:.]/).map(Number)
  return hours * 60 + minutes
}
