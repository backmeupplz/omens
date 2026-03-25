import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { PROVIDERS } from '../helpers/providers'

export function createLLMClient(config: {
  provider: string
  model: string
  apiKey?: string | null
  baseUrl?: string | null
}) {
  const providerInfo = PROVIDERS[config.provider]
  const baseURL =
    config.baseUrl || providerInfo?.baseUrl || ''

  const provider = createOpenAICompatible({
    name: config.provider,
    baseURL,
    apiKey: config.apiKey || undefined,
  })

  return provider(config.model)
}
