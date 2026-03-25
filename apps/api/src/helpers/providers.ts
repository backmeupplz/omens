export interface ProviderInfo {
  name: string
  baseUrl: string
  models: { id: string; name: string; contextWindow: number }[]
  requiresApiKey: boolean
}

export const PROVIDERS: Record<string, ProviderInfo> = {
  fireworks: {
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    models: [
      {
        id: 'accounts/fireworks/models/kimi-k2p5',
        name: 'Kimi K2.5',
        contextWindow: 262144,
      },
      {
        id: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
        name: 'Llama 3.1 70B',
        contextWindow: 131072,
      },
    ],
    requiresApiKey: true,
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000 },
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
    ],
    requiresApiKey: true,
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      {
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        contextWindow: 200000,
      },
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        contextWindow: 200000,
      },
    ],
    requiresApiKey: true,
  },
  ollama: {
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    models: [],
    requiresApiKey: false,
  },
  custom: {
    name: 'Custom OpenAI-Compatible',
    baseUrl: '',
    models: [],
    requiresApiKey: false,
  },
}
