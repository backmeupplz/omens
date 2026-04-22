import type { TimelineItem } from '../helpers/timeline'

export type EmailReportLine =
  | { type: 'text'; line: string }
  | { type: 'item'; item?: TimelineItem }

export type EmailReportBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; entries: string[] }
  | { type: 'item'; item?: TimelineItem }

export interface ParsedEmailSection {
  heading: string | null
  headerLevel: number
  blocks: EmailReportBlock[]
}

function normalizeItemRefId(value: string) {
  return value.trim()
}

function stripRefs(value: string) {
  return value.replace(/\[\[(?:item|tweet):[^\]]+\]\]/g, '')
}

function stripMarkdown(value: string) {
  return stripRefs(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1$2')
    .replace(/(^|[^_])_([^_]+)_(?!_)/g, '$1$2')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/\\([^\\])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function buildBlocks(lines: EmailReportLine[]): EmailReportBlock[] {
  const blocks: EmailReportBlock[] = []
  let paragraphLines: string[] = []
  let listEntries: string[] = []
  let listOrdered: boolean | null = null

  const flushParagraph = () => {
    const text = paragraphLines.join(' ').trim()
    if (text) blocks.push({ type: 'paragraph', text })
    paragraphLines = []
  }

  const flushList = () => {
    if (listEntries.length > 0 && listOrdered !== null) {
      blocks.push({ type: 'list', ordered: listOrdered, entries: listEntries })
    }
    listEntries = []
    listOrdered = null
  }

  const flushText = () => {
    flushParagraph()
    flushList()
  }

  for (const line of lines) {
    if (line.type === 'item') {
      flushText()
      blocks.push({ type: 'item', item: line.item })
      continue
    }

    const trimmed = line.line.trim()
    if (!trimmed) {
      flushText()
      continue
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/)
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/)
    if (unordered || ordered) {
      const orderedList = !!ordered
      const entry = stripMarkdown((ordered || unordered)?.[1] || '')
      if (!entry) continue
      flushParagraph()
      if (listOrdered !== null && listOrdered !== orderedList) flushList()
      listOrdered = orderedList
      listEntries.push(entry)
      continue
    }

    flushList()
    const cleaned = stripMarkdown(trimmed)
    if (!cleaned) continue
    paragraphLines.push(cleaned)
  }

  flushText()
  return blocks
}

function summarizeTimelineItem(item: TimelineItem | undefined) {
  if (!item) return ['Referenced post is no longer available.']

  if (item.provider === 'x') {
    const payload = item.payload
    const lines = [`X post by ${payload.authorName} (@${payload.authorHandle})`]
    if (payload.content.trim()) lines.push(stripMarkdown(payload.content))
    const stats = [
      payload.replies > 0 ? `${payload.replies} replies` : '',
      payload.retweets > 0 ? `${payload.retweets} reposts` : '',
      payload.likes > 0 ? `${payload.likes} likes` : '',
      payload.views > 0 ? `${payload.views} views` : '',
    ].filter(Boolean)
    if (stats.length > 0) lines.push(stats.join(' • '))
    lines.push(`Open: ${payload.url}`)
    return lines
  }

  if (item.provider === 'reddit') {
    const payload = item.payload
    const lines = [`Reddit post from r/${payload.subreddit}`]
    lines.push(stripMarkdown(payload.title))
    if (payload.body?.trim()) lines.push(stripMarkdown(payload.body))
    const stats = [
      payload.score > 0 ? `${payload.score} score` : '',
      payload.commentCount > 0 ? `${payload.commentCount} comments` : '',
    ].filter(Boolean)
    if (stats.length > 0) lines.push(stats.join(' • '))
    lines.push(`Open: ${payload.url}`)
    return lines
  }

  if (item.provider === 'rss') {
    const payload = item.payload
    const lines = [`RSS post from ${payload.feedTitle || payload.domain || 'feed'}`]
    lines.push(stripMarkdown(payload.title))
    if (payload.body?.trim()) lines.push(stripMarkdown(payload.body))
    lines.push(`Open: ${payload.permalink}`)
    return lines
  }

  const payload = item.payload
  const lines = [`Telegram post from @${payload.channelUsername}`]
  if (payload.channelTitle) lines.push(stripMarkdown(payload.channelTitle))
  if (payload.content?.trim()) {
    lines.push(stripMarkdown(payload.content))
  } else if (payload.linkUrl) {
    lines.push(stripMarkdown(payload.linkUrl))
  }
  const stats = [
    payload.viewCount > 0 ? `${payload.viewCount} views` : '',
    payload.postType ? payload.postType : '',
  ].filter(Boolean)
  if (stats.length > 0) lines.push(stats.join(' • '))
  lines.push(`Open: ${payload.permalink}`)
  return lines
}

export function parseEmailReportContent(content: string, refItems: TimelineItem[]): {
  title: string
  preview: string
  lead: string
  sections: ParsedEmailSection[]
} {
  const refItemMap = new Map(refItems.map((item) => [item.id, item] as const))
  const lines = content.replace(/\\([^\\])/g, '$1').split('\n')
  const sections: Array<{ heading: string | null; headerLevel: number; lines: EmailReportLine[] }> = []
  let current = { heading: null as string | null, headerLevel: 0, lines: [] as EmailReportLine[] }

  const pushCurrent = () => {
    if (current.heading || current.lines.length > 0) sections.push(current)
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    const header = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (header) {
      pushCurrent()
      current = {
        heading: stripMarkdown(header[2]),
        headerLevel: header[1].length,
        lines: [],
      }
      continue
    }

    const itemMatch = trimmed.match(/\[\[(?:item|tweet):([^\]]+)\]\]/)
    if (itemMatch) {
      current.lines.push({
        type: 'item',
        item: refItemMap.get(normalizeItemRefId(itemMatch[1])) || undefined,
      })
      continue
    }

    current.lines.push({ type: 'text', line: rawLine })
  }

  pushCurrent()

  const parsedSections = sections
    .map((section) => {
      const blocks = buildBlocks(section.lines)
      const seen = new Set<string>()
      const deduped: EmailReportBlock[] = []
      for (const block of blocks) {
        if (block.type === 'item') {
          const key = block.item?.id || ''
          if (key && seen.has(key)) continue
          if (key) seen.add(key)
        }
        deduped.push(block)
      }
      return {
        heading: section.heading,
        headerLevel: section.headerLevel,
        blocks: deduped,
      }
    })
    .filter((section) => section.heading || section.blocks.length > 0)

  const title = parsedSections.find((section) => section.heading)?.heading || 'Your latest Omens report'
  const lead = parsedSections
    .flatMap((section) => section.blocks)
    .find((block): block is Extract<EmailReportBlock, { type: 'paragraph' }> => block.type === 'paragraph' && block.text.length > 20)
    ?.text || 'Your latest Omens report is ready.'
  const preview = lead

  return {
    title,
    preview,
    lead,
    sections: parsedSections,
  }
}

export function renderPlainTextReportEmail(params: {
  reportContent: string
  reportUrl: string
  unsubscribeUrl: string
  feedName: string
  dateLabel: string
  refItems: TimelineItem[]
}) {
  const parsed = parseEmailReportContent(params.reportContent, params.refItems)
  const lines: string[] = [`${params.feedName} • ${params.dateLabel}`, '']

  for (const section of parsed.sections) {
    if (section.heading) lines.push(section.heading)

    for (const block of section.blocks) {
      if (block.type === 'paragraph') {
        lines.push(block.text)
        continue
      }

      if (block.type === 'list') {
        lines.push(...block.entries.map((entry, index) => (
          block.ordered ? `${index + 1}. ${entry}` : `• ${entry}`
        )))
        continue
      }

      lines.push(...summarizeTimelineItem(block.item))
    }

    lines.push('')
  }

  lines.push(`Read online: ${params.reportUrl}`)
  lines.push(`Unsubscribe: ${params.unsubscribeUrl}`)

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
