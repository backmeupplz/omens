import { type Db, aiReports } from '@omens/db'
import { getTimelineItemsByIds } from './timeline'

function parseItemRefs(itemRefs: string | null): string[] {
  if (!itemRefs) return []

  try {
    const parsed = JSON.parse(itemRefs)
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : []
  } catch {
    return itemRefs
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }
}

export async function hydrateReport(db: Db, report: typeof aiReports.$inferSelect) {
  const itemRefIds = parseItemRefs(report.itemRefs)
  const refItems = await getTimelineItemsByIds(itemRefIds)

  return {
    id: report.id,
    content: report.content,
    model: report.model,
    itemCount: report.itemCount,
    itemRefs: itemRefIds,
    refItems,
    createdAt: report.createdAt,
  }
}
