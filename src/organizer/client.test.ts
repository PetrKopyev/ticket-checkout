import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, confirmCampaign, getCampaign, getLimits, includeRecipient, sendMessage, updateCampaign } from './client'

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

  it('досылает письмо исключённому адресу', async () => {
    const fetch = mockFetch(Response.json({ id: 1 }))
    await includeRecipient(1, 'a@example.com')
    expect(fetch).toHaveBeenCalledWith('/api/campaigns/1/include', {
      method: 'POST',
      body: '{"email":"a@example.com"}',
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('отдаёт текст ошибки досылки', async () => {
    mockFetch(Response.json({ error: 'Адрес не исключён' }, { status: 409 }))
    await expect(includeRecipient(1, 'a@example.com')).rejects.toThrow('Адрес не исключён')
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

  it('отдаёт номер рассылки из ответа с ошибкой', async () => {
    mockFetch(Response.json({ error: 'Ассистент сейчас недоступен', campaignId: 7 }, { status: 502 }))
    const error = await sendMessage('Перенос').catch((reason: ApiError) => reason)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ message: 'Ассистент сейчас недоступен', campaignId: 7 })
  })

  it('берёт лимиты с сервера', async () => {
    mockFetch(Response.json({ subject: 100, body: 1000 }))
    await expect(getLimits()).resolves.toEqual({ subject: 100, body: 1000 })
  })

  it('ошибка запроса лимитов не подменяется значениями по умолчанию', async () => {
    mockFetch(new Response('Not Found', { status: 404 }))
    await expect(getLimits()).rejects.toThrow('Ошибка 404')
  })
})
