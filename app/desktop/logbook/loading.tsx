export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 h-8 w-32 animate-pulse rounded bg-muted" />
      <div className="rounded-lg border border-border bg-card">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0"
          >
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="ml-auto h-4 w-12 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
