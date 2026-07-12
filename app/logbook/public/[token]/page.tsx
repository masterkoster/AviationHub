import { notFound } from 'next/navigation'

async function getSharedLogbook(token: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/logbook/public/${token}`, {
    cache: 'no-store'
  })
  if (!res.ok) return null
  return res.json()
}

export default async function PublicLogbookPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await getSharedLogbook(token)
  if (!data) return notFound()

  const { profile, entries, totals, scope } = data

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-foreground">{profile?.name || 'Pilot Logbook'}</h1>
          <p className="text-sm text-muted-foreground">Shared logbook view ({scope})</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {totals && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Total Time</p>
                <p className="font-semibold">{totals.totalTime?.toFixed(1)} hrs</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">PIC</p>
                <p className="font-semibold">{totals.picTime?.toFixed(1)} hrs</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Night</p>
                <p className="font-semibold">{totals.nightTime?.toFixed(1)} hrs</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Instrument</p>
                <p className="font-semibold">{totals.instrumentTime?.toFixed(1)} hrs</p>
              </div>
            </div>
          </div>
        )}

        {scope === 'public' && entries && (
          <div className="space-y-3">
            {entries.map((e: any) => (
              <div key={e.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{e.aircraft}</p>
                    <p className="text-sm text-muted-foreground">{e.routeFrom} → {e.routeTo}</p>
                    <p className="text-xs text-muted-foreground">{new Date(e.date).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{parseFloat(e.totalTime || 0).toFixed(1)} hrs</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {scope !== 'public' && (
          <div className="bg-card border border-border rounded-xl p-4 text-sm text-muted-foreground">
            This shared logbook is limited to {scope}.
          </div>
        )}
      </div>
    </div>
  )
}
