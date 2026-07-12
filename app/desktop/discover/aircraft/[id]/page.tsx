'use client'

import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, Plus, ExternalLink, Gauge, Fuel, Users, Zap, Target, ArrowUpCircle,
  Weight, Droplets,
} from 'lucide-react'
import { getAircraftById } from '@/lib/aircraft-database'
import { cn } from '@/lib/utils'

async function openExternalUrl(url: string) {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url); return
  } catch {}
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer')
}

const CATEGORY_COLORS: Record<string, string> = {
  SE: 'bg-blue-500/15 text-blue-700',
  ME: 'bg-indigo-500/15 text-indigo-700',
  Turboprop: 'bg-emerald-500/15 text-emerald-700',
  Jet: 'bg-purple-500/15 text-purple-700',
  Helicopter: 'bg-orange-500/15 text-orange-700',
  LSA: 'bg-teal-500/15 text-teal-700',
  Experimental: 'bg-rose-500/15 text-rose-700',
}

const CERT_COLORS: Record<string, string> = {
  VFR: 'bg-green-500/15 text-green-700',
  IFR: 'bg-blue-500/15 text-blue-700',
  Aerobatic: 'bg-rose-500/15 text-rose-700',
  Commercial: 'bg-purple-500/15 text-purple-700',
  Training: 'bg-amber-500/15 text-amber-700',
  Cargo: 'bg-slate-500/15 text-slate-700',
  Night: 'bg-indigo-500/15 text-indigo-700',
}

export default function AircraftDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const aircraft = getAircraftById(typeof params?.id === 'string' ? params.id : '')

  if (!aircraft) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Aircraft not found.</p>
        <button onClick={() => router.back()} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
          Go back
        </button>
      </div>
    )
  }

  function handleAddToFleet() {
    try {
      localStorage.setItem('aircraft_import_prefill', JSON.stringify({
        manufacturer: aircraft!.manufacturer,
        model: aircraft!.model,
        category: aircraft!.category,
        engineType: aircraft!.engineType,
        engineCount: aircraft!.engineCount,
        horsepower: aircraft!.horsepower,
        fuelType: aircraft!.fuelType,
        seatsTotal: aircraft!.seatsTotal,
        cruiseSpeedKts: aircraft!.cruiseSpeedKts,
        fuelCapacityGal: aircraft!.fuelCapacityGal,
        burnRateGph: aircraft!.burnRateGph,
      }))
    } catch {}
    router.push('/desktop/aircraft')
  }

  const specs = [
    { label: 'Cruise Speed',    value: aircraft.cruiseSpeedKts  ? `${aircraft.cruiseSpeedKts} kts`          : '—', icon: Gauge },
    { label: 'Range',           value: aircraft.rangeNm          ? `${aircraft.rangeNm.toLocaleString()} nm` : '—', icon: Target },
    { label: 'Service Ceiling', value: aircraft.ceilingFt        ? `${aircraft.ceilingFt.toLocaleString()} ft` : '—', icon: ArrowUpCircle },
    { label: 'Seats',           value: String(aircraft.seatsTotal),                                              icon: Users },
    { label: 'Horsepower',      value: aircraft.horsepower       ? `${aircraft.horsepower} hp`               : '—', icon: Zap },
    { label: 'Useful Load',     value: aircraft.usefulLoadLbs    ? `${aircraft.usefulLoadLbs.toLocaleString()} lbs` : '—', icon: Weight },
    { label: 'Fuel Capacity',   value: aircraft.fuelCapacityGal  ? `${aircraft.fuelCapacityGal} gal`         : '—', icon: Fuel },
    { label: 'Burn Rate',       value: aircraft.burnRateGph      ? `${aircraft.burnRateGph} gph`             : '—', icon: Droplets },
  ]

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
        <span className="text-sm font-semibold">{aircraft.manufacturer} {aircraft.model}</span>
        <div className="ml-auto flex items-center gap-2">
          {aircraft.wikipediaUrl && (
            <button
              onClick={() => openExternalUrl(aircraft.wikipediaUrl!)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Wikipedia
            </button>
          )}
          <button
            onClick={handleAddToFleet}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Add to My Fleet
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 p-4 pb-8">

          {/* Hero */}
          <div className="relative h-64 overflow-hidden rounded-xl border border-border bg-muted">
            <img
              src={aircraft.imageUrl}
              alt={`${aircraft.manufacturer} ${aircraft.model}`}
              className="h-full w-full object-cover"
              onError={e => { (e.currentTarget as HTMLImageElement).src = `https://placehold.co/800x400/0f172a/e2e8f0?text=${encodeURIComponent(aircraft.model)}` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-4 left-4 text-white">
              <p className="text-xs uppercase tracking-wide text-white/60">{aircraft.manufacturer}</p>
              <h1 className="text-2xl font-bold leading-tight">{aircraft.model}</h1>
              {aircraft.year && <p className="mt-0.5 text-sm text-white/60">First produced: {aircraft.year}</p>}
            </div>
            <div className={cn(
              'absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold',
              CATEGORY_COLORS[aircraft.category] ?? 'bg-muted text-foreground',
            )}>
              {aircraft.category === 'SE' ? 'Single Engine' :
               aircraft.category === 'ME' ? 'Multi Engine' :
               aircraft.category}
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground -mt-4">Photo: {aircraft.imageCredit}</p>

          {/* Description */}
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm leading-relaxed text-muted-foreground">{aircraft.commonUse}</p>
          </div>

          {/* Specs grid */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Performance Specs</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {specs.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Icon className="h-3 w-3" />
                    {label}
                  </div>
                  <p className="mt-1.5 text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Powerplant */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Powerplant</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Engine Type</p>
                <p className="mt-0.5 font-medium">{aircraft.engineType}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Configuration</p>
                <p className="mt-0.5 font-medium">{aircraft.engineCount === 1 ? 'Single engine' : `${aircraft.engineCount} engines`}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Fuel</p>
                <p className="mt-0.5 font-medium">{aircraft.fuelType}</p>
              </div>
            </div>
          </div>

          {/* Certifications */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Certifications</h3>
            <div className="flex flex-wrap gap-2">
              {aircraft.certifications.map(cert => (
                <span key={cert} className={cn('rounded-full px-3 py-1 text-xs font-medium', CERT_COLORS[cert] ?? 'bg-muted text-muted-foreground')}>
                  {cert}
                </span>
              ))}
            </div>
          </div>

          {/* Add to fleet CTA */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
            <h3 className="mb-1 text-sm font-semibold">Want to log time in the {aircraft.model}?</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Add it to your fleet and track hours, fuel costs, and maintenance from your logbook.
            </p>
            <button
              onClick={handleAddToFleet}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add to My Fleet
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
