import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, confirmCampaign, getCampaign, getLimits, includeRecipient, resumeCampaign, sendMessage, updateCampaign } from './client'

const mockFetch = (response: Response, ...pages: Response[]) => {
  const responses = [response, ...pages]
  const fetch = vi.fn(async () => responses.shift() ?? Response.json({ items: [], total: 0 }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('client', () => {
  it.each(['get', 'update', 'confirm', 'resume', 'include'])('%s загружает все страницы получателей', async (action) => {
    const campaign = { id: 1, total: 101, excluded: 1, excludedEmails: ['excluded@example.com'] }
    const items = Array.from({ length: 102 }, (_, index) => ({
      email: `user${index}@example.com`, status: 'pending', error: null, excluded: index === 101,
    }))
    const fetch = mockFetch(
      Response.json(campaign),
      Response.json({ items: items.slice(0, 100), total: 102 }),
      Response.json({ items: items.slice(100), total: 102 }),
    )
    const result = await (action === 'get' ? getCampaign(1)
      : action === 'update' ? updateCampaign(1, { body: 'Текст' })
        : action === 'confirm' ? confirmCampaign(1, { subject: 'Перенос', body: 'Текст', excluded: [] })
          : action === 'resume' ? resumeCampaign(1) : includeRecipient(1, 'a@example.com'))
    expect(result).toEqual({ ...campaign, recipients: items })
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/campaigns/1/recipients?tab=all&limit=100&offset=0', {
      headers: { 'Content-Type': 'application/json' },
    })
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/campaigns/1/recipients?tab=all&limit=100&offset=100', {
      headers: { 'Content-Type': 'application/json' },
    })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('пустая рассылка получает пустую страницу', async () => {
    mockFetch(Response.json({ id: 1, total: 0, excluded: 0 }), Response.json({ items: [], total: 0 }))
    expect((await getCampaign(1)).recipients).toEqual([])
  })

  it('ошибка загрузки страницы передаётся вызывающему коду', async () => {
    mockFetch(Response.json({ id: 1 }), Response.json({ error: 'Рассылка не найдена' }, { status: 404 }))
    await expect(getCampaign(1)).rejects.toThrow('Рассылка не найдена')
  })

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
    await confirmCampaign(1, { subject: 'Перенос', body: 'Текст', excluded: ['anna@example.com'] })
    expect(fetch).toHaveBeenCalledWith('/api/campaigns/1/confirm', {
      method: 'POST',
      body: JSON.stringify({ subject: 'Перенос', body: 'Текст', excluded: ['anna@example.com'] }),
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

  it('отправляет email для досылки без нормализации', async () => {
    const fetch = mockFetch(Response.json({ id: 1 }))
    const email = ' Anna@Example.com '
    await includeRecipient(1, email)
    expect(fetch).toHaveBeenCalledWith('/api/campaigns/1/include', {
      method: 'POST',
      body: JSON.stringify({ email }),
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
