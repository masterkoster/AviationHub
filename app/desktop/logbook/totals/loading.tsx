export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 h-8 w-32 animate-pulse rounded bg-muted" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-8 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
