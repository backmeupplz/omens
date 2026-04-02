import { useEffect, useState } from 'preact/hooks'

const faces = [
  '( o.o )',
  '( o.o )',
  '( -.- )',
  '( o.o )',
  '( o.o )',
  '( ◔.◔ )',
  '( o.o )',
  '( o.o )',
  '( -.- )',
  '( o.o )',
  '( ˘.˘ )',
  '( ˘.˘ )',
]

export function Spinner({ class: cls }: { class?: string }) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % faces.length), 400)
    return () => clearInterval(id)
  }, [])

  return (
    <div class={`flex flex-col items-center justify-center py-8 select-none ${cls || ''}`}>
      <pre class="text-zinc-600 text-sm leading-tight font-mono">{`  /\\_/\\
 ${faces[frame]}
  > ^ <`}</pre>
    </div>
  )
}
