'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import L from 'leaflet'

interface PirepRecord {
  lat?: number
  lon?: number
  rawOb?: string
  turbInten?: string
  icgInten?: string
  altiFt?: number
  icaoId?: string
}

interface PirepLayerProps {
  map: L.Map | null
  enabled: boolean
}

function pirepColor(turb?: string, icg?: string): string {
  const t = (turb ?? '').toUpperCase()
  const i = (icg ?? '').toUpperCase()
  if (t.includes('EXTRM') || t.includes('SEV') || i.includes('SEV') || i.includes('EXTRM')) return '#ef4444'
  if (t.includes('MOD') || i.includes('MOD')) return '#f97316'
  if (t.includes('LGT') || i.includes('LGT')) return '#eab308'
  if (t === 'NEG' || t === 'SMTH-LGT' || t === 'SMTH') return '#22c55e'
  return '#06b6d4'
}

function pirepLabel(turb?: string, icg?: string): string {
  if (turb && turb !== 'NEG' && turb !== 'SMTH') return `TURB · ${turb}`
  if (icg && icg !== 'NEG') return `ICG · ${icg}`
  return 'PIREP'
}

export default function PirepLayer({ map, enabled }: PirepLayerProps) {
  const groupRef = useRef<L.LayerGroup | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [active, setActive] = useState<PirepRecord | null>(null)

  // Create/destroy layer group with map
  useEffect(() => {
    if (!map) return
    groupRef.current = L.layerGroup()
    return () => {
      groupRef.current?.clearLayers()
      if (groupRef.current) map.removeLayer(groupRef.current)
      groupRef.current = null
    }
  }, [map])

  const load = useCallback(async () => {
    if (!map || !groupRef.current) return
    const b = map.getBounds()
    const bbox = `${b.getSouth().toFixed(1)},${b.getWest().toFixed(1)},${b.getNorth().toFixed(1)},${b.getEast().toFixed(1)}`
    try {
      const res = await fetch(
        `/api/noaa?url=${encodeURIComponent(`https://aviationweather.gov/api/data/pirep?format=json&bbox=${bbox}&age=3`)}`,
        { signal: AbortSignal.timeout(10000) },
      )
      if (!res.ok || !groupRef.current) return
      const data = (await res.json()) as PirepRecord[]
      if (!Array.isArray(data) || !groupRef.current) return

      groupRef.current.clearLayers()
      for (const p of data.slice(0, 80)) {
        if (!p.lat || !p.lon) continue
        const color = pirepColor(p.turbInten, p.icgInten)
        const label = pirepLabel(p.turbInten, p.icgInten)
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.8);box-shadow:0 1px 4px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:7px;color:#fff;font-weight:700">P</div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        })
        L.marker([p.lat, p.lon], { icon })
          .bindTooltip(`<b>${label}</b>${p.altiFt ? ` · ${p.altiFt.toLocaleString()} ft` : ''}`, { direction: 'top' })
          .on('click', () => setActive(p))
          .addTo(groupRef.current!)
      }
    } catch {
      /* ignore */
    }
  }, [map])

  useEffect(() => {
    if (!map || !enabled) return
    load()
    map.on('moveend', load)
    timerRef.current = setInterval(load, 10 * 60 * 1000)
    return () => {
      map.off('moveend', load)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [map, enabled, load])

  useEffect(() => {
    if (!map || !groupRef.current) return
    if (enabled) {
      map.addLayer(groupRef.current)
      load()
    } else {
      map.removeLayer(groupRef.current)
      setActive(null)
    }
  }, [map, enabled, load])

  if (!active) return null
  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto w-80">
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/90 backdrop-blur-xl shadow-xl p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-cyan-500/20 border border-cyan-500/30 text-cyan-300">
              PIREP
            </span>
            {active.altiFt && (
              <span className="text-xs text-slate-400">{active.altiFt.toLocaleString()} ft</span>
            )}
          </div>
          <button
            onClick={() => setActive(null)}
            className="text-slate-400 hover:text-white text-sm leading-none"
          >
            ✕
          </button>
        </div>
        {active.turbInten && active.turbInten !== 'NEG' && (
          <div className="text-xs text-orange-300 mb-0.5">Turbulence: {active.turbInten}</div>
        )}
        {active.icgInten && active.icgInten !== 'NEG' && (
          <div className="text-xs text-blue-300 mb-0.5">Icing: {active.icgInten}</div>
        )}
        <p className="text-[11px] text-slate-300 font-mono break-all leading-relaxed mt-1">
          {active.rawOb ?? '—'}
        </p>
      </div>
    </div>
  )
}
