import { afterEach, describe, expect, it, vi } from 'vitest'
import { confirmCampaign, getCampaign, updateCampaign } from './client'

const mockFetch = (response: Response) => {
  const fetch = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('client', () => {
  it('отдаёт текст ошибки сервера', async () => {
    mockFetch(Response.json({ error: 'Рассылка уже отправлена' }, { status: 409 }))
    await expect(getCampaign(1)).rejects.toThrow('Рассылка уже отправлена')
  })

  it('при теле не в JSON пишет код ответа', async () => {
    mockFetch(new Response('Bad Gateway', { status: 502 }))
    await expect(getCampaign(1)).rejects.toThrow('Ошибка 502')
  })

  it('отправляет JSON в POST', async () => {
    const fetch = mockFetch(Response.json({ id: 1 }))
    await confirmCampaign(1)
    expect(fetch).toHaveBeenCalledWith('/api/campaigns/1/confirm', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('отправляет JSON в PATCH', async () => {
    const fetch = mockFetch(Response.json({ id: 1 }))
    await updateCampaign(1, { subject: 'Перенос' })
    expect(fetch).toHaveBeenCalledWith('/api/campaigns/1', {
      method: 'PATCH',
      body: '{"subject":"Перенос"}',
      headers: { 'Content-Type': 'application/json' },
    })
  })
})
