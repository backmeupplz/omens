import { useLayoutEffect } from 'preact/hooks'
import { Link } from 'wouter-preact'

let newspaperActiveUsers = 0
let pendingNewspaperCleanup: number | null = null

function setNewspaperClass(active: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('newspaper-active', active)
}

function acquireNewspaperMode() {
  if (typeof window !== 'undefined' && pendingNewspaperCleanup !== null) {
    window.cancelAnimationFrame(pendingNewspaperCleanup)
    pendingNewspaperCleanup = null
  }
  newspaperActiveUsers += 1
  setNewspaperClass(true)

  return () => {
    newspaperActiveUsers = Math.max(0, newspaperActiveUsers - 1)
    if (newspaperActiveUsers !== 0 || typeof window === 'undefined') return

    pendingNewspaperCleanup = window.requestAnimationFrame(() => {
      pendingNewspaperCleanup = null
      if (newspaperActiveUsers === 0) setNewspaperClass(false)
    })
  }
}

export function useNewspaperActive(enabled = true) {
  useLayoutEffect(() => {
    if (!enabled) return
    return acquireNewspaperMode()
  }, [enabled])
}

export function NewspaperShell({
  leftControls,
  rightControls,
  metaRow,
  showMeta = true,
  subtitle = 'Your AI-Curated Morning Briefing',
  children,
}: {
  leftControls?: preact.ComponentChildren
  rightControls?: preact.ComponentChildren
  metaRow?: preact.ComponentChildren
  showMeta?: boolean
  subtitle?: preact.ComponentChildren
  children: preact.ComponentChildren
}) {
  return (
    <div class="newspaper np-outer">
      <div class="np-masthead">
        <Link href="/" class="np-masthead-title np-masthead-home">
          The Daily Omens
        </Link>
        <div class="np-masthead-subrow">
          {leftControls ? (
            <div class="np-masthead-left-controls">
              {leftControls}
            </div>
          ) : (
            <div aria-hidden="true" />
          )}
          <div class="np-masthead-sub">{subtitle}</div>
          {rightControls ? (
            <div class="np-masthead-controls">
              {rightControls}
            </div>
          ) : (
            <div aria-hidden="true" />
          )}
        </div>
        {showMeta && (
          <>
            <div class="np-masthead-rule" />
            {metaRow}
          </>
        )}
      </div>
      {children}
    </div>
  )
}

export function NewspaperRouteControls({
  current,
  showSettings = true,
}: {
  current: 'report' | 'filtered' | 'feed' | 'settings'
  showSettings?: boolean
}) {
  return (
    <>
      <Link href="/" class={current === 'report' ? 'np-control-active' : ''} title="AI Report">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
      </Link>
      <Link href="/filtered" class={current === 'filtered' ? 'np-control-active' : ''} title="AI-Filtered Feed">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
        </svg>
      </Link>
      <Link href="/feed" class={current === 'feed' ? 'np-control-active' : ''} title="All Posts">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
        </svg>
      </Link>
      {showSettings && (
        <Link href="/settings" class={current === 'settings' ? 'np-control-active' : ''} title="Settings">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
      )}
    </>
  )
}
