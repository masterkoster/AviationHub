'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Copy, Link2, Plus, RefreshCw, Trash2, Eye } from 'lucide-react'

export default function LogbookSharePage() {
  const [links, setLinks] = useState<any[]>([])
  const [displayId, setDisplayId] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('')
  const [scope, setScope] = useState('public')
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/logbook/sharing')
      const data = await res.json()
      setLinks(data.links || [])
      setDisplayId(data.displayId || '')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const createLink = async () => {
    setCreating(true)
    try {
      await fetch('/api/logbook/sharing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, scope })
      })
      setLabel('')
      setScope('public')
      load()
    } finally {
      setCreating(false)
    }
  }

  const revokeLink = async (id: string) => {
    await fetch('/api/logbook/sharing', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    })
    load()
  }

  const copyId = async () => {
    if (!displayId) return
    await navigator.clipboard.writeText(displayId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const regenerateId = async () => {
    setRegenerating(true)
    try {
      const res = await fetch('/api/logbook/display-id', { method: 'POST' })
      const data = await res.json()
      setDisplayId(data.displayId || '')
    } finally {
      setRegenerating(false)
    }
  }

  const scopeLabel = (s: string) => {
    if (s === 'totals') return 'Totals'
    if (s === 'endorsements') return 'Endorsements'
    return 'Full Logbook'
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Share Logbook</h1>
            <p className="text-sm text-muted-foreground">Create share links and manage reference ID</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Reference ID</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Share this reference ID for lookup. You can regenerate it anytime.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Label htmlFor="displayId">Reference ID</Label>
                <Input id="displayId" readOnly value={loading ? 'Loading...' : displayId} />
              </div>
              <Button variant="outline" onClick={copyId} disabled={!displayId}>
                <Copy className="w-4 h-4 mr-2" /> {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button onClick={regenerateId} disabled={regenerating}>
                <RefreshCw className="w-4 h-4 mr-2" /> {regenerating ? 'Regenerating...' : 'Regenerate'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create Share Link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="label">Label (optional)</Label>
                <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Instructor Review" />
              </div>
              <div>
                <Label htmlFor="scope">Scope</Label>
                <select id="scope" value={scope} onChange={(e) => setScope(e.target.value)} className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm">
                  <option value="public">Full Logbook</option>
                  <option value="totals">Totals Only</option>
                  <option value="endorsements">Endorsements Only</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button onClick={createLink} disabled={creating} className="gap-2">
                  <Plus className="w-4 h-4" /> {creating ? 'Creating...' : 'Create Link'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active Share Links</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-muted-foreground">Loading...</div>
            ) : links.length === 0 ? (
              <div className="text-muted-foreground">No links created yet.</div>
            ) : (
              <div className="space-y-3">
                {links.map((link) => (
                  <div key={link.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{link.label || 'Share Link'}</span>
                        <Badge variant="secondary">{scopeLabel(link.scope)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Created: {new Date(link.createdAt).toLocaleDateString()}</p>
                      {link.revokedAt && (
                        <p className="text-xs text-destructive">Revoked</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => window.open(`/logbook/public/${link.token}`, '_blank')}>
                        <Eye className="w-4 h-4 mr-1" /> View
                      </Button>
                      {!link.revokedAt && (
                        <Button variant="destructive" size="sm" onClick={() => revokeLink(link.id)}>
                          <Trash2 className="w-4 h-4 mr-1" /> Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
