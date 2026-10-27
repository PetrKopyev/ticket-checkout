export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type CampaignStatus = 'draft' | 'sending' | 'completed' | 'partial'

export type CampaignSummary = {
  id: number
  eventTitle: string
  subject: string
  status: CampaignStatus
  total: number
  sent: number
}

export type Recipient = {
  email: string
  status: 'pending' | 'sent' | 'failed'
  error: string | null
  excluded: boolean
}

export type Campaign = {
  id: number
  eventId: string
  eventTitle: string
  startsAt: string
  subject: string
  body: string
  status: CampaignStatus
  total: number
  sent: number
  failed: number
  pending: number
  excluded: number
  excludedEmails: string[]
  recipients: Recipient[]
}

export type CampaignPatch = { subject?: string; body?: string; excluded?: string[] }

export type OutboxItem = { id: number; campaignId: number; email: string; subject: string; sentAt: string }

export type Limits = { subject: number; body: number }

export class ApiError extends Error {
  campaignId: number | null

  constructor(message: string, campaignId: number | null) {
    super(message)
    this.campaignId = campaignId
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new ApiError(data?.error ?? `Ошибка ${response.status}`, data?.campaignId ?? null)
  }
  return response.json()
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })

export const getHistory = () => request<ChatMessage[]>('/assistant/history')

export const sendMessage = (text: string) =>
  post<{ reply: string; campaignId: number | null }>('/assistant/message', { text })

export const getLimits = () => request<Limits>('/limits')

export const listCampaigns = () => request<CampaignSummary[]>('/campaigns')

// TODO: окно «Получатели» грузит страницы само, полный список не нужен
const withRecipients = async (campaign: Omit<Campaign, 'recipients'>): Promise<Campaign> => {
  const recipients: Recipient[] = []
  let total = 0
  do {
    const page = await request<{ items: Recipient[]; total: number }>(
      `/campaigns/${campaign.id}/recipients?tab=all&limit=100&offset=${recipients.length}`,
    )
    recipients.push(...page.items)
    total = page.total
  } while (recipients.length < total)
  return { ...campaign, recipients }
}

export const getCampaign = (id: number) => request<Omit<Campaign, 'recipients'>>(`/campaigns/${id}`).then(withRecipients)

export const updateCampaign = (id: number, patch: CampaignPatch) =>
  request<Omit<Campaign, 'recipients'>>(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }).then(withRecipients)

export const confirmCampaign = (id: number, shown: Required<CampaignPatch>) =>
  post<Omit<Campaign, 'recipients'>>(`/campaigns/${id}/confirm`, shown).then(withRecipients)

export const resumeCampaign = (id: number) => post<Omit<Campaign, 'recipients'>>(`/campaigns/${id}/resume`).then(withRecipients)

export const includeRecipient = (id: number, email: string) =>
  post<Omit<Campaign, 'recipients'>>(`/campaigns/${id}/include`, { email }).then(withRecipients)

export const getOutbox = () => request<OutboxItem[]>('/outbox')

export const getDemo = () => request<{ mailerDown: boolean }>('/demo')

export const setMailerDown = (down: boolean) => post<{ mailerDown: boolean }>('/demo/mailer', { down })

export const resetDemo = () => post<{ ok: true }>('/demo/reset')
