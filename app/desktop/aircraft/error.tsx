'use client'

export default function AircraftError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
        <h2 className="text-base font-semibold">Something went wrong</h2>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={reset}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
