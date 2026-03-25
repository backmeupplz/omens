import type { SourceAdapter } from './types'
import { redditAdapter } from './reddit'
import { twitterAdapter } from './twitter'

const adapters: Record<string, SourceAdapter> = {
  reddit: redditAdapter,
  twitter: twitterAdapter,
}

export function getAdapter(type: string): SourceAdapter | undefined {
  return adapters[type]
}

export function registerAdapter(adapter: SourceAdapter) {
  adapters[adapter.type] = adapter
}
