import type { DatabaseSync } from 'node:sqlite'

export type Recipient = { email: string; buyerName: string; qty: number }

type PurchaseRow = { buyer_name: string; email: string; qty: number }

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const selectRecipients = (db: DatabaseSync, eventId: string): Recipient[] => {
  const rows = db
    .prepare("SELECT buyer_name, email, qty FROM purchases WHERE event_id = ? AND status = 'active' ORDER BY id")
    .all(eventId) as PurchaseRow[]
  const byEmail = new Map<string, Recipient>()
  rows.forEach((row) => {
    const email = normalizeEmail(row.email)
    const recipient = byEmail.get(email)
    if (recipient) recipient.qty += row.qty
    else byEmail.set(email, { email, buyerName: row.buyer_name, qty: row.qty })
  })
  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email))
}
