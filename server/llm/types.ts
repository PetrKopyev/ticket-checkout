type ToolCall = { id: string; name: string; arguments: string }

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: ToolCall[] }
  | { role: 'tool'; content: string; toolCallId: string }

export type ToolDef = { name: string; description: string; parameters: Record<string, unknown> }

export type LlmReply = { content: string | null; toolCalls: ToolCall[] }

export type LlmClient = { chat: (messages: ChatMessage[], tools: ToolDef[]) => Promise<LlmReply> }
