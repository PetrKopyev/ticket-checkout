import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { getCampaign } from '../campaigns.ts'
import { openDb } from '../db.ts'
import { selectRecipients } from '../recipients.ts'
import { seed } from '../seed.ts'
import { getHistory, sendAssistantMessage } from './assistant.ts'
import { createFakeLlm } from './fake.ts'
import { TOOLS, runTool } from './tools.ts'
import type { LlmClient } from './types.ts'

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
    const emails = selectRecipients(db, 'ceramics').map((recipient) => recipient.email)
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
    expect(runTool(db, 'create_draft_campaign', '{"event_id":"fonts","subject":"","body":"x"}')).toHaveProperty('error')
    expect(runTool(db, 'send_campaign', '{}')).toHaveProperty('error')
  })

  it('считают получателей по уникальным email с действующими билетами', () => {
    expect(runTool(db, 'list_recipients', '{"event_id":"ceramics"}')).toEqual({
      count: 6,
      emails: selectRecipients(db, 'ceramics').map((recipient) => recipient.email),
    })
  })
})
