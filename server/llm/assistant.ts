import type { DatabaseSync } from 'node:sqlite'
import { TOOLS, runTool } from './tools.ts'
import type { ChatMessage, LlmClient } from './types.ts'

const MAX_STEPS = 6

const SYSTEM_PROMPT = 'Ты помощник организатора мероприятий. По просьбе организатора готовишь черновик письма '
  + 'покупателям билетов: находишь мероприятие, проверяешь получателей и создаёшь черновик рассылки. '
  + 'Сам письма не отправляешь: отправку подтверждает организатор в интерфейсе. '
  + 'Если непонятно, о каком мероприятии речь, переспроси. Отвечай кратко и по-русски.'

type MessageRow = { role: 'user' | 'assistant' | 'tool'; content: string; tool_calls: string | null; tool_call_id: string | null }

const toMessage = (row: MessageRow): ChatMessage => {
  if (row.role === 'tool') return { role: 'tool', content: row.content, toolCallId: row.tool_call_id as string }
  if (row.role === 'assistant') {
    return { role: 'assistant', content: row.content || null, toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined }
  }
  return { role: 'user', content: row.content }
}

const loadMessages = (db: DatabaseSync) =>
  (db.prepare('SELECT role, content, tool_calls, tool_call_id FROM chat_messages ORDER BY id').all() as MessageRow[])
    .map(toMessage)

const saveMessage = (db: DatabaseSync, message: ChatMessage) => {
  const toolCalls = message.role === 'assistant' && message.toolCalls?.length ? JSON.stringify(message.toolCalls) : null
  db.prepare('INSERT INTO chat_messages (role, content, tool_calls, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(message.role, message.content ?? '', toolCalls, message.role === 'tool' ? message.toolCallId : null, new Date().toISOString())
}

export const getHistory = (db: DatabaseSync) =>
  db.prepare("SELECT role, content FROM chat_messages WHERE role IN ('user', 'assistant') AND content != '' ORDER BY id")
    .all() as { role: 'user' | 'assistant'; content: string }[]

export const sendAssistantMessage = async (db: DatabaseSync, llm: LlmClient, text: string) => {
  saveMessage(db, { role: 'user', content: text })
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...loadMessages(db)]
  let campaignId: number | null = null
  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await llm.chat(messages, TOOLS)
    const answer: ChatMessage = { role: 'assistant', content: reply.content, toolCalls: reply.toolCalls }
    saveMessage(db, answer)
    messages.push(answer)
    if (!reply.toolCalls.length) return { reply: reply.content ?? '', campaignId }
    for (const call of reply.toolCalls) {
      const result = runTool(db, call.name, call.arguments)
      if (call.name === 'create_draft_campaign' && 'campaign_id' in result) campaignId = result.campaign_id as number
      const message: ChatMessage = { role: 'tool', content: JSON.stringify(result), toolCallId: call.id }
      saveMessage(db, message)
      messages.push(message)
    }
  }
  const reply = 'Не получилось закончить за несколько шагов. Попробуйте сформулировать просьбу иначе.'
  saveMessage(db, { role: 'assistant', content: reply })
  return { reply, campaignId }
}
