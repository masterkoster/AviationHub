'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RefreshCw, Copy } from 'lucide-react'

export default function LogbookPreferencesPage() {
  const [displayId, setDisplayId] = useState('')
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/logbook/display-id')
      .then(r => r.json())
      .then(data => setDisplayId(data.displayId || ''))
      .finally(() => setLoading(false))
  }, [])

  const regenerate = async () => {
    setRegenerating(true)
    try {
      const res = await fetch('/api/logbook/display-id', { method: 'POST' })
      const data = await res.json()
      setDisplayId(data.displayId || '')
    } finally {
      setRegenerating(false)
    }
  }

  const copyId = async () => {
    if (!displayId) return
    await navigator.clipboard.writeText(displayId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Preferences</h1>
            <p className="text-sm text-muted-foreground">Configure your logbook settings</p>
          </div>
        </div>
      </div>
      
      <div className="px-6 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Logbook Reference ID</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Share this reference ID with others so they can look up your shared logbook (if you enable sharing).
              You can regenerate it anytime.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Label htmlFor="displayId">Reference ID</Label>
                <Input id="displayId" readOnly value={loading ? 'Loading...' : displayId} />
              </div>
              <Button variant="outline" onClick={copyId} disabled={!displayId}>
                <Copy className="w-4 h-4 mr-2" /> {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button onClick={regenerate} disabled={regenerating}>
                <RefreshCw className="w-4 h-4 mr-2" /> {regenerating ? 'Regenerating...' : 'Regenerate'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
