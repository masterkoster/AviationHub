'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, MapPin, Star, Plane, ExternalLink, Eye, Mountain, Route, ChevronRight,
} from 'lucide-react'
import { stateData } from '@/lib/stateData'
import { getRoutesByState, type CuratedRoute } from '@/lib/curated-routes'
import { cn } from '@/lib/utils'

interface StateImage {
  title: string
  imageUrl: string
  sourceUrl: string
  author: string
  license: string
}

async function openExternalUrl(url: string) {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url); return
  } catch {}
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer')
}

const TAG_COLORS: Record<string, string> = {
  scenic: 'bg-emerald-500/15 text-emerald-600',
  coastal: 'bg-blue-500/15 text-blue-600',
  mountain: 'bg-slate-500/15 text-slate-600',
  desert: 'bg-orange-500/15 text-orange-600',
  island: 'bg-teal-500/15 text-teal-600',
  historical: 'bg-amber-500/15 text-amber-600',
  training: 'bg-purple-500/15 text-purple-600',
  'cross-country': 'bg-indigo-500/15 text-indigo-600',
  urban: 'bg-rose-500/15 text-rose-600',
}

export default function StateDetailPage() {
  const router = useRouter()
  const params = useParams<{ code: string }>()
  const code = (typeof params?.code === 'string' ? params.code : '').toUpperCase()
  const stateInfo = stateData[code]
  const stateRoutes = getRoutesByState(code)

  const [images, setImages] = useState<StateImage[]>([])
  const [loadingImages, setLoadingImages] = useState(true)
  const [slideIndex, setSlideIndex] = useState(0)

  useEffect(() => {
    fetch(`/api/state-media/${code}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.images) setImages(data.images as StateImage[]) })
      .catch(() => {})
      .finally(() => setLoadingImages(false))
  }, [code])

  useEffect(() => {
    if (images.length <= 1) return
    const id = window.setInterval(() => setSlideIndex(i => (i + 1) % Math.min(images.length, 5)), 5000)
    return () => window.clearInterval(id)
  }, [images])

  if (!stateInfo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Mountain className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">State not found: {code}</p>
        <button onClick={() => router.back()} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
          Go back
        </button>
      </div>
    )
  }

  const displayImages = images.slice(0, 5)
  const activeImage = displayImages[slideIndex]
  const fallback = `https://placehold.co/800x500/0f172a/e2e8f0?text=${encodeURIComponent(stateInfo.stateName)}`

  function handleImportRoute(route: CuratedRoute) {
    try {
      localStorage.setItem('map_draft_waypoints', JSON.stringify(
        route.waypoints.map(w => ({ id: w.icao, icao: w.icao, name: w.name, latitude: w.lat, longitude: w.lon }))
      ))
      localStorage.setItem('map_draft_route_name', route.name)
    } catch {}
    router.push('/desktop/map')
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
        <span className="font-mono text-xs font-bold text-muted-foreground">{code}</span>
        <span className="h-3.5 w-px bg-border" />
        <span className="text-sm font-semibold">{stateInfo.stateName}</span>
        <span className="text-xs text-muted-foreground">{stateInfo.nickname}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-4 pb-8">

          {/* Hero slideshow */}
          <div className="relative h-72 overflow-hidden rounded-xl border border-border bg-muted">
            {loadingImages ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
              </div>
            ) : activeImage ? (
              <>
                <img
                  src={activeImage.imageUrl}
                  alt={activeImage.title}
                  className="h-full w-full object-cover transition-opacity duration-500"
                  onError={e => { (e.currentTarget as HTMLImageElement).src = fallback }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-4 left-4 text-white">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/60">{stateInfo.region}</p>
                  <h1 className="text-3xl font-bold leading-tight">{stateInfo.stateName}</h1>
                  <p className="mt-0.5 text-sm text-white/70">{stateInfo.nickname}</p>
                </div>
                {displayImages.length > 1 && (
                  <div className="absolute bottom-4 right-4 flex gap-1">
                    {displayImages.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSlideIndex(idx)}
                        className={cn('h-1.5 rounded-full transition-all', idx === slideIndex ? 'w-3 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70')}
                        aria-label={`Image ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 gap-3">
                <Mountain className="h-14 w-14 text-primary/20" />
                <div className="text-center">
                  <h1 className="text-2xl font-bold">{stateInfo.stateName}</h1>
                  <p className="text-sm text-muted-foreground">{stateInfo.nickname}</p>
                </div>
              </div>
            )}
          </div>

          {activeImage && (
            <p className="flex items-center gap-1 -mt-4 text-[10px] text-muted-foreground">
              <Eye className="h-3 w-3" />
              Photo by{' '}
              <button onClick={() => openExternalUrl(activeImage.sourceUrl)} className="ml-0.5 underline hover:text-foreground">
                {activeImage.author}
              </button>
              {' '}&middot; {activeImage.license}
            </p>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoCard label="Capital" value={stateInfo.capital} />
            <InfoCard label="Avg Elevation" value={stateInfo.avgElevation > 0 ? `${stateInfo.avgElevation.toLocaleString()} ft` : 'Sea level'} />
            <InfoCard label="Climate" value={stateInfo.climate} />
            <InfoCard label="Terrain" value={stateInfo.terrain.split(',')[0].trim()} />
          </div>

          {/* Bio */}
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm leading-relaxed text-muted-foreground">{stateInfo.bio}</p>
          </div>

          {/* Fun fact */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="flex items-start gap-2 text-sm">
              <Star className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                <strong className="text-foreground">Fun fact: </strong>
                <span className="text-muted-foreground">{stateInfo.funFact}</span>
              </span>
            </p>
          </div>

          {/* Curated VFR routes */}
          {stateRoutes.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Route className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">VFR Routes in {stateInfo.stateName}</h3>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {stateRoutes.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {stateRoutes.map(route => (
                  <RouteCard key={route.id} route={route} onImport={() => handleImportRoute(route)} />
                ))}
              </div>
            </div>
          )}

          {/* Attractions */}
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Star className="h-3.5 w-3.5" /> Must-See Attractions
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {stateInfo.attractions.map((attr, idx) => (
                <button
                  key={idx}
                  onClick={() => openExternalUrl(`https://www.google.com/search?q=${encodeURIComponent(`${attr} ${stateInfo.stateName}`)}`)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-left text-sm transition-colors hover:bg-muted/50"
                >
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  <span className="flex-1">{attr}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>

          {/* Major airports */}
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Plane className="h-3.5 w-3.5" /> Major Airports
            </h3>
            <div className="flex flex-wrap gap-2">
              {stateInfo.majorAirports.map(icao => (
                <button
                  key={icao}
                  onClick={() => openExternalUrl(`https://www.airnav.com/airport/${icao}`)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-xs transition-colors hover:bg-muted/50"
                >
                  {icao}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  )
}

function RouteCard({ route, onImport }: { route: CuratedRoute; onImport: () => void }) {
  return (
    <button
      onClick={onImport}
      className="group overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:border-primary/30 hover:shadow-md"
    >
      <div className="relative h-32 overflow-hidden bg-muted">
        <img
          src={route.imageUrl}
          alt={route.name}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
          onError={e => { (e.currentTarget as HTMLImageElement).src = `https://placehold.co/400x200/0f172a/e2e8f0?text=${encodeURIComponent(route.name)}` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-2 left-2.5 right-2.5">
          <p className="font-mono text-[10px] text-white/80">{route.waypoints.map(w => w.icao).join(' → ')}</p>
        </div>
        <span className={cn(
          'absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm',
          route.aircraftCategory === 'ME' ? 'bg-blue-500/80 text-white' : 'bg-primary/80 text-primary-foreground',
        )}>
          {route.aircraftCategory}
        </span>
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold leading-tight">{route.name}</h4>
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{route.description}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{route.distanceNm} nm</span>
          {route.tags.slice(0, 2).map(tag => (
            <span key={tag} className={cn('rounded px-1.5 py-0.5 text-[10px] capitalize', TAG_COLORS[tag] ?? 'bg-muted/60 text-muted-foreground')}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  )
}
