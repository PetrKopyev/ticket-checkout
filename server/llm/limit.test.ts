import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLimitedBody } from './limit.ts'
import { createOpenAiLlm } from './openai.ts'

afterEach(() => vi.unstubAllGlobals())

describe('readLimitedBody', () => {
  it('собирает UTF-8, разделённый между чанками', async () => {
    const bytes = Buffer.from('Керамика')
    expect(await readLimitedBody(Readable.from([bytes.subarray(0, 1), bytes.subarray(1)]))).toBe('Керамика')
  })

  it('принимает ровно 1 МБ', async () => {
    const body = 'я'.repeat(512 * 1024)
    expect(await readLimitedBody(Readable.from([Buffer.from(body)]))).toBe(body)
  })

  it('считает байты всех чанков и прерывает поток при превышении', async () => {
    const body = Readable.from([Buffer.alloc(1024 * 1024), Buffer.from('я'), Buffer.from('лишний чанк')])
    await expect(readLimitedBody(body)).rejects.toThrow('LLM: ответ слишком большой')
    expect(body.destroyed).toBe(true)
  })

  it('сохраняет сообщение об ограничении провайдера', async () => {
    await expect(readLimitedBody(Readable.from([Buffer.alloc(1024 * 1024 + 1)]), 'GigaChat: ответ слишком большой'))
      .rejects.toThrow('GigaChat: ответ слишком большой')
  })
})

describe('OpenAI', () => {
  const llm = createOpenAiLlm({ baseUrl: 'http://llm.test', model: 'test', apiKey: 'test' })

  it('читает JSON из потока ответа', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: 'Готово' } }] })))
    expect(await llm.chat([], [])).toEqual({ content: 'Готово', toolCalls: [] })
  })

  it('отклоняет ответ больше 1 МБ', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('я'.repeat(512 * 1024 + 1))))
    await expect(llm.chat([], [])).rejects.toThrow('LLM: ответ слишком большой')
  })
})
