import { createFakeLlm } from './fake.ts'
import { createGigachatLlm } from './gigachat.ts'
import { createOpenAiLlm } from './openai.ts'
import type { LlmClient } from './types.ts'

type LlmEnv = Record<string, string | undefined>

export const providerName = (env: LlmEnv = process.env) => {
  if (env.GIGACHAT_AUTH_KEY || env.LLM_PROVIDER === 'gigachat') return 'gigachat'
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
    return createOpenAiLlm({
      baseUrl: env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
      model: env.LLM_MODEL ?? 'gpt-4o-mini',
      apiKey: env.LLM_API_KEY as string,
    })
  }
  return createFakeLlm()
}
