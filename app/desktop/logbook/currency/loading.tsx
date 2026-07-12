export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="mb-4 h-8 w-32 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-2 w-full animate-pulse rounded bg-muted" />
            <div className="mt-1 h-2 w-3/4 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
