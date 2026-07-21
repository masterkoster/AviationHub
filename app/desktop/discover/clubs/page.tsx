'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Loader2, Users, Plane, ExternalLink, X, MapPinned, Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ErrorCard } from '@/desktop/components/error-card'
import { MapErrorBoundary } from '@/desktop/components/map-error-boundary'
import type { ClubMapPin } from '@/shared/components/map/clubs-map'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'

const ClubsMapRenderer = dynamic(() => import('@/shared/components/map/clubs-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading map...
    </div>
  ),
})

interface ClubMapEntry {
  id: string
  name: string
  description: string | null
  website: string | null
  contactEmail: string | null
  sizeBracket: string | null
  homeAirport: string
  airportName: string
  lat: number
  lon: number
}

const SIZE_LABELS: Record<string, string> = {
  '1-5': '1–5 members',
  '6-15': '6–15 members',
  '16-40': '16–40 members',
  '40+': '40+ members',
}

function formatSizeBracket(bracket: string | null): string {
  if (!bracket) return 'Size not shared'
  return SIZE_LABELS[bracket] ?? bracket
}

function withProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

async function openExternalUrl(url: string) {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  } catch {
    // fallback for web/dev contexts
  }
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export default function ClubsDiscoveryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [clubs, setClubs] = useState<ClubMapEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('club'))

  const fetchClubs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await cloudApi.getDiscoverClubs()
      setClubs(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clubs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchClubs() }, [fetchClubs])

  const selectedClub = useMemo(
    () => clubs.find((c) => c.id === selectedId) ?? null,
    [clubs, selectedId]
  )

  const mapPins = useMemo<ClubMapPin[]>(
    () => clubs.map((c) => ({ id: c.id, name: c.name, lat: c.lat, lon: c.lon })),
    [clubs]
  )

  function handleSelectClub(id: string) {
    setSelectedId((prev) => (prev === id ? prev : id))
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-4">
        <button
          onClick={() => router.push('/desktop/discover')}
          className="flex items-center gap-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <MapPinned className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold">Flying Clubs</h1>
        {!loading && !error && (
          <span className="text-xs text-muted-foreground">
            {clubs.length} club{clubs.length === 1 ? '' : 's'} on the map
          </span>
        )}
      </div>

      {error ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <ErrorCard message={error} onRetry={fetchClubs} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Side list */}
          <div className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-border bg-card">
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : clubs.length === 0 ? (
                <EmptyClubs />
              ) : (
                <ul className="divide-y divide-border">
                  {clubs.map((club) => (
                    <li key={club.id}>
                      <button
                        onClick={() => handleSelectClub(club.id)}
                        className={cn(
                          'w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/50',
                          selectedId === club.id && 'bg-primary/10'
                        )}
                      >
                        <p className="truncate text-sm font-medium leading-tight">{club.name}</p>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Plane className="h-3 w-3 shrink-0" />
                          <span className="font-mono">{club.homeAirport}</span>
                          <span className="truncate">{club.airportName}</span>
                        </div>
                        <span className="mt-1 inline-block rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {formatSizeBracket(club.sizeBracket)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Map */}
          <div className="relative flex-1">
            <MapErrorBoundary
              fallback={
                <div className="flex h-full items-center justify-center bg-muted/30">
                  <p className="text-sm text-muted-foreground">Map failed to load.</p>
                </div>
              }
            >
              {loading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading clubs...
                </div>
              ) : clubs.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <EmptyClubs />
                </div>
              ) : (
                <ClubsMapRenderer
                  clubs={mapPins}
                  selectedId={selectedId}
                  onSelectClub={handleSelectClub}
                />
              )}
            </MapErrorBoundary>

            {selectedClub && (
              <ClubDetailCard club={selectedClub} onClose={() => setSelectedId(null)} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyClubs() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <Users className="h-8 w-8 text-muted-foreground/20" />
      <p className="text-xs text-muted-foreground">No clubs have joined the map yet.</p>
    </div>
  )
}

function ClubDetailCard({ club, onClose }: { club: ClubMapEntry; onClose: () => void }) {
  return (
    <div className="absolute right-4 top-4 z-[1100] w-[340px] rounded-xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-bold leading-tight">{club.name}</h2>
        <button
          onClick={onClose}
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Plane className="h-3.5 w-3.5 shrink-0" />
        <span className="font-mono font-medium text-foreground">{club.homeAirport}</span>
        <span className="truncate">{club.airportName}</span>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Users className="h-3.5 w-3.5 shrink-0" />
        {formatSizeBracket(club.sizeBracket)}
      </div>

      <p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
        {club.description || 'No description provided.'}
      </p>

      {(club.contactEmail || club.website) ? (
        <div className="mt-3 flex gap-2">
          {club.contactEmail && (
            <a
              href={`mailto:${club.contactEmail}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Mail className="h-3.5 w-3.5" />
              Email
            </a>
          )}
          {club.website && (
            <button
              onClick={() => openExternalUrl(withProtocol(club.website!))}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Website
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-center text-xs text-muted-foreground">No contact info provided</p>
      )}
    </div>
  )
}
