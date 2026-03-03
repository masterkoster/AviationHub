'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Search } from 'lucide-react'

export default function LogbookLookupPage() {
  const [displayId, setDisplayId] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const lookup = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/logbook/lookup?displayId=${encodeURIComponent(displayId)}`)
      const data = await res.json()
      setResult(data)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Logbook Lookup</h1>
            <p className="text-sm text-muted-foreground">Find a shared logbook by reference ID</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Lookup by Reference ID</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="displayId">Reference ID</Label>
              <Input id="displayId" value={displayId} onChange={(e) => setDisplayId(e.target.value)} placeholder="LOG-1A2B3C4D" />
            </div>
            <Button onClick={lookup} disabled={loading || !displayId.trim()}>
              <Search className="w-4 h-4 mr-2" /> {loading ? 'Searching...' : 'Lookup'}
            </Button>

            {result && (
              <div className="mt-4 p-4 border border-border rounded-lg">
                {result.error ? (
                  <p className="text-sm text-destructive">{result.error}</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{result.profile?.name || 'Pilot'}</span>
                      <Badge variant="secondary">{result.displayId}</Badge>
                    </div>
                    {result.link ? (
                      <Button variant="outline" onClick={() => window.open(`/logbook/public/${result.link.token}`, '_blank')}>
                        View Shared Logbook
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">No active share links found.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
