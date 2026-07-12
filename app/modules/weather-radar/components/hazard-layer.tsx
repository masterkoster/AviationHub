'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import L from 'leaflet'
import { fetchHazards } from '@/desktop/lib/weather-fetch'
import type { HazardData } from '@/desktop/lib/weather-types'

// ── Hazard severity config ──

const HAZARD_STYLE: Record<string, { color: string; fillColor: string; icon: string }> = {
  warning: { color: '#ef4444', fillColor: '#ef4444', icon: '🔴' },
  caution: { color: '#f59e0b', fillColor: '#f59e0b', icon: '🟡' },
  advisory: { color: '#3b82f6', fillColor: '#3b82f6', icon: '🔵' },
}

const HAZARD_TYPE_COLORS: Record<string, string> = {
  AIRMET: '#f59e0b',
  SIGMET: '#ef4444',
  TFR: '#a855f7',
  NOTAM: '#3b82f6',
  PIREP: '#06b6d4',
}

// ── Props ──

interface HazardLayerProps {
  map: L.Map | null
  enabled: boolean
}

// ── Hazard div icon helper ──

function createHazardIcon(type: string, severity: string) {
  const bg = HAZARD_TYPE_COLORS[type] || '#6b7280'
  return L.divIcon({
    className: 'hazard-marker',
    html: `<div style="
      width: 20px; height: 20px;
      border-radius: 50%;
      background: ${bg};
      border: 2px solid white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      color: white;
      font-weight: bold;
    ">${type === 'AIRMET' ? 'A' : type === 'SIGMET' ? 'S' : type === 'TFR' ? 'T' : type === 'PIREP' ? 'P' : 'N'}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

// ── Component ──

export default function HazardLayer({ map, enabled }: HazardLayerProps) {
  const groupRef = useRef<L.LayerGroup | null>(null)
  const [activeHazard, setActiveHazard] = useState<HazardData | null>(null)
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Create layer group
  useEffect(() => {
    if (!map) return
    if (!groupRef.current) {
      groupRef.current = L.layerGroup().addTo(map)
    }
    return () => {
      if (groupRef.current) {
        groupRef.current.clearLayers()
        map.removeLayer(groupRef.current)
        groupRef.current = null
      }
    }
  }, [map])

  // Fetch and render hazards
  const loadHazards = useCallback(async () => {
    if (!map || !groupRef.current) return

    const bounds = map.getBounds()

    try {
      const hazards = await fetchHazards({
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLon: bounds.getWest(),
        maxLon: bounds.getEast(),
      })

      if (!groupRef.current) return
      groupRef.current.clearLayers()

      if (hazards.length === 0) return

      // Place hazard markers at approximate locations around the center
      // (NOAA doesn't provide polygon coords in this API, so we scatter them)
      const center = bounds.getCenter()
      const hazardsPerQuadrant = Math.ceil(hazards.length / 4)

      hazards.forEach((hazard, i) => {
        // Offset each hazard slightly so they don't stack
        const quad = Math.floor(i / hazardsPerQuadrant)
        const offsetLat = (quad % 2 === 0 ? 0.5 : -0.5) * (0.5 + (i % 5) * 0.3)
        const offsetLng = (quad < 2 ? -0.5 : 0.5) * (0.5 + (i % 5) * 0.3)

        const lat = center.lat + offsetLat
        const lng = center.lng + offsetLng

        const icon = createHazardIcon(hazard.type, hazard.severity)

        const marker = L.marker([lat, lng], { icon })
          .bindTooltip(
            `<div class="text-xs max-w-[200px]">
              <strong>${hazard.type}</strong> — ${hazard.title}<br/>
              <span class="text-slate-400">${hazard.severity}</span>
            </div>`,
            { direction: 'top' }
          )
          .on('click', () => {
            setActiveHazard(hazard)
          })

        groupRef.current?.addLayer(marker)
      })
    } catch {
      // Silently fail
    }
  }, [map])

  // Watch map moves to refresh hazards
  useEffect(() => {
    if (!map || !enabled) return

    loadHazards()

    const handleMoveEnd = () => loadHazards()
    map.on('moveend', handleMoveEnd)

    // Refresh every 10 minutes
    refreshRef.current = setInterval(loadHazards, 10 * 60 * 1000)

    return () => {
      map.off('moveend', handleMoveEnd)
      if (refreshRef.current) clearInterval(refreshRef.current)
    }
  }, [map, enabled, loadHazards])

  // Show/hide
  useEffect(() => {
    if (!groupRef.current) return
    if (enabled) {
      map?.addLayer(groupRef.current)
      loadHazards()
    } else {
      map?.removeLayer(groupRef.current)
    }
  }, [map, enabled, loadHazards])

  return (
    <>
      {/* Hazard detail popup */}
      {activeHazard && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto">
          <div className="rounded-2xl border border-slate-200/10 bg-slate-900/80 backdrop-blur-xl shadow-xl w-80 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">{activeHazard.type}</span>
                <span className="text-xs font-medium text-white">{activeHazard.title}</span>
              </div>
              <button onClick={() => setActiveHazard(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>
            {activeHazard.description && (
              <p className="text-[11px] text-slate-300 mb-1">{activeHazard.description}</p>
            )}
            {activeHazard.validFrom && activeHazard.validTo && (
              <p className="text-[10px] text-slate-400">
                {new Date(activeHazard.validFrom).toLocaleString()} → {new Date(activeHazard.validTo).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
