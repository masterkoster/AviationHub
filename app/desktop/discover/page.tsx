'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Compass, Search, X, Upload, Loader2, Route, Plus, Download, Plane,
  ChevronDown, ChevronUp, Star, Map, CheckCircle2, Mountain,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { stateData, getAllStates, type StateInfo } from '@/lib/stateData'
import { curatedRoutes, type CuratedRoute } from '@/lib/curated-routes'
import { aircraftDatabase, type AircraftEntry } from '@/lib/aircraft-database'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'

// ── Types ────────────────────────────────────────────────────────────────────

interface SharedRouteWaypoint {
  icao: string
  name: string
  latitude: number
  longitude: number
}

interface SharedRoute {
  id: string
  name: string
  description: string | null
  waypoints: SharedRouteWaypoint[]
  totalDistanceNm: number
  aircraftCategory: string
  downloadsCount: number
  createdAt: string
  sharedBy: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ICAO_TO_STATE: Record<string, string> = {}
for (const [code, info] of Object.entries(stateData)) {
  for (const icao of info.majorAirports) ICAO_TO_STATE[icao] = code
}

function osmStaticUrl(dep: SharedRouteWaypoint, arr: SharedRouteWaypoint): string {
  const midLat = ((dep.latitude + arr.latitude) / 2).toFixed(4)
  const midLon = ((dep.longitude + arr.longitude) / 2).toFixed(4)
  const span = Math.max(Math.abs(arr.latitude - dep.latitude), Math.abs(arr.longitude - dep.longitude))
  const zoom = span < 1 ? 9 : span < 3 ? 7 : span < 8 ? 6 : span < 20 ? 5 : 4
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${midLat},${midLon}&zoom=${zoom}&size=400x180&markers=${dep.latitude},${dep.longitude},red-pushpin|${arr.latitude},${arr.longitude},blue-pushpin`
}

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function calcRouteDistance(wps: SharedRouteWaypoint[]): number {
  let d = 0
  for (let i = 1; i < wps.length; i++)
    d += haversineNm(wps[i - 1].latitude, wps[i - 1].longitude, wps[i].latitude, wps[i].longitude)
  return d
}

async function openExternalUrl(url: string) {
  try { const { openUrl } = await import('@tauri-apps/plugin-opener'); await openUrl(url); return } catch {}
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer')
}

const TAG_COLORS: Record<string, string> = {
  scenic: 'bg-emerald-500/15 text-emerald-700',
  coastal: 'bg-blue-500/15 text-blue-700',
  mountain: 'bg-slate-500/15 text-slate-700',
  desert: 'bg-orange-500/15 text-orange-700',
  island: 'bg-teal-500/15 text-teal-700',
  historical: 'bg-amber-500/15 text-amber-700',
  training: 'bg-purple-500/15 text-purple-700',
  'cross-country': 'bg-indigo-500/15 text-indigo-700',
  urban: 'bg-rose-500/15 text-rose-700',
}

const AC_CAT_COLORS: Record<string, string> = {
  SE: 'bg-blue-500/15 text-blue-700',
  ME: 'bg-indigo-500/15 text-indigo-700',
  Turboprop: 'bg-emerald-500/15 text-emerald-700',
  Jet: 'bg-purple-500/15 text-purple-700',
  Helicopter: 'bg-orange-500/15 text-orange-700',
  LSA: 'bg-teal-500/15 text-teal-700',
  Experimental: 'bg-rose-500/15 text-rose-700',
}

type SectionId = 'featured' | 'aircraft' | 'community' | 'states'

// ── Main Page ────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const router = useRouter()
  const { status } = useDesktopAuth()
  const isCloud = status === 'authenticated'

  const [search, setSearch] = useState('')
  const [regionFilter, setRegionFilter] = useState('All')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [distanceFilter, setDistanceFilter] = useState<'all' | 'short' | 'medium' | 'long'>('all')

  const [expanded, setExpanded] = useState<SectionId | null>(null)

  const [community, setCommunity] = useState<SharedRoute[]>([])
  const [communityTotal, setCommunityTotal] = useState(0)
  const [communityLoading, setCommunityLoading] = useState(true)

  const [importedId, setImportedId] = useState<string | null>(null)
  const [showShare, setShowShare] = useState(false)
  const [stateImgCache, setStateImgCache] = useState<Record<string, string | null>>({})

  function toggle(id: SectionId) {
    setExpanded(prev => (prev === id ? null : id))
  }

  const distMin = distanceFilter === 'medium' ? 100 : distanceFilter === 'long' ? 300 : 0
  const distMax = distanceFilter === 'short' ? 100 : distanceFilter === 'medium' ? 300 : 99999

  const filteredRoutes = useMemo(() => {
    return curatedRoutes.filter(r => {
      if (regionFilter !== 'All' && r.region !== regionFilter) return false
      if (categoryFilter !== 'All' && r.aircraftCategory !== categoryFilter && r.aircraftCategory !== 'Any') return false
      if (r.distanceNm < distMin || r.distanceNm > distMax) return false
      if (search) {
        const q = search.toLowerCase()
        return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) ||
          r.stateCode.toLowerCase().includes(q) || r.tags.some(t => t.includes(q))
      }
      return true
    })
  }, [regionFilter, categoryFilter, distMin, distMax, search])

  const filteredAircraft = useMemo(() => {
    return aircraftDatabase.filter(a => {
      if (categoryFilter !== 'All' && a.category !== categoryFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return a.manufacturer.toLowerCase().includes(q) || a.model.toLowerCase().includes(q) || a.commonUse.toLowerCase().includes(q)
      }
      return true
    })
  }, [categoryFilter, search])

  const filteredStates = useMemo(() => {
    return getAllStates().filter(s => {
      if (regionFilter !== 'All' && s.region !== regionFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return s.stateName.toLowerCase().includes(q) || s.state.toLowerCase().includes(q) || s.nickname.toLowerCase().includes(q)
      }
      return true
    })
  }, [regionFilter, search])

  const fetchCommunity = useCallback(async () => {
    setCommunityLoading(true)
    try {
      const limit = expanded === 'community' ? '30' : '6'
      const cat = ['SE', 'ME', 'SEA'].includes(categoryFilter) ? categoryFilter : undefined
      const params = new URLSearchParams({
        minDist: String(distMin),
        maxDist: String(distMax === 99999 ? 9999 : distMax),
        limit, offset: '0',
        ...(cat ? { category: cat } : {}),
      })
      const res = await fetch(`/api/discover/routes?${params}`)
      if (!res.ok) throw new Error('failed')
      const data = await res.json() as { routes: SharedRoute[]; total: number }
      setCommunity(data.routes)
      setCommunityTotal(data.total)
    } catch { /* silent */ }
    finally { setCommunityLoading(false) }
  }, [distMin, distMax, categoryFilter, expanded])

  useEffect(() => { fetchCommunity() }, [fetchCommunity])

  function importCurated(route: CuratedRoute) {
    try {
      localStorage.setItem('map_draft_waypoints', JSON.stringify(
        route.waypoints.map(w => ({ id: w.icao, icao: w.icao, name: w.name, latitude: w.lat, longitude: w.lon }))
      ))
      localStorage.setItem('map_draft_route_name', route.name)
    } catch {}
    router.push('/desktop/map')
  }

  function importCommunity(route: SharedRoute) {
    try {
      localStorage.setItem('map_draft_waypoints', JSON.stringify(
        route.waypoints.map(w => ({ id: w.icao, icao: w.icao, name: w.name, latitude: w.latitude, longitude: w.longitude }))
      ))
      localStorage.setItem('map_draft_route_name', route.name)
    } catch {}
    fetch(`/api/discover/routes/${route.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'import' }),
    }).catch(() => {})
    setImportedId(route.id)
    setTimeout(() => { setImportedId(null); router.push('/desktop/map') }, 700)
  }

  const visRoutes = expanded === 'featured' ? filteredRoutes : filteredRoutes.slice(0, 4)
  const visAircraft = expanded === 'aircraft' ? filteredAircraft : filteredAircraft.slice(0, 4)
  const visStates = expanded === 'states' ? filteredStates : filteredStates.slice(0, 6)

  const hasFilters = search || regionFilter !== 'All' || categoryFilter !== 'All' || distanceFilter !== 'all'

  const sectionMeta: Record<SectionId, { title: string; subtitle: string; icon: React.ReactNode }> = {
    featured: { title: 'Featured Routes', subtitle: 'Curated VFR adventures across the US', icon: <Map className="h-4 w-4" /> },
    aircraft: { title: 'Aircraft to Explore', subtitle: 'Specs, history, and fleet integration', icon: <Plane className="h-4 w-4" /> },
    community: { title: 'Community Routes', subtitle: 'Routes shared by fellow pilots', icon: <Route className="h-4 w-4" /> },
    states: { title: 'State Highlights', subtitle: 'Fun facts and curated routes by state', icon: <Star className="h-4 w-4" /> },
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* Top bar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold">Discover</h1>
        </div>
        {isCloud && (
          <button
            onClick={() => setShowShare(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Upload className="h-3.5 w-3.5" />
            Share Route
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-2">
        <div className="relative min-w-[160px] flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search routes, aircraft, states…"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring">
          <option value="All">All Regions</option>
          <option value="West">West</option>
          <option value="South">South</option>
          <option value="Northeast">Northeast</option>
          <option value="Midwest">Midwest</option>
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring">
          <option value="All">All Aircraft</option>
          <option value="SE">Single Engine</option>
          <option value="ME">Multi Engine</option>
          <option value="Turboprop">Turboprop</option>
          <option value="Jet">Jet</option>
          <option value="Helicopter">Helicopter</option>
          <option value="LSA">Light Sport</option>
          <option value="Experimental">Experimental</option>
        </select>
        <select value={distanceFilter} onChange={e => setDistanceFilter(e.target.value as typeof distanceFilter)} className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring">
          <option value="all">Any Distance</option>
          <option value="short">Short (&lt;100 nm)</option>
          <option value="medium">Medium (100–300 nm)</option>
          <option value="long">Long (&gt;300 nm)</option>
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setRegionFilter('All'); setCategoryFilter('All'); setDistanceFilter('all') }}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">

        {/* Section 1: Featured Routes */}
        {(expanded === null || expanded === 'featured') && (
          <SectionWrapper
            meta={sectionMeta.featured}
            count={filteredRoutes.length}
            isExpanded={expanded === 'featured'}
            onToggle={() => toggle('featured')}
          >
            {filteredRoutes.length === 0 ? <EmptyFilter /> : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {visRoutes.map(r => (
                  <CuratedRouteCard key={r.id} route={r} onImport={() => importCurated(r)} />
                ))}
              </div>
            )}
          </SectionWrapper>
        )}

        {/* Section 2: Aircraft to Explore */}
        {(expanded === null || expanded === 'aircraft') && (
          <SectionWrapper
            meta={sectionMeta.aircraft}
            count={filteredAircraft.length}
            isExpanded={expanded === 'aircraft'}
            onToggle={() => toggle('aircraft')}
          >
            {filteredAircraft.length === 0 ? <EmptyFilter /> : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {visAircraft.map(a => (
                  <AircraftCard
                    key={a.id}
                    aircraft={a}
                    onClick={() => router.push(`/desktop/discover/aircraft/${a.id}`)}
                  />
                ))}
              </div>
            )}
          </SectionWrapper>
        )}

        {/* Section 3: Community Routes */}
        {(expanded === null || expanded === 'community') && (
          <SectionWrapper
            meta={sectionMeta.community}
            count={communityTotal}
            isExpanded={expanded === 'community'}
            onToggle={() => toggle('community')}
            extra={!isCloud ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Sign in to share</span>
            ) : undefined}
          >
            {communityLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : community.length === 0 ? (
              <EmptyFilter label={isCloud ? 'No community routes yet — share one from the Map!' : 'Sign in to browse and share community routes.'} />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {community.map(r => (
                  <CommunityRouteCard
                    key={r.id}
                    route={r}
                    importing={importedId === r.id}
                    onImport={() => importCommunity(r)}
                  />
                ))}
              </div>
            )}
          </SectionWrapper>
        )}

        {/* Section 4: State Highlights */}
        {(expanded === null || expanded === 'states') && (
          <SectionWrapper
            meta={sectionMeta.states}
            count={filteredStates.length}
            isExpanded={expanded === 'states'}
            onToggle={() => toggle('states')}
          >
            {filteredStates.length === 0 ? <EmptyFilter /> : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {visStates.map(s => (
                  <StateCard
                    key={s.state}
                    stateInfo={s}
                    cachedImage={stateImgCache[s.state]}
                    onImageLoaded={url => setStateImgCache(prev => ({ ...prev, [s.state]: url }))}
                    onClick={() => router.push(`/desktop/discover/state/${s.state}`)}
                  />
                ))}
              </div>
            )}
          </SectionWrapper>
        )}

        {/* Collapsed headers for the sections not currently expanded */}
        {expanded !== null && (
          <div className="divide-y divide-border">
            {(['featured', 'aircraft', 'community', 'states'] as SectionId[])
              .filter(id => id !== expanded)
              .map(id => (
                <button
                  key={id}
                  onClick={() => toggle(id)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-xs text-muted-foreground hover:bg-muted/40"
                >
                  <span className="text-muted-foreground/60">{sectionMeta[id].icon}</span>
                  <span>{sectionMeta[id].title}</span>
                  <ChevronDown className="ml-auto h-3.5 w-3.5" />
                </button>
              ))}
          </div>
        )}
      </div>

      {showShare && (
        <ShareRouteDialog
          onClose={() => setShowShare(false)}
          onShared={() => { setShowShare(false); fetchCommunity() }}
        />
      )}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function SectionWrapper({
  meta, count, isExpanded, onToggle, children, extra,
}: {
  meta: { title: string; subtitle: string; icon: React.ReactNode }
  count: number
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
  extra?: React.ReactNode
}) {
  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-primary">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold leading-none">{meta.title}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{meta.subtitle}</p>
        </div>
        {extra}
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{count}</span>
        <button
          onClick={onToggle}
          className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
        >
          {isExpanded ? <><ChevronUp className="h-3.5 w-3.5" /> Collapse</> : <><ChevronDown className="h-3.5 w-3.5" /> See all</>}
        </button>
      </div>
      {children}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyFilter({ label = 'No results match your filters.' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Compass className="mb-2 h-8 w-8 text-muted-foreground/20" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

// ── Curated Route Card ────────────────────────────────────────────────────────

function CuratedRouteCard({ route, onImport }: { route: CuratedRoute; onImport: () => void }) {
  return (
    <button
      onClick={onImport}
      className="group overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:border-primary/30 hover:shadow-md"
    >
      <div className="relative h-32 overflow-hidden bg-muted">
        <img
          src={route.imageUrl}
          alt={route.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={e => { (e.currentTarget as HTMLImageElement).src = `https://placehold.co/400x200/0f172a/e2e8f0?text=${encodeURIComponent(route.name)}` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-2 left-2.5 right-2.5">
          <p className="truncate font-mono text-[10px] text-white/80">{route.waypoints.map(w => w.icao).join(' → ')}</p>
        </div>
        <span className={cn(
          'absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm',
          route.aircraftCategory === 'ME' ? 'bg-blue-500/80 text-white' :
          route.aircraftCategory === 'Turboprop' ? 'bg-emerald-500/80 text-white' :
          'bg-primary/80 text-primary-foreground',
        )}>
          {route.aircraftCategory}
        </span>
      </div>
      <div className="p-3">
        <h3 className="truncate text-sm font-semibold leading-tight">{route.name}</h3>
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

// ── Aircraft Card ─────────────────────────────────────────────────────────────

function AircraftCard({ aircraft, onClick }: { aircraft: AircraftEntry; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:border-primary/30 hover:shadow-md"
    >
      <div className="relative h-32 overflow-hidden bg-muted">
        <img
          src={aircraft.imageUrl}
          alt={`${aircraft.manufacturer} ${aircraft.model}`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={e => { (e.currentTarget as HTMLImageElement).src = `https://placehold.co/400x200/0f172a/e2e8f0?text=${encodeURIComponent(aircraft.model)}` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-2 left-2.5">
          <p className="text-[10px] text-white/70">{aircraft.manufacturer}</p>
          <p className="text-sm font-bold leading-tight text-white">{aircraft.model}</p>
        </div>
        <span className={cn(
          'absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-medium',
          AC_CAT_COLORS[aircraft.category] ? 'bg-black/50 text-white' : 'bg-primary/80 text-primary-foreground',
        )}>
          {aircraft.category}
        </span>
      </div>
      <div className="p-3">
        <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
          {aircraft.cruiseSpeedKts && <span className="rounded bg-muted/60 px-1.5 py-0.5">{aircraft.cruiseSpeedKts} kts</span>}
          {aircraft.rangeNm && <span className="rounded bg-muted/60 px-1.5 py-0.5">{aircraft.rangeNm} nm</span>}
          <span className="rounded bg-muted/60 px-1.5 py-0.5">{aircraft.seatsTotal} seats</span>
        </div>
        <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">{aircraft.commonUse.split('.')[0]}.</p>
      </div>
    </button>
  )
}

// ── Community Route Card ──────────────────────────────────────────────────────

function CommunityRouteCard({
  route, importing, onImport,
}: { route: SharedRoute; importing: boolean; onImport: () => void }) {
  const dep = route.waypoints[0]
  const arr = route.waypoints[route.waypoints.length - 1]
  const distNm = route.totalDistanceNm > 0 ? route.totalDistanceNm : calcRouteDistance(route.waypoints)
  const date = new Date(route.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const [image, setImage] = useState<string | null>(null)
  const [imgLoading, setImgLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const stateCode = arr ? ICAO_TO_STATE[arr.icao] : undefined
    if (stateCode) {
      fetch(`/api/state-media/${stateCode}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (cancelled) return
          const url = data?.images?.[0]?.imageUrl as string | undefined
          setImage(url ?? (dep && arr ? osmStaticUrl(dep, arr) : null))
        })
        .catch(() => { if (!cancelled && dep && arr) setImage(osmStaticUrl(dep, arr)) })
        .finally(() => { if (!cancelled) setImgLoading(false) })
    } else if (dep && arr) {
      setImage(osmStaticUrl(dep, arr))
      setImgLoading(false)
    } else {
      setImgLoading(false)
    }
    return () => { cancelled = true }
  }, [arr?.icao]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <button
      onClick={onImport}
      disabled={importing}
      className="group w-full overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:border-primary/30 hover:shadow-md disabled:opacity-80"
    >
      <div className="relative h-36 overflow-hidden bg-muted">
        {imgLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          </div>
        ) : image ? (
          <img
            src={image}
            alt={route.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={e => { (e.currentTarget as HTMLImageElement).src = `https://placehold.co/400x180/0f172a/e2e8f0?text=${encodeURIComponent(route.name)}` }}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
            <Route className="h-8 w-8 text-primary/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        {importing && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 backdrop-blur-sm">
            <CheckCircle2 className="h-8 w-8 text-green-400" />
          </div>
        )}
        <span className={cn(
          'absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase backdrop-blur-sm',
          route.aircraftCategory === 'ME' ? 'bg-blue-500/80 text-white' :
          route.aircraftCategory === 'SEA' ? 'bg-teal-500/80 text-white' :
          'bg-primary/80 text-primary-foreground',
        )}>
          {route.aircraftCategory}
        </span>
        <div className="absolute bottom-2 left-3 right-3">
          <p className="truncate font-mono text-[10px] font-medium text-white/80">
            {route.waypoints.map(w => w.icao).join(' → ')}
          </p>
        </div>
      </div>
      <div className="p-3">
        <h3 className="truncate text-sm font-semibold leading-tight">{route.name}</h3>
        {route.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{route.description}</p>
        )}
        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Plane className="h-3 w-3" />{Math.round(distNm)} nm</span>
          <span className="flex items-center gap-1"><Download className="h-3 w-3" />{route.downloadsCount}</span>
          <span className="truncate">{route.sharedBy} · {date}</span>
        </div>
      </div>
    </button>
  )
}

// ── State Card ────────────────────────────────────────────────────────────────

function StateCard({
  stateInfo, cachedImage, onImageLoaded, onClick,
}: {
  stateInfo: StateInfo
  cachedImage: string | null | undefined
  onImageLoaded: (url: string | null) => void
  onClick: () => void
}) {
  const [image, setImage] = useState<string | null>(cachedImage ?? null)
  const [loading, setLoading] = useState(cachedImage === undefined)

  useEffect(() => {
    if (cachedImage !== undefined) { setImage(cachedImage); setLoading(false); return }
    let cancelled = false
    fetch(`/api/state-media/${stateInfo.state}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return
        const url = (data?.images?.[0]?.imageUrl as string) ?? null
        setImage(url); onImageLoaded(url)
      })
      .catch(() => { if (!cancelled) { setImage(null); onImageLoaded(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [stateInfo.state]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <button
      onClick={onClick}
      className="group overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:border-primary/30 hover:shadow-md"
    >
      <div className="relative h-24 overflow-hidden bg-muted">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          </div>
        ) : image ? (
          <img
            src={image}
            alt={stateInfo.stateName}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={e => { (e.currentTarget as HTMLImageElement).src = `https://placehold.co/200x100/0f172a/e2e8f0?text=${stateInfo.state}` }}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
            <Mountain className="h-8 w-8 text-primary/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-1.5 left-2">
          <p className="font-mono text-xs font-bold text-white">{stateInfo.state}</p>
        </div>
      </div>
      <div className="p-2.5">
        <p className="text-xs font-semibold leading-tight">{stateInfo.stateName}</p>
        <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{stateInfo.funFact}</p>
      </div>
    </button>
  )
}

// ── Share Route Dialog ────────────────────────────────────────────────────────

function ShareRouteDialog({ onClose, onShared }: { onClose: () => void; onShared: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('SE')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const draftWaypoints = useMemo<SharedRouteWaypoint[]>(() => {
    try { return JSON.parse(localStorage.getItem('map_draft_waypoints') ?? '[]') as SharedRouteWaypoint[] } catch { return [] }
  }, [])

  const draftName = useMemo(() => {
    try { return localStorage.getItem('map_draft_route_name') ?? '' } catch { return '' }
  }, [])

  useEffect(() => { if (draftName) setName(draftName) }, [draftName])

  const distNm = useMemo(() => calcRouteDistance(draftWaypoints), [draftWaypoints])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Route name is required.'); return }
    if (draftWaypoints.length < 2) { setError('Your current draft route needs at least 2 waypoints.'); return }
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/discover/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, waypoints: draftWaypoints, totalDistanceNm: distNm, aircraftCategory: category }),
      })
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Failed') }
      onShared()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share route')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[480px] overflow-hidden rounded-lg border border-border bg-card shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Share Your Route</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        {draftWaypoints.length < 2 ? (
          <div className="p-6 text-center">
            <Route className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium">No route in progress</p>
            <p className="mt-1 text-xs text-muted-foreground">Build a route on the Map page first, then come back to share it.</p>
            <button onClick={onClose} className="mt-4 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Go to Map</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-4">
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="truncate font-mono text-[11px] text-muted-foreground">{draftWaypoints.map(w => w.icao).join(' → ')}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{draftWaypoints.length} waypoints · {Math.round(distNm)} nm</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Route Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pacific Coast Scenic" maxLength={200}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Description <span className="text-muted-foreground">(optional)</span></label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What makes this route special?" maxLength={500} rows={3}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Aircraft Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                <option value="SE">Single Engine (SE)</option>
                <option value="ME">Multi Engine (ME)</option>
                <option value="SEA">Seaplane (SEA)</option>
              </select>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 rounded-md border border-border py-2 text-sm hover:bg-muted">Cancel</button>
              <button type="submit" disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {submitting ? 'Sharing…' : 'Share Route'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
