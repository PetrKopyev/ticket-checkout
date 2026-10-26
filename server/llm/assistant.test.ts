import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { getCampaign } from '../campaigns.ts'
import { openDb } from '../db.ts'
import { selectRecipients } from '../recipients.ts'
import { seed } from '../seed.ts'
import { LlmFailedError, getHistory, sendAssistantMessage } from './assistant.ts'
import { createFakeLlm } from './fake.ts'
import { TOOLS, runTool } from './tools.ts'
import type { ChatMessage, LlmClient } from './types.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
  seed(db)
})

describe('assistant', () => {
  it('готовит черновик о переносе с датой из просьбы', async () => {
    const { reply, campaignId } = await sendAssistantMessage(
      db,
      createFakeLlm(),
      'Перенеси мастер-класс по керамике на 20 ноября, 19:00 и напиши покупателям',
    )
    const campaign = getCampaign(db, campaignId as number)
    const emails = selectRecipients(db, 'ceramics')
    expect(campaign?.eventId).toBe('ceramics')
    expect(campaign?.status).toBe('draft')
    expect(campaign?.recipients.map((recipient) => recipient.email)).toEqual(emails)
    expect(campaign?.body).toContain('20 ноября')
    expect(campaign?.body).toContain('19:00')
    expect(reply).toContain(String(emails.length))
  })

  it('пишет вызовы инструментов в историю, а наружу отдаёт только реплики', async () => {
    await sendAssistantMessage(db, createFakeLlm(), 'Лекция про шрифт переносится на 27 ноября, 18:30')
    const roles = (db.prepare('SELECT role FROM chat_messages').all() as { role: string }[]).map((row) => row.role)
    expect(roles.filter((role) => role === 'tool')).toHaveLength(3)
    expect(getHistory(db).map((message) => message.role)).toEqual(['user', 'assistant'])
  })

  it('просит уточнить мероприятие, если не понял какое', async () => {
    const { reply, campaignId } = await sendAssistantMessage(db, createFakeLlm(), 'Напиши всем, что всё переносится')
    expect(campaignId).toBeNull()
    expect(reply).toContain('Уточните')
    expect(db.prepare('SELECT COUNT(*) AS count FROM campaigns').get()).toEqual({ count: 0 })
  })

  it('ошибка инструмента попадает в историю и в ответ, следующий запрос работает', async () => {
    db.exec("CREATE TRIGGER broken BEFORE INSERT ON campaigns BEGIN SELECT RAISE(ABORT, 'диск полон'); END")
    const failed = await sendAssistantMessage(db, createFakeLlm(), 'Перенеси мастер-класс по керамике на 20 ноября, 19:00')
    expect(failed).toEqual({ reply: 'Не получилось создать черновик: Инструмент завершился с ошибкой', campaignId: null })
    const tools = db.prepare("SELECT content FROM chat_messages WHERE role = 'tool'").all() as { content: string }[]
    expect(JSON.parse(tools[2].content)).toEqual({ error: 'Инструмент завершился с ошибкой' })

    db.exec('DROP TRIGGER broken')
    const { campaignId } = await sendAssistantMessage(db, createFakeLlm(), 'Перенеси мастер-класс по керамике на 20 ноября, 19:00')
    expect(getCampaign(db, campaignId as number)?.total).toBe(6)
  })

  it('создаёт не больше одного черновика за ход', async () => {
    const args = JSON.stringify({ event_id: 'ceramics', subject: 'Тема', body: 'Текст' })
    let step = 0
    const greedy: LlmClient = {
      chat: async () => step++ === 0
        ? { content: null, toolCalls: [1, 2].map((n) => ({ id: `call_${n}`, name: 'create_draft_campaign', arguments: args })) }
        : { content: 'Готово', toolCalls: [] },
    }
    const { campaignId } = await sendAssistantMessage(db, greedy, 'Сделай два черновика')
    expect(db.prepare('SELECT id FROM campaigns').all()).toEqual([{ id: campaignId }])
    const tools = db.prepare("SELECT content FROM chat_messages WHERE role = 'tool' ORDER BY id").all() as { content: string }[]
    expect(JSON.parse(tools[1].content)).toEqual({ error: 'Черновик в этом ответе уже создан' })
  })

  it('отдаёт в LLM последние 20 сообщений без оторванных ответов инструментов', async () => {
    const insert = db.prepare("INSERT INTO chat_messages (role, content, tool_calls, tool_call_id, created_at) VALUES (?, ?, ?, ?, '')")
    for (let n = 0; n < 9; n++) {
      insert.run('user', `Вопрос ${n}`, null, null)
      insert.run('assistant', '', JSON.stringify([{ id: `call_${n}`, name: 'list_events', arguments: '{}' }]), null)
      insert.run('tool', '[]', null, `call_${n}`)
    }
    let seen: ChatMessage[] = []
    await sendAssistantMessage(db, { chat: async (messages) => { seen = [...messages]; return { content: 'Ок', toolCalls: [] } } }, 'Привет')
    expect(seen[0].role).toBe('system')
    expect(seen[1]).toEqual({ role: 'user', content: 'Вопрос 3' })
    expect(seen).toHaveLength(20)
    expect(seen.at(-1)).toEqual({ role: 'user', content: 'Привет' })
    expect(db.prepare('SELECT COUNT(*) AS n FROM chat_messages').get()).toEqual({ n: 29 })
  })

  it('падение LLM после черновика сообщает id черновика', async () => {
    const fake = createFakeLlm()
    let step = 0
    const flaky: LlmClient = {
      chat: async (messages, tools) => {
        if (step++ === 3) throw new Error('LLM ответил 500')
        return fake.chat(messages, tools)
      },
    }
    const error = await sendAssistantMessage(db, flaky, 'Перенеси мастер-класс по керамике на 20 ноября, 19:00')
      .catch((error: unknown) => error)
    const { id } = db.prepare('SELECT id FROM campaigns').get() as { id: number }
    expect(error).toBeInstanceOf(LlmFailedError)
    expect(error).toMatchObject({ campaignId: id })
  })

  it('останавливается после шести шагов', async () => {
    let calls = 0
    const looping: LlmClient = {
      chat: async () => {
        calls++
        return { content: null, toolCalls: [{ id: `call_${calls}`, name: 'list_events', arguments: '{}' }] }
      },
    }
    const { campaignId } = await sendAssistantMessage(db, looping, 'Привет')
    expect(calls).toBe(6)
    expect(campaignId).toBeNull()
  })
})

describe('tools', () => {
  it('не умеют отправлять и подтверждать', () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual([
      'list_events',
      'get_event',
      'list_recipients',
      'create_draft_campaign',
    ])
  })

  it('возвращают ошибку на неверные аргументы', () => {
    expect(runTool(db, 'get_event', 'не json')).toHaveProperty('error')
    expect(runTool(db, 'get_event', '{"event_id":"nope"}')).toHaveProperty('error')
    expect(runTool(db, 'list_recipients', '{}')).toHaveProperty('error')
    expect(runTool(db, 'create_draft_campaign', '{"event_id":"fonts","subject":"","body":"x"}'))
      .toEqual({ error: 'Тема не может быть пустой' })
    expect(runTool(db, 'create_draft_campaign', '{"event_id":"fonts","subject":"x"}'))
      .toEqual({ error: 'Тема и текст письма должны быть строками' })
    expect(runTool(db, 'create_draft_campaign', JSON.stringify({ event_id: 'fonts', subject: 'а'.repeat(201), body: 'x' })))
      .toEqual({ error: 'Тема длиннее 200 символов' })
    expect(runTool(db, 'create_draft_campaign', JSON.stringify({ event_id: 'fonts', subject: 'x', body: 'а'.repeat(5001) })))
      .toEqual({ error: 'Текст длиннее 5000 символов' })
    expect(db.prepare('SELECT COUNT(*) AS n FROM campaigns').get()).toEqual({ n: 0 })
    expect(runTool(db, 'send_campaign', '{}')).toHaveProperty('error')
  })

  it('считают получателей по уникальным email и не раскрывают адреса', () => {
    expect(runTool(db, 'list_recipients', '{"event_id":"ceramics"}')).toEqual({ count: 6 })
  })
})
