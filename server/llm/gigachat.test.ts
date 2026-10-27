import { createServer } from 'node:http'
import type { IncomingHttpHeaders, Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGigachatLlm } from './gigachat.ts'
import { createLlm, providerName } from './select.ts'
import type { ChatMessage, ToolDef } from './types.ts'

type CapturedRequest = { method?: string; path?: string; headers: IncomingHttpHeaders; body: string }

const authKey = 'test-auth-key'
const accessToken = 'test-access-token'
const messages: ChatMessage[] = [{ role: 'user', content: 'Привет' }]
const tools: ToolDef[] = [{ name: 'list_events', description: 'Мероприятия', parameters: { type: 'object' } }]

let server: Server
let baseUrl: string
let requests: CapturedRequest[]
let authStatus: number
let chatStatus: number
let authBody: unknown
let chatBody: unknown

const startServer = async () => {
  requests = []
  authStatus = 200
  chatStatus = 200
  authBody = { access_token: accessToken, expires_at: Date.now() + 3_600_000 }
  chatBody = { choices: [{ message: { content: 'Привет!' } }] }
  server = createServer((req, res) => {
    req.setEncoding('utf8')
    let body = ''
    req.on('data', (chunk: string) => { body += chunk })
    req.on('end', () => {
      requests.push({ method: req.method, path: req.url, headers: req.headers, body })
      const auth = req.url === '/oauth'
      const responseBody = auth ? authBody : chatBody
      res.writeHead(auth ? authStatus : chatStatus, { 'Content-Type': 'application/json' })
      res.end(typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody))
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Не удалось запустить тестовый сервер')
  baseUrl = `http://127.0.0.1:${address.port}`
}

const stopServer = async () => {
  vi.restoreAllMocks()
  if (!server.listening) return
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

const client = (scope = 'GIGACHAT_API_PERS') => createGigachatLlm({
  authKey,
  scope,
  model: 'GigaChat',
  authUrl: `${baseUrl}/oauth`,
  chatUrl: `${baseUrl}/chat`,
})

const oauthRequests = () => requests.filter((request) => request.path === '/oauth')
const chatRequests = () => requests.filter((request) => request.path === '/chat')

describe('GigaChat', () => {
  beforeEach(startServer)
  afterEach(stopServer)

  it('передаёт сообщения, функции и параметры чата', async () => {
    const history: ChatMessage[] = [
      { role: 'system', content: 'Ты помощник' },
      ...messages,
      { role: 'assistant', content: 'Сейчас проверю' },
      { role: 'assistant', content: null, toolCalls: [{ id: 'first', name: 'list_events', arguments: '{"limit":2}' }] },
      { role: 'tool', toolCallId: 'first', content: '[{"id":"ceramics"}]' },
    ]
    expect(await client().chat(history, tools)).toEqual({ content: 'Привет!', toolCalls: [] })
    const request = chatRequests()[0]
    expect(request.method).toBe('POST')
    expect(request.headers.authorization).toBe(`Bearer ${accessToken}`)
    expect(request.headers['content-type']).toBe('application/json')
    expect(JSON.parse(request.body)).toEqual({
      model: 'GigaChat',
      messages: [
        { role: 'system', content: 'Ты помощник' },
        ...messages,
        { role: 'assistant', content: 'Сейчас проверю' },
        { role: 'assistant', content: '', function_call: { name: 'list_events', arguments: { limit: 2 } } },
        { role: 'function', name: 'list_events', content: '{"result":[{"id":"ceramics"}]}' },
      ],
      functions: tools,
      function_call: 'auto',
      temperature: 0,
    })
  })

  it('оставляет первый вызов из каждой реплики и пропускает результаты остальных', async () => {
    await client().chat([
      { role: 'tool', toolCallId: 'future', content: '{}' },
      {
        role: 'assistant', content: 'Проверяю', toolCalls: [
          { id: 'first', name: 'list_events', arguments: '{}' },
          { id: 'second', name: 'get_event', arguments: '{"id":"ceramics"}' },
        ],
      },
      { role: 'tool', toolCallId: 'second', content: '{"id":"ceramics"}' },
      { role: 'tool', toolCallId: 'first', content: '[]' },
      { role: 'assistant', content: null, toolCalls: [{ id: 'future', name: 'list_recipients', arguments: '{}' }] },
      { role: 'tool', toolCallId: 'future', content: '{"count":6}' },
    ], tools)
    expect(JSON.parse(chatRequests()[0].body).messages).toEqual([
      { role: 'assistant', content: '', function_call: { name: 'list_events', arguments: {} } },
      { role: 'function', name: 'list_events', content: '{"result":[]}' },
      { role: 'assistant', content: '', function_call: { name: 'list_recipients', arguments: {} } },
      { role: 'function', name: 'list_recipients', content: '{"count":6}' },
    ])
  })

  it('разбирает объект и строку аргументов, создаёт id и игнорирует functions_state_id', async () => {
    const llm = client()
    for (const [index, args] of [{ limit: 2 }, '{"limit":2}'].entries()) {
      chatBody = { choices: [{ message: {
        content: '',
        function_call: { name: 'list_events', arguments: args },
        functions_state_id: 'ignored',
      } }], functions_state_id: 'also-ignored' }
      expect(await llm.chat(messages, tools)).toEqual({
        content: null,
        toolCalls: [{ id: `call_list_events_${index + 1}`, name: 'list_events', arguments: '{"limit":2}' }],
      })
    }
    expect((await client().chat(messages, tools)).toolCalls[0].id).toBe('call_list_events_1')
  })

  it('передаёт заголовки OAuth, UUID и scope в форме', async () => {
    await client('scope + test').chat(messages, tools)
    const request = oauthRequests()[0]
    expect(request.method).toBe('POST')
    expect(request.headers.authorization).toBe(`Basic ${authKey}`)
    expect(request.headers.rquid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(request.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(request.headers.accept).toBe('application/json')
    expect(request.body).toBe('scope=scope+%2B+test')
  })

  it('кеширует токен между последовательными и одновременными запросами', async () => {
    const llm = client()
    await Promise.all([llm.chat(messages, tools), llm.chat(messages, tools)])
    await llm.chat(messages, tools)
    expect(oauthRequests()).toHaveLength(1)
    expect(chatRequests()).toHaveLength(3)
  })

  it('обновляет токен за минуту до истечения срока', async () => {
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    authBody = { access_token: accessToken, expires_at: now + 120_000 }
    const llm = client()
    await llm.chat(messages, tools)
    clock.mockReturnValue(now + 59_999)
    await llm.chat(messages, tools)
    expect(oauthRequests()).toHaveLength(1)
    clock.mockReturnValue(now + 60_000)
    authBody = { access_token: 'renewed-test-token', expires_at: now + 3_600_000 }
    await llm.chat(messages, tools)
    expect(oauthRequests()).toHaveLength(2)
    expect(chatRequests()[2].headers.authorization).toBe('Bearer renewed-test-token')
  })

  it('повторяет OAuth, если полученный токен уже истёк', async () => {
    authBody = { access_token: accessToken, expires_at: Date.now() - 1 }
    const llm = client()
    await llm.chat(messages, tools)
    await llm.chat(messages, tools)
    expect(oauthRequests()).toHaveLength(2)
  })

  it.each(['oauth', 'chat'])('обрабатывает 401 на %s без ключа, токена и тела в ошибке', async (endpoint) => {
    const secretBody = `${authKey} ${accessToken}`
    if (endpoint === 'oauth') {
      authStatus = 401
      authBody = secretBody
    } else {
      chatStatus = 401
      chatBody = secretBody
    }
    const error = await client().chat(messages, tools).catch((error: Error) => error)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('GigaChat ответил 401')
    expect(String(error)).not.toContain(authKey)
    expect(String(error)).not.toContain(accessToken)
  })

  it.each(['oauth', 'chat'])('обрабатывает не-JSON на %s без тела в ошибке', async (endpoint) => {
    if (endpoint === 'oauth') authBody = `${authKey} ${accessToken}`
    else chatBody = `${authKey} ${accessToken}`
    await expect(client().chat(messages, tools)).rejects.toThrow('GigaChat вернул некорректный JSON')
  })

  it.each([{}, { choices: [] }, { choices: [{}] }, null])('отклоняет ответ без сообщения: %j', async (body) => {
    chatBody = body
    await expect(client().chat(messages, tools)).rejects.toThrow('GigaChat: в ответе нет корректного choices[0].message')
  })

  it.each([{}, { access_token: '' }, { access_token: 123 }, null])('отклоняет OAuth без токена: %j', async (body) => {
    authBody = body
    await expect(client().chat(messages, tools)).rejects.toThrow('GigaChat: в ответе OAuth нет access_token')
    expect(chatRequests()).toHaveLength(0)
  })

  it('отклоняет OAuth без срока действия токена', async () => {
    authBody = { access_token: accessToken }
    await expect(client().chat(messages, tools)).rejects.toThrow('GigaChat: в ответе OAuth нет корректного expires_at')
  })

  it('сбрасывает promise после ошибки OAuth и позволяет повторить запрос', async () => {
    const llm = client()
    authStatus = 401
    const results = await Promise.allSettled([llm.chat(messages, tools), llm.chat(messages, tools)])
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected'])
    expect(oauthRequests()).toHaveLength(1)
    authStatus = 200
    await expect(llm.chat(messages, tools)).resolves.toEqual({ content: 'Привет!', toolCalls: [] })
    expect(oauthRequests()).toHaveLength(2)
  })

  it.each([{ args: `invalid ${authKey} ${accessToken}` }, { args: null }, { args: [] }])('отклоняет неверные аргументы без их содержимого в ошибке: %j', async ({ args }) => {
    chatBody = { choices: [{ message: { function_call: { name: 'list_events', arguments: args } } }] }
    await expect(client().chat(messages, tools)).rejects.toThrow('GigaChat: аргументы функции должны быть объектом JSON')
  })

  it('не передаёт неверные аргументы из истории в ошибку', async () => {
    await expect(client().chat([{
      role: 'assistant', content: null,
      toolCalls: [{ id: 'invalid', name: 'list_events', arguments: `invalid ${authKey}` }],
    }], tools)).rejects.toThrow('GigaChat: аргументы функции должны быть объектом JSON')
    expect(requests).toHaveLength(0)
  })

  it('задаёт таймаут 30 секунд и безопасно сообщает об отмене запроса', async () => {
    const signal = AbortSignal.abort()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal)
    await expect(client().chat(messages, tools)).rejects.toThrow('GigaChat: время ожидания запроса истекло')
    expect(timeout).toHaveBeenCalledWith(30_000)
  })
})

describe('выбор LLM', () => {
  it.each([
    [{}, 'fake'],
    [{ LLM_API_KEY: 'test-openai-key' }, 'openai'],
    [{ GIGACHAT_AUTH_KEY: authKey }, 'gigachat'],
    [{ LLM_PROVIDER: 'gigachat', GIGACHAT_AUTH_KEY: authKey }, 'gigachat'],
    [{ GIGACHAT_AUTH_KEY: authKey, LLM_API_KEY: 'test-openai-key' }, 'gigachat'],
    [{ GIGACHAT_AUTH_KEY: authKey, LLM_PROVIDER: 'openai' }, 'gigachat'],
  ])('выбирает %j → %s без сети', (env, expected) => {
    expect(providerName(env)).toBe(expected)
    expect(createLlm(env).chat).toBeTypeOf('function')
  })

  it('останавливает запуск, если GigaChat выбран без ключа', () => {
    const env = { LLM_PROVIDER: 'gigachat', LLM_API_KEY: 'test-openai-key' }
    expect(providerName(env)).toBe('gigachat')
    expect(() => createLlm(env)).toThrow('Для GigaChat задайте GIGACHAT_AUTH_KEY')
    expect(() => createLlm({ LLM_PROVIDER: 'gigachat', GIGACHAT_AUTH_KEY: '' })).toThrow('GIGACHAT_AUTH_KEY')
  })

  it('по умолчанию возвращает работающую имитацию', async () => {
    expect(await createLlm({}).chat(messages, tools)).toEqual({
      content: null,
      toolCalls: [{ id: 'call_list_events', name: 'list_events', arguments: '{}' }],
    })
  })
})
