import type { ChatMessage, LlmClient, LlmReply, ToolDef } from './types.ts'

type OpenAiConfig = { baseUrl: string; model: string; apiKey: string }

type OpenAiToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }

type OpenAiResponse = { choices: { message: { content: string | null; tool_calls?: OpenAiToolCall[] } }[] }

const toOpenAi = (message: ChatMessage) => {
  if (message.role === 'tool') return { role: 'tool', content: message.content, tool_call_id: message.toolCallId }
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      })),
    }
  }
  return { role: message.role, content: message.content }
}

export const createOpenAiLlm = ({ baseUrl, model, apiKey }: OpenAiConfig): LlmClient => ({
  chat: async (messages: ChatMessage[], tools: ToolDef[]): Promise<LlmReply> => {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: messages.map(toOpenAi),
        tools: tools.map((tool) => ({ type: 'function', function: tool })),
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`LLM ответил ${response.status}`)
    const { message } = ((await response.json()) as OpenAiResponse).choices[0]
    return {
      content: message.content,
      toolCalls: (message.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      })),
    }
  },
})
