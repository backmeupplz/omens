export interface ParsedEmailSection {
  heading: string | null
  paragraphs: string[]
}

function stripRefs(value: string) {
  return value
    .replace(/\[\[(?:item|tweet):[^\]]+\]\]/g, '')
    .replace(/\\([^\\])/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function parseEmailReportContent(content: string): {
  title: string
  preview: string
  lead: string
  sections: ParsedEmailSection[]
} {
  const lines = content.split('\n')
  const sections: ParsedEmailSection[] = []
  let current: ParsedEmailSection = { heading: null, paragraphs: [] }

  const pushCurrent = () => {
    if (current.heading || current.paragraphs.length > 0) sections.push(current)
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const header = line.match(/^#{1,3}\s+(.+)$/)?.[1]?.trim()
    if (header) {
      pushCurrent()
      current = { heading: stripRefs(header), paragraphs: [] }
      continue
    }

    const bullet = line.match(/^[-*]\s+(.+)$/)?.[1] || line.match(/^\d+\.\s+(.+)$/)?.[1]
    const cleaned = stripRefs(bullet || line)
    if (!cleaned) continue

    current.paragraphs.push(bullet ? `• ${cleaned}` : cleaned)
  }

  pushCurrent()

  const filtered = sections
    .map((section) => ({
      heading: section.heading,
      paragraphs: section.paragraphs.slice(0, 4),
    }))
    .filter((section) => section.heading || section.paragraphs.length > 0)
    .slice(0, 6)

  const title = filtered.find((section) => section.heading)?.heading || 'Your latest Omens report'
  const lead = filtered
    .flatMap((section) => section.paragraphs)
    .find((paragraph) => paragraph.length > 20) || 'Your latest Omens report is ready.'
  const preview = lead

  return { title, preview, lead, sections: filtered }
}
