export function Spinner({ class: cls }: { class?: string }) {
  return (
    <div class={`flex items-center justify-center py-8 ${cls || ''}`}>
      <div class="h-5 w-5 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  )
}
