import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from './db.ts'
import { normalizeEmail, selectRecipients } from './recipients.ts'
import { resetDemo, seed } from './seed.ts'

let db: DatabaseSync

const emails = (eventId: string) => selectRecipients(db, eventId)

const addPurchase = (eventId: string, email: string, status: 'active' | 'cancelled') => {
  db.prepare('INSERT INTO purchases (event_id, buyer_name, email, status, qty) VALUES (?, ?, ?, ?, 1)')
    .run(eventId, 'Тест', email, status)
}

beforeEach(() => {
  db = openDb(':memory:')
  seed(db)
})

describe('normalizeEmail', () => {
  it('убирает пробелы и приводит к нижнему регистру', () => {
    expect(normalizeEmail('  Anna@Example.COM ')).toBe('anna@example.com')
  })
})

describe('selectRecipients', () => {
  it('точный список получателей для каждого мероприятия', () => {
    expect(emails('ceramics')).toEqual([
      'anna@example.com',
      'boris@example.com',
      'darya@example.com',
      'egor@example.com',
      'vera@example.com',
      'zoya@example.com',
    ])
    expect(emails('fonts')).toEqual([
      'darya@example.com',
      'gleb@example.com',
      'igor@example.com',
      'kira@example.com',
      'maria@example.com',
    ])
  })

  it('действующая покупка попадает, отменённая — нет', () => {
    addPurchase('ceramics', 'new@example.com', 'active')
    addPurchase('ceramics', 'gone@example.com', 'cancelled')
    expect(emails('ceramics')).toContain('new@example.com')
    expect(emails('ceramics')).not.toContain('gone@example.com')
  })

  it('регистр и пробелы в email сливаются в одного получателя', () => {
    expect(emails('ceramics').filter((email) => email === 'anna@example.com')).toHaveLength(1)
    expect(emails('fonts').filter((email) => email === 'kira@example.com')).toHaveLength(1)
  })

  it('две действующие покупки — один получатель', () => {
    expect(emails('ceramics').filter((email) => email === 'boris@example.com')).toHaveLength(1)
  })

  it('отменённая и действующая покупка — получатель', () => {
    expect(emails('ceramics')).toContain('vera@example.com')
  })

  it('только отменённые покупки — не получатель', () => {
    expect(emails('ceramics')).not.toContain('gleb@example.com')
    expect(emails('ceramics')).not.toContain('zhanna@example.com')
    expect(emails('fonts')).not.toContain('lev@example.com')
  })

  it('покупка другого мероприятия не попадает', () => {
    expect(emails('fonts')).not.toContain('anna@example.com')
    expect(emails('ceramics')).not.toContain('igor@example.com')
  })

  it('купивший оба мероприятия есть в обоих списках', () => {
    expect(emails('ceramics')).toContain('darya@example.com')
    expect(emails('fonts')).toContain('darya@example.com')
  })

  it('мероприятие без покупок — пустой список', () => {
    expect(selectRecipients(db, 'unknown')).toEqual([])
  })
})

describe('seed', () => {
  it('засевает 2 мероприятия и 20 покупок и не дублирует при повторе', () => {
    seed(db)
    expect(db.prepare('SELECT COUNT(*) AS n FROM events').get()).toEqual({ n: 2 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM purchases').get()).toEqual({ n: 20 })
  })

  it('resetDemo пересевает данные', () => {
    addPurchase('ceramics', 'new@example.com', 'active')
    resetDemo(db)
    expect(db.prepare('SELECT COUNT(*) AS n FROM purchases').get()).toEqual({ n: 20 })
  })
})
