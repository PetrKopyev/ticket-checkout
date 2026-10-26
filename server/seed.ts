import type { DatabaseSync } from 'node:sqlite'
import { transaction } from './db.ts'

const EVENTS = [
  { id: 'ceramics', title: 'Мастер-класс "Керамика"', startsAt: '2026-11-13T19:00', place: 'Москва' },
  { id: 'fonts', title: 'Лекция "История шрифта"', startsAt: '2026-11-20T19:00', place: 'Москва' },
]

const PURCHASES: [eventId: string, buyerName: string, email: string, status: 'active' | 'cancelled', qty: number][] = [
  ['ceramics', 'Анна Смирнова', 'anna@example.com', 'active', 2],
  ['ceramics', 'Анна Смирнова', ' Anna@Example.com ', 'active', 1],
  ['ceramics', 'Борис Петров', 'boris@example.com', 'active', 1],
  ['ceramics', 'Борис Петров', 'boris@example.com', 'active', 2],
  ['ceramics', 'Вера Козлова', 'vera@example.com', 'cancelled', 1],
  ['ceramics', 'Вера Козлова', 'VERA@example.com', 'active', 1],
  ['ceramics', 'Глеб Орлов', 'gleb@example.com', 'cancelled', 2],
  ['ceramics', 'Глеб Орлов', 'gleb@example.com', 'cancelled', 1],
  ['ceramics', 'Дарья Волкова', 'darya@example.com', 'active', 1],
  ['ceramics', 'Егор Соколов', 'egor@example.com', 'active', 3],
  ['ceramics', 'Жанна Лебедева', 'zhanna@example.com', 'cancelled', 1],
  ['ceramics', 'Зоя Новикова', 'zoya@example.com', 'active', 1],
  ['fonts', 'Дарья Волкова', 'Darya@example.com', 'active', 1],
  ['fonts', 'Игорь Морозов', 'igor@example.com', 'active', 2],
  ['fonts', 'Кира Павлова', 'kira@example.com', 'active', 1],
  ['fonts', 'Кира Павлова', '  kira@example.com', 'active', 1],
  ['fonts', 'Лев Фёдоров', 'lev@example.com', 'cancelled', 1],
  ['fonts', 'Мария Алексеева', 'maria@example.com', 'cancelled', 1],
  ['fonts', 'Мария Алексеева', 'maria@example.com', 'active', 2],
  ['fonts', 'Глеб Орлов', 'gleb@example.com', 'active', 1],
]

const insertData = (db: DatabaseSync) => {
  const insertEvent = db.prepare('INSERT INTO events (id, title, starts_at, place) VALUES (?, ?, ?, ?)')
  const insertPurchase = db.prepare(
    'INSERT INTO purchases (event_id, buyer_name, email, status, qty) VALUES (?, ?, ?, ?, ?)',
  )
  EVENTS.forEach((event) => insertEvent.run(event.id, event.title, event.startsAt, event.place))
  PURCHASES.forEach((purchase) => insertPurchase.run(...purchase))
}

export const seed = (db: DatabaseSync): void => {
  if (db.prepare('SELECT 1 FROM events LIMIT 1').get()) return
  transaction(db, () => insertData(db))
}

export const resetDemo = (db: DatabaseSync): void => {
  transaction(db, () => {
    db.exec(`
      DELETE FROM deliveries;
      DELETE FROM campaigns;
      DELETE FROM outbox;
      DELETE FROM chat_messages;
      DELETE FROM purchases;
      DELETE FROM events;
      INSERT INTO settings (key, value) VALUES ('mailer_down', '0')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `)
    insertData(db)
  })
}
