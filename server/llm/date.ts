export const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const DATE_RE = /(\d+)\s+([а-яё]+)\s*,?\s*(?:в\s+)?(\d+:\d+)(?![\d:])/gi

type MoveDate = { day: number; month: string; time: string }

export const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()

export const eventTitle = (title: string) => title.match(/["“”„«»'‘’]([^"“”„«»'‘’]+)["“”„«»'‘’]/)?.[1] ?? title

export const mentions = (text: string, title: string) => {
  const lower = normalize(text)
  return normalize(eventTitle(title)).split(' ')
    .every((word) => lower.includes(word.length > 1 ? word.slice(0, -1) : word))
}

const parseDate = (match: RegExpMatchArray): MoveDate | null => {
  const day = Number(match[1])
  const month = match[2].toLowerCase()
  const [hours, minutes] = match[3].split(':').map(Number)
  if (day < 1 || day > DAYS[MONTHS.indexOf(month)] || !MONTHS.includes(month)
    || !/^\d{1,2}:\d{2}$/.test(match[3]) || hours > 23 || minutes > 59) return null
  return { day, month, time: match[3] }
}

export const moveDateMatch = (text: string) =>
  [...text.matchAll(new RegExp(`(?<![а-яё])на\\s+${DATE_RE.source}`, 'gi'))].at(-1)

export const parseMoveDate = (text: string): MoveDate | null => {
  const match = moveDateMatch(text)
  return match ? parseDate(match) : null
}

export const parseLetterDates = (text: string) => [...text.matchAll(DATE_RE)]
  .map(parseDate).filter((date) => date !== null)

export const timeMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}
