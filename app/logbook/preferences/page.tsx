'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RefreshCw, Copy, Download } from 'lucide-react'

export default function LogbookPreferencesPage() {
  const [displayId, setDisplayId] = useState('')
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

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

  const exportAudit = async (format: 'csv' | 'pdf') => {
    setExporting(true)
    try {
      const params = new URLSearchParams({ format })
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      const res = await fetch(`/api/logbook/history/export?${params.toString()}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `logbook_audit_${Date.now()}.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
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

        <Card>
          <CardHeader>
            <CardTitle>Audit Export</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Download a CSV or PDF audit report of your logbook changes.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">From</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">To</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
                />
              </div>
              <div className="flex items-end gap-2">
                <Button variant="outline" onClick={() => exportAudit('csv')} disabled={exporting}>
                  <Download className="w-4 h-4 mr-2" /> CSV
                </Button>
                <Button onClick={() => exportAudit('pdf')} disabled={exporting}>
                  <Download className="w-4 h-4 mr-2" /> PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
