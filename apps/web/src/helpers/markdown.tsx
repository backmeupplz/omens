import type { ComponentChildren } from 'preact'

export function parseBold(text: string, lineKey: number): ComponentChildren[] {
  const processed = text.replace(/\*\*(.+?)\*\*/g, '\x01$1\x02')
  const parts: ComponentChildren[] = []
  let last = 0
  for (let j = 0; j < processed.length; j++) {
    if (processed[j] === '\x01') {
      if (j > last) parts.push(processed.slice(last, j))
      const end = processed.indexOf('\x02', j + 1)
      if (end !== -1) {
        parts.push(<strong key={`${lineKey}-${j}`} class="text-zinc-100">{processed.slice(j + 1, end)}</strong>)
        last = end + 1
        j = end
      }
    }
  }
  if (last < processed.length) parts.push(processed.slice(last))
  return parts
}

export function renderMarkdownLine(line: string, i: number): ComponentChildren {
  const bold = (text: string) => parseBold(text, i)
  if (line.startsWith('### ')) return <h4 key={i} class="text-sm font-bold text-zinc-100 mt-3 mb-0.5">{bold(line.slice(4))}</h4>
  if (line.startsWith('## ')) return <h3 key={i} class="text-base font-bold text-zinc-100 mt-4 mb-0.5">{bold(line.slice(3))}</h3>
  if (line.startsWith('# ')) return <h2 key={i} class="text-lg font-bold text-zinc-100 mt-4 mb-1">{bold(line.slice(2))}</h2>
  if (line.match(/^[-*]\s/)) return <li key={i} class="text-sm text-zinc-300 ml-4 list-disc">{bold(line.slice(2))}</li>
  if (line.match(/^\d+\.\s/)) return <li key={i} class="text-sm text-zinc-300 ml-4 list-decimal">{bold(line.replace(/^\d+\.\s/, ''))}</li>
  if (line.trim() === '') return <div key={`br-${i}`} class="h-2" />
  return <p key={i} class="text-sm text-zinc-300 leading-relaxed">{bold(line)}</p>
}

export function renderMarkdown(text: string): ComponentChildren[] {
  return text.replace(/\\([^\\])/g, '$1').split('\n').map((line, i) => renderMarkdownLine(line, i))
}
