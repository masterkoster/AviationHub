'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plane, Users, Calendar, Loader2, ArrowRight, Copy, Check } from "lucide-react"
import ReactMarkdown from 'react-markdown'

interface PublicInvite {
  valid: boolean
  role: string
  email: string | null
  expiresAt: string | null
  group: {
    id: string
    name: string
    description: string | null
    type: string
    logoUrl: string | null
    bannerUrl: string | null
    memberCount: number
    aircraft: { id: string; nNumber: string; make: string | null; model: string | null; nickname: string | null; status: string | null }[]
    recentPosts: { id: string; title: string; excerpt: string; authorName: string | null; createdAt: string }[]
  }
}

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [data, setData] = useState<PublicInvite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinSuccess, setJoinSuccess] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    params.then(p => setToken(p.token))
  }, [params])

  useEffect(() => {
    if (!token) return
    setLoading(true)
    setError(null)

    fetch(`/api/invite/${encodeURIComponent(token)}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) { setError(d.error || 'Failed to load invite'); return }
        setData(d)
      })
      .catch(() => setError('Network error — could not load invite'))
      .finally(() => setLoading(false))
  }, [token])

  async function handleJoin() {
    if (!data || !token) return
    setJoining(true)
    setJoinError(null)

    try {
      const res = await fetch(`/api/groups/${data.group.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (res.status === 401) {
          // Need to sign in first
          router.push(`/login?callbackUrl=/join/${token}`)
          return
        }
        setJoinError(d.error || 'Failed to join')
        return
      }
      setJoinSuccess(true)
      setTimeout(() => router.push(`/desktop/flying-club`), 1500)
    } catch {
      setJoinError('Network error')
    } finally {
      setJoining(false)
    }
  }

  // ---- Loading ----
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading invite…</p>
        </div>
      </div>
    )
  }

  // ---- Error ----
  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-md mx-4 text-center">
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
            <div className="flex justify-center mb-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10">
                <Plane className="h-7 w-7 text-destructive" />
              </div>
            </div>
            <h2 className="text-lg font-bold mb-2">Invite Not Found</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {error || 'This invite link is invalid or has expired.'}
            </p>
            <p className="text-xs text-muted-foreground">
              Contact the club owner to request a new invitation.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const { group } = data

  // ---- Successfully joined ----
  if (joinSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-md mx-4 text-center">
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
            <div className="flex justify-center mb-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10">
                <Check className="h-7 w-7 text-emerald-500" />
              </div>
            </div>
            <h2 className="text-lg font-bold mb-2">Welcome to {group.name}!</h2>
            <p className="text-sm text-muted-foreground mb-4">
              You&apos;ve successfully joined the club. Redirecting…
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ---- Main join page ----
  return (
    <div className="min-h-screen bg-background">
      {/* Banner */}
      {group.bannerUrl && (
        <div className="h-48 md:h-64 w-full overflow-hidden bg-muted">
          <img src={group.bannerUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="mx-auto max-w-4xl px-4 py-8 md:py-12">
        {/* Header */}
        <div className="text-center mb-10">
          {group.logoUrl && (
            <img src={group.logoUrl} alt="" className="h-16 w-16 rounded-xl mx-auto mb-4 object-cover" />
          )}
          <h1 className="text-3xl md:text-4xl font-bold mb-3">{group.name}</h1>
          <p className="text-sm text-muted-foreground capitalize">{group.type || 'Flying Club'}</p>

          <div className="flex items-center justify-center gap-6 mt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Plane className="h-4 w-4" />
              <span>{group.aircraft.length} aircraft</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              <span>{group.memberCount} member{group.memberCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mb-10">
          {joinError && (
            <p className="text-sm text-destructive mb-4">{joinError}</p>
          )}
          <button
            onClick={handleJoin}
            disabled={joining}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 text-lg"
          >
            {joining ? (
              <><Loader2 className="h-5 w-5 animate-spin" />Joining…</>
            ) : (
              <><ArrowRight className="h-5 w-5" />Join This Club</>
            )}
          </button>
          <p className="text-xs text-muted-foreground mt-3">
            Sign in or create an account to join this flying club.
          </p>
        </div>

        {/* Description */}
        {group.description && (
          <div className="mb-10 rounded-xl border border-border bg-card p-6 md:p-8">
            <h2 className="text-lg font-semibold mb-4">About</h2>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{group.description}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Aircraft */}
        {group.aircraft.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-semibold mb-4">Aircraft</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {group.aircraft.map(a => (
                <div key={a.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold">{a.nNumber}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      a.status === 'Available' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                    }`}>
                      {a.status || 'Unknown'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {[a.make, a.model].filter(Boolean).join(' ')}
                    {a.nickname ? ` — "${a.nickname}"` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Posts */}
        {group.recentPosts.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-semibold mb-4">Latest Updates</h2>
            <div className="space-y-4">
              {group.recentPosts.map(post => (
                <div key={post.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold">{post.title}</h3>
                    <span className="text-xs text-muted-foreground shrink-0 ml-4">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{post.excerpt}</p>
                  {post.authorName && (
                    <p className="text-xs text-muted-foreground mt-2">— {post.authorName}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Share link info */}
        {data.email && (
          <div className="text-center text-xs text-muted-foreground border-t border-border pt-6">
            This invite was sent to <span className="font-medium">{data.email}</span>.
          </div>
        )}
      </div>
    </div>
  )
}
