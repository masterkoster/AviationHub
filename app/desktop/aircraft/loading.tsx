export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="mb-4 h-8 w-32 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
              <div className="flex gap-1">
                <div className="h-7 w-7 animate-pulse rounded bg-muted" />
                <div className="h-7 w-7 animate-pulse rounded bg-muted" />
                <div className="h-7 w-7 animate-pulse rounded bg-muted" />
              </div>
            </div>
            <div className="mt-2 h-3 w-28 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
