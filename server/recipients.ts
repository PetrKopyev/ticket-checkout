import type { DatabaseSync } from 'node:sqlite'

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const selectRecipients = (db: DatabaseSync, eventId: string): string[] => {
  const rows = db
    .prepare("SELECT email FROM purchases WHERE event_id = ? AND status = 'active'")
    .all(eventId) as { email: string }[]
  const emails = new Set(rows.map((row) => normalizeEmail(row.email)))
  return [...emails].sort((a, b) => a.localeCompare(b))
}
