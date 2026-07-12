'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Loader2, Megaphone, Pin, PinOff, Trash2, Plus, X } from 'lucide-react'
import type { Post } from './types'
import { formatDateTime } from './utils'

function sortPosts(posts: Post[]) {
  return [...posts].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

interface AnnouncementsFeedProps {
  groupId: string
  posts: Post[]
  loading: boolean
  error: string | null
  canManage: boolean
  currentUserId: string | null
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>
}

export function AnnouncementsFeed({ groupId, posts, loading, error, canManage, currentUserId, setPosts }: AnnouncementsFeedProps) {
  const [showCompose, setShowCompose] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [pinned, setPinned] = useState(false)
  const [saving, setSaving] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleCreate() {
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    setComposeError(null)
    try {
      const res = await fetch(`/api/groups/${groupId}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content, pinned }),
      })
      const data = await res.json()
      if (!res.ok) {
        setComposeError(data.error || 'Failed to post announcement')
        return
      }
      setPosts(prev => sortPosts([data, ...prev]))
      setTitle('')
      setContent('')
      setPinned(false)
      setShowCompose(false)
    } catch {
      setComposeError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function togglePin(post: Post) {
    setBusyId(post.id)
    try {
      const res = await fetch(`/api/groups/${groupId}/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !post.pinned }),
      })
      if (!res.ok) return
      const data = await res.json()
      setPosts(prev => sortPosts(prev.map(p => (p.id === post.id ? data : p))))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(post: Post) {
    setBusyId(post.id)
    try {
      const res = await fetch(`/api/groups/${groupId}/posts/${post.id}`, { method: 'DELETE' })
      if (!res.ok) return
      setPosts(prev => prev.filter(p => p.id !== post.id))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Announcements</CardTitle>
          </div>
          {canManage && (
            <Button size="sm" variant={showCompose ? 'outline' : 'default'} onClick={() => setShowCompose(v => !v)}>
              {showCompose ? <><X className="mr-2 h-4 w-4" />Cancel</> : <><Plus className="mr-2 h-4 w-4" />New Post</>}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showCompose && canManage && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
            <Textarea
              placeholder="What's the news?"
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={4}
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={pinned} onCheckedChange={setPinned} />
                Pin to top
              </label>
              <Button size="sm" onClick={handleCreate} disabled={saving || !title.trim() || !content.trim()}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Posting…</> : 'Post Announcement'}
              </Button>
            </div>
            {composeError && <p className="text-sm text-destructive">{composeError}</p>}
          </div>
        )}

        {loading && <p className="text-sm text-muted-foreground">Loading announcements…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && posts.length === 0 && (
          <p className="text-sm text-muted-foreground">No announcements yet.</p>
        )}

        <div className="space-y-3">
          {posts.map(post => {
            const canDelete = canManage || post.author?.id === currentUserId
            const isBusy = busyId === post.id
            return (
              <div key={post.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{post.title}</p>
                      {post.pinned && <Badge variant="default" className="text-xs">Pinned</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{post.content}</p>
                    <p className="text-xs text-muted-foreground">
                      {post.author?.name || 'Unknown'} · {formatDateTime(post.createdAt)}
                    </p>
                  </div>
                  {(canManage || canDelete) && (
                    <div className="flex items-center gap-1 shrink-0">
                      {canManage && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={isBusy}
                          onClick={() => togglePin(post)}
                          title={post.pinned ? 'Unpin' : 'Pin'}
                        >
                          {post.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          disabled={isBusy}
                          onClick={() => handleDelete(post)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
