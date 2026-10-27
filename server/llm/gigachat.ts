import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { RequestOptions } from 'node:https'
import { rootCertificates } from 'node:tls'
import type { ChatMessage, LlmClient, LlmReply, ToolDef } from './types.ts'

type GigachatConfig = {
  authKey: string
  scope: string
  model: string
  authUrl?: string
  chatUrl?: string
  ca?: RequestOptions['ca']
}

type Token = { access_token: string; expires_at: number }
type GigachatResponse = {
  choices?: { message?: {
    content?: string | null
    function_call?: { name: string; arguments: Record<string, unknown> | string }
  } }[]
}

const parseArguments = (value: unknown): Record<string, unknown> => {
  try {
    const args = typeof value === 'string' ? JSON.parse(value) : value
    if (args && typeof args === 'object' && !Array.isArray(args)) return args
  } catch {
    throw new Error('GigaChat: аргументы функции должны быть объектом JSON')
  }
  throw new Error('GigaChat: аргументы функции должны быть объектом JSON')
}

const wrapArray = (content: string) => content.startsWith('[') ? JSON.stringify({ result: JSON.parse(content) }) : content

const toGigachat = (messages: ChatMessage[]) => {
  const calls = new Map<string, string>()
  return messages.flatMap((message): object[] => {
    if (message.role === 'tool') {
      const name = calls.get(message.toolCallId)
      return name ? [{ role: 'function', name, content: wrapArray(message.content) }] : []
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      const call = message.toolCalls[0]
      calls.set(call.id, call.name)
      return [{
        role: 'assistant',
        content: '',
        function_call: { name: call.name, arguments: parseArguments(call.arguments) },
      }]
    }
    return [{ role: message.role, content: message.content }]
  })
}

export const createGigachatLlm = ({
  authKey,
  scope,
  model,
  authUrl = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
  chatUrl = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
  ca,
}: GigachatConfig): LlmClient => {
  let certificates = ca
  let token: Token | undefined
  let tokenPromise: Promise<string> | undefined
  let callNumber = 0

  const getCa = () => {
    if (certificates === undefined) {
      try {
        certificates = [
          ...rootCertificates,
          readFileSync(new URL('../../certs/russian_trusted_root_ca.cer', import.meta.url), 'utf8'),
          readFileSync(new URL('../../certs/russian_trusted_sub_ca.cer', import.meta.url), 'utf8'),
        ]
      } catch {
        throw new Error('Не удалось загрузить сертификаты GigaChat')
      }
    }
    return certificates
  }

  const post = <T>(url: string, headers: Record<string, string>, body: string): Promise<T> =>
    new Promise((resolve, reject) => {
      const signal = AbortSignal.timeout(30_000)
      const fail = () => reject(new Error(signal.aborted
        ? 'GigaChat: время ожидания запроса истекло'
        : 'Не удалось выполнить запрос к GigaChat'))
      try {
        const target = new URL(url)
        if (target.protocol !== 'http:' && target.protocol !== 'https:') {
          throw new Error('Неподдерживаемый протокол GigaChat')
        }
        const request = target.protocol === 'http:' ? httpRequest : httpsRequest
        const req = request(target, {
          method: 'POST',
          headers,
          signal,
          ...(target.protocol === 'https:' ? { ca: getCa() } : {}),
        }, (response) => {
          const status = response.statusCode ?? 0
          response.on('error', fail)
          if (status < 200 || status >= 300) {
            response.resume()
            reject(new Error(`GigaChat ответил ${status}`))
            return
          }
          response.setEncoding('utf8')
          let data = ''
          response.on('data', (chunk: string) => { data += chunk })
          response.on('end', () => {
            try {
              resolve(JSON.parse(data) as T)
            } catch {
              reject(new Error('GigaChat вернул некорректный JSON'))
            }
          })
        })
        req.on('error', fail)
        req.end(body)
      } catch {
        fail()
      }
    })

  const getToken = async () => {
    if (token && Date.now() < token.expires_at - 60_000) return token.access_token
    if (!tokenPromise) {
      tokenPromise = post<Token>(authUrl, {
        Authorization: `Basic ${authKey}`,
        RqUID: randomUUID(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      }, new URLSearchParams({ scope }).toString()).then((result) => {
        if (!result || typeof result.access_token !== 'string' || !result.access_token) {
          throw new Error('GigaChat: в ответе OAuth нет access_token')
        }
        if (typeof result.expires_at !== 'number' || !Number.isFinite(result.expires_at)) {
          throw new Error('GigaChat: в ответе OAuth нет корректного expires_at')
        }
        token = result
        return token.access_token
      }).finally(() => { tokenPromise = undefined })
    }
    return tokenPromise
  }

  return {
    chat: async (messages: ChatMessage[], tools: ToolDef[]): Promise<LlmReply> => {
      const body = JSON.stringify({
        model,
        messages: toGigachat(messages),
        functions: tools.map(({ name, description, parameters }) => ({ name, description, parameters })),
        function_call: 'auto',
        temperature: 0,
      })
      const accessToken = await getToken()
      const result = await post<GigachatResponse>(chatUrl, {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }, body)
      const message = result?.choices?.[0]?.message
      if (!message || (message.content != null && typeof message.content !== 'string')) {
        throw new Error('GigaChat: в ответе нет корректного choices[0].message')
      }
      const call = message.function_call
      if (call && (typeof call.name !== 'string' || !call.name)) {
        throw new Error('GigaChat: в вызове функции нет имени')
      }
      return {
        content: message.content || null,
        toolCalls: call ? [{
          id: `call_${call.name}_${++callNumber}`,
          name: call.name,
          arguments: JSON.stringify(parseArguments(call.arguments)),
        }] : [],
      }
    },
  }
}
