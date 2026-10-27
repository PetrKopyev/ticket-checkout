import { createFakeLlm } from './fake.ts'
import { createGigachatLlm } from './gigachat.ts'
import { createOpenAiLlm } from './openai.ts'
import type { LlmClient } from './types.ts'

type LlmEnv = Record<string, string | undefined>

export const providerName = (env: LlmEnv = process.env) => {
  const provider = env.LLM_PROVIDER?.trim().toLowerCase()
  if (provider) {
    if (provider === 'gigachat' || provider === 'openai' || provider === 'fake') return provider
    throw new Error('Неизвестный LLM_PROVIDER: выберите gigachat, openai или fake')
  }
  if (env.GIGACHAT_AUTH_KEY) return 'gigachat'
  return env.LLM_API_KEY ? 'openai' : 'fake'
}

export const createLlm = (env: LlmEnv = process.env): LlmClient => {
  const provider = providerName(env)
  if (provider === 'gigachat') {
    if (!env.GIGACHAT_AUTH_KEY) throw new Error('Для GigaChat задайте GIGACHAT_AUTH_KEY')
    return createGigachatLlm({
      authKey: env.GIGACHAT_AUTH_KEY,
      scope: env.GIGACHAT_SCOPE ?? 'GIGACHAT_API_PERS',
      model: env.GIGACHAT_MODEL ?? 'GigaChat',
    })
  }
  if (provider === 'openai') {
    if (!env.LLM_API_KEY) throw new Error('Для OpenAI задайте LLM_API_KEY')
    return createOpenAiLlm({
      baseUrl: env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
      model: env.LLM_MODEL ?? 'gpt-4o-mini',
      apiKey: env.LLM_API_KEY,
    })
  }
  return createFakeLlm()
}
