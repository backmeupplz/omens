import { NewspaperRouteControls, NewspaperShell } from './newspaper-shell'
import { Spinner } from './spinner'

type FeedRoute = 'report' | 'filtered' | 'feed' | 'settings'

function LoadMore({ remaining, loading, onLoad }: { remaining: number; loading: boolean; onLoad: () => void }) {
  if (remaining <= 0) return null
  return (
    <div class="mt-6 flex justify-center">
      <button
        type="button"
        onClick={onLoad}
        disabled={loading}
        class="np-button np-button-secondary disabled:opacity-50"
      >
        {loading ? (
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
            Loading...
          </span>
        ) : (
          `Load more (${remaining} remaining)`
        )}
      </button>
    </div>
  )
}

function EndOfFeed() {
  return (
    <div class="mt-10 mb-6 flex flex-col items-center select-none">
      <pre class="np-copy-muted text-[10px] leading-tight font-mono">{`
        .  *  .  *  .
     *                *
    .    _________    .
    *   /         \\   *
    .  |  () _ ()  |  .
    *  |    (_)    |  *
    .   \\_________/   .
     *                *
        .  *  .  *  .
      `}</pre>
      <p class="np-copy-muted text-xs mt-2">You've seen all the omens.</p>
    </div>
  )
}

export function FeedLeadArticle({ children }: { children: preact.ComponentChildren }) {
  return (
    <div class="np-page-grid">
      <article class="np-article np-article-lead">
        {children}
      </article>
    </div>
  )
}

export function NewspaperFeedShell({
  current,
  showSettings = true,
  rightControls,
  toast,
  loading,
  error,
  hasTweets,
  emptyState,
  remaining,
  loadingMore,
  onLoadMore,
  children,
}: {
  current: FeedRoute
  showSettings?: boolean
  rightControls?: preact.ComponentChildren
  toast?: preact.ComponentChildren
  loading: boolean
  error?: preact.ComponentChildren
  hasTweets: boolean
  emptyState?: preact.ComponentChildren
  remaining: number
  loadingMore: boolean
  onLoadMore: () => void
  children: preact.ComponentChildren
}) {
  return (
    <NewspaperShell
      leftControls={<NewspaperRouteControls current={current} showSettings={showSettings} />}
      rightControls={rightControls}
      showMeta={false}
    >
      {toast && (
        <div class="np-toast">
          {toast}
        </div>
      )}
      {error}
      {!hasTweets && !loading && emptyState}
      {children}
      {loading && <Spinner />}
      <LoadMore remaining={remaining} loading={loadingMore} onLoad={onLoadMore} />
      {remaining === 0 && hasTweets && !loading && <EndOfFeed />}
    </NewspaperShell>
  )
}
