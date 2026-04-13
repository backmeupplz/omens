import { useEffect, useState } from 'preact/hooks'
import type { ScoringFeed } from './hooks'

type CountdownFormat = 'mm:ss' | 'hm'

function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatHm(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function Countdown({
  targetMs,
  format = 'mm:ss',
  prefix,
  expiredLabel,
}: {
  targetMs: number
  format?: CountdownFormat
  prefix?: string
  expiredLabel?: string
}) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const diff = Math.max(0, Math.floor((targetMs - now) / 1000))

  if (diff <= 0) {
    if (expiredLabel) return <span>{expiredLabel}</span>
    return null
  }

  const text = format === 'hm' ? formatHm(diff) : formatMmSs(diff)
  return <span>{prefix}{text}</span>
}

export function FeedTabs({
  feeds,
  selectedFeedId,
  onSelect,
  action,
  footer,
  className = '',
  compact = false,
}: {
  feeds: ScoringFeed[]
  selectedFeedId: string | null
  onSelect: (feedId: string) => void
  action?: preact.ComponentChildren
  footer?: preact.ComponentChildren
  className?: string
  compact?: boolean
}) {
  if (feeds.length <= 1 && !action && !footer) return null
  const expanded = !!action || !!footer
  const hasTabs = feeds.length > 1
  const containerClass = compact
    ? `np-settings-feed-header ${className}`.trim()
    : `${expanded ? `np-inline-card flex flex-wrap items-center gap-3 ${hasTabs ? 'justify-between' : 'justify-end'}` : 'mb-2 flex items-center gap-2'} ${className}`.trim()
  const tabsClass = compact
    ? 'np-settings-feed-controls'
    : `flex min-w-0 flex-1 flex-wrap items-center ${expanded ? 'gap-2' : 'gap-1.5'}`

  return (
    <div class={containerClass}>
      {hasTabs ? (
        <div class={tabsClass}>
          {feeds.map((feed) => (
            <button
              key={feed.id}
              type="button"
              onClick={() => onSelect(feed.id)}
              class={compact
                ? `rounded-full border transition-colors ${selectedFeedId === feed.id ? 'np-control-active' : 'np-copy-muted'}`
                : expanded
                ? `rounded-full border px-3 py-1.5 text-xs transition-colors ${selectedFeedId === feed.id ? 'np-control-active' : 'np-copy-muted'}`
                : `rounded-full border px-2 py-0.5 text-[11px] transition-colors ${selectedFeedId === feed.id ? 'np-control-active' : 'np-copy-muted opacity-80 hover:opacity-100'}`}
            >
              <span class={compact ? '' : expanded ? 'mr-1.5' : 'mr-1'}>{feed.icon}</span>
              {feed.name}
            </button>
          ))}
        </div>
      ) : null}
      {action && <div class="shrink-0">{action}</div>}
      {footer && <div class="w-full">{footer}</div>}
    </div>
  )
}
