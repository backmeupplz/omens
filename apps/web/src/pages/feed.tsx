import { useState } from 'preact/hooks'
import { useApi } from '../helpers/hooks'

interface FeedSignal {
  signal: {
    id: string
    score: number
    summary: string
    tags: string[]
    createdAt: string
  }
  item: {
    id: string
    title: string
    content: string
    url: string
    author: string
    publishedAt: string
  }
  source: { type: string }
}

interface FeedResponse {
  data: FeedSignal[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

const SCORE_COLORS: Record<string, string> = {
  high: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  mid: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
}

function scoreColor(score: number) {
  if (score >= 70) return SCORE_COLORS.high
  if (score >= 40) return SCORE_COLORS.mid
  return SCORE_COLORS.low
}

export function Feed() {
  const [source, setSource] = useState('')
  const [minScore, setMinScore] = useState(0)
  const path = `/feed?limit=50${source ? `&source=${source}` : ''}${minScore ? `&minScore=${minScore}` : ''}`
  const { data, loading, error } = useApi<FeedResponse>(path)

  return (
    <div>
      <div class="mb-6 flex items-center gap-4">
        <h1 class="text-2xl font-bold">Feed</h1>
        <select
          class="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 border border-zinc-700"
          value={source}
          onChange={(e) => setSource((e.target as HTMLSelectElement).value)}
        >
          <option value="">All sources</option>
          <option value="reddit">Reddit</option>
          <option value="twitter">Twitter</option>
          <option value="rss">RSS</option>
        </select>
        <label class="flex items-center gap-2 text-sm text-zinc-400">
          Min score
          <input
            type="range"
            min="0"
            max="100"
            step="10"
            value={minScore}
            onInput={(e) =>
              setMinScore(Number((e.target as HTMLInputElement).value))
            }
            class="w-24"
          />
          <span class="w-8 text-zinc-300">{minScore}</span>
        </label>
      </div>

      {loading && <p class="text-zinc-500">Loading...</p>}
      {error && <p class="text-red-400">{error}</p>}

      {data?.data.length === 0 && !loading && (
        <p class="text-zinc-500">
          No signals yet. Add sources in Settings to get started.
        </p>
      )}

      <div class="flex flex-col gap-3">
        {data?.data.map((entry) => (
          <a
            key={entry.signal.id}
            href={entry.item.url}
            target="_blank"
            rel="noopener"
            class="block rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors"
          >
            <div class="flex items-start gap-3">
              <span
                class={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-mono font-bold ${scoreColor(entry.signal.score)}`}
              >
                {entry.signal.score}
              </span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                    {entry.source.type}
                  </span>
                  <span class="text-xs text-zinc-500">
                    {entry.item.author}
                  </span>
                </div>
                <h3 class="font-medium text-zinc-100 truncate">
                  {entry.item.title}
                </h3>
                <p class="mt-1 text-sm text-zinc-400 line-clamp-2">
                  {entry.signal.summary}
                </p>
                {entry.signal.tags.length > 0 && (
                  <div class="mt-2 flex gap-1.5">
                    {entry.signal.tags.map((tag) => (
                      <span
                        key={tag}
                        class="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
