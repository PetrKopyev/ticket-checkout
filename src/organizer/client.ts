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
  recipients: Recipient[]
}

export type CampaignPatch = { subject?: string; body?: string; excluded?: string[] }

export type OutboxItem = { id: number; campaignId: number; email: string; subject: string; sentAt: string }

export type Limits = { subject: number; body: number }

export const defaultLimits: Limits = { subject: 200, body: 5000 }

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

export const getLimits = () => request<Limits>('/limits').catch(() => defaultLimits)

export const listCampaigns = () => request<CampaignSummary[]>('/campaigns')

export const getCampaign = (id: number) => request<Campaign>(`/campaigns/${id}`)

export const updateCampaign = (id: number, patch: CampaignPatch) =>
  request<Campaign>(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

export const confirmCampaign = (id: number) => post<Campaign>(`/campaigns/${id}/confirm`)

export const resumeCampaign = (id: number) => post<Campaign>(`/campaigns/${id}/resume`)

export const getOutbox = () => request<OutboxItem[]>('/outbox')

export const getDemo = () => request<{ mailerDown: boolean }>('/demo')

export const setMailerDown = (down: boolean) => post<{ mailerDown: boolean }>('/demo/mailer', { down })

export const resetDemo = () => post<{ ok: true }>('/demo/reset')
