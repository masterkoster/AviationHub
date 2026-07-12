export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 h-8 w-32 animate-pulse rounded bg-muted" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                <div className="h-3 w-36 animate-pulse rounded bg-muted" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-7 w-20 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
