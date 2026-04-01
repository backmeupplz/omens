import { useEffect, useState } from 'preact/hooks'

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
