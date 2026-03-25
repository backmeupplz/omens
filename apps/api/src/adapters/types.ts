import type { RawItem } from '@omens/shared'

export interface SourceAdapter {
  type: string
  fetch(config: Record<string, unknown>, since?: Date): Promise<RawItem[]>
}
