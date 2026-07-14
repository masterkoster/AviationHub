'use client'

import type { MapLayerOptions } from '@/shared/components/map/map-controls'
import type { MapBaseLayer } from '@/shared/components/map/maplibre-style'
import { ChevronUp, ChevronDown, X } from 'lucide-react'

/** Haversine distance in NM */
function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** True heading from point A to B */
function trueHeading(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180)
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

interface FiltersPanelProps {
  /* Airport filters */
  airportSizeMode: 'all' | 'only-large' | 'only-medium' | 'only-small'
  setAirportSizeMode: (v: 'all' | 'only-large' | 'only-medium' | 'only-small') => void
  airportLimit: number
  setAirportLimit: (v: number) => void
  regionMode: 'map-view' | 'all-us' | 'east-coast' | 'west-coast'
  setRegionMode: (v: 'map-view' | 'all-us' | 'east-coast' | 'west-coast') => void
  airportCount: number
  /* Base layer + overlays */
  mapOptions: MapLayerOptions
  onMapOptionsChange: (next: MapLayerOptions) => void
  /* Attribution */
  showAttribution: boolean
  onShowAttributionChange: (v: boolean) => void
  attributionDetail: 'minimal' | 'standard' | 'full'
  onAttributionDetailChange: (v: 'minimal' | 'standard' | 'full') => void
  /* Military tools */
  showMgrsGrid: boolean
  onShowMgrsGridChange: (v: boolean) => void
  showRuler: boolean
  onShowRulerChange: (v: boolean) => void
  showCompass: boolean
  onShowCompassChange: (v: boolean) => void
  rulerPointCount: number
  rulerPoints: Array<{ lat: number; lng: number }>
  onRulerPointRemove: (index: number) => void
  onRulerPointReorder: (from: number, to: number) => void
  onRulerClear: () => void
  /* Range Rings */
  showRangeRings: boolean
  onShowRangeRingsChange: (v: boolean) => void
  rangeRingIntervals: number[]
  onRangeRingIntervalsChange: (v: number[]) => void
}

const BASE_LAYERS: { id: MapBaseLayer; label: string; hint: string }[] = [
  { id: 'osm',       label: 'OSM',       hint: 'OpenStreetMap streets' },
  { id: 'satellite', label: 'Satellite', hint: 'Esri World Imagery' },
  { id: 'terrain',   label: 'Terrain',   hint: 'OpenTopoMap relief' },
  { id: 'dark',      label: 'Dark',      hint: 'CartoDB dark streets' },
  { id: 'aero',      label: 'Aero',      hint: 'Esri World Navigation Charts' },
]

const OVERLAYS: { key: 'showTfrs' | 'showPireps'; label: string; hint: string }[] = [
  { key: 'showTfrs',    label: 'TFRs',            hint: 'Temporary flight restrictions' },
  { key: 'showPireps',  label: 'PIREPs',          hint: 'Pilot reports of conditions' },
]

const SIZE_OPTIONS = [
  { value: 'all', label: 'All airports' },
  { value: 'only-large', label: 'Large only' },
  { value: 'only-medium', label: 'Medium + Large' },
  { value: 'only-small', label: 'All (incl. small)' },
] as const

const REGION_OPTIONS = [
  { value: 'map-view', label: 'Follow map view' },
  { value: 'all-us', label: 'All US' },
  { value: 'east-coast', label: 'East Coast' },
  { value: 'west-coast', label: 'West Coast' },
] as const

const ATTRIBUTION_LEVELS = [
  { value: 'minimal', label: 'Minimal', hint: 'Source name only' },
  { value: 'standard', label: 'Standard', hint: 'Source + copyright' },
  { value: 'full', label: 'Full', hint: 'Complete credits with links' },
] as const

export function FiltersPanel(props: FiltersPanelProps) {
  const {
    airportSizeMode, setAirportSizeMode,
    airportLimit, setAirportLimit,
    regionMode, setRegionMode,
    airportCount,
    mapOptions, onMapOptionsChange,
    showAttribution, onShowAttributionChange,
    attributionDetail, onAttributionDetailChange,
    showMgrsGrid, onShowMgrsGridChange,
    showRuler, onShowRulerChange,
    showCompass, onShowCompassChange,
    rulerPointCount, rulerPoints, onRulerPointRemove, onRulerPointReorder, onRulerClear,
    showRangeRings, onShowRangeRingsChange, rangeRingIntervals, onRangeRingIntervalsChange,
  } = props

  return (
    <div className="space-y-4">
      {/* ── Base Layer ── */}
      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Base Layer
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {BASE_LAYERS.map((layer) => {
            const active = mapOptions.baseLayer === layer.id
            return (
              <button
                key={layer.id}
                onClick={() => onMapOptionsChange({ ...mapOptions, baseLayer: layer.id })}
                className={`flex flex-col items-start rounded-md border px-2.5 py-2 text-left text-xs transition-colors ${
                  active
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border bg-card hover:bg-muted'
                }`}
              >
                <span className="font-medium">{layer.label}</span>
                <span className="text-[10px] text-muted-foreground">{layer.hint}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Overlays ── */}
      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Overlays
        </label>
        <div className="space-y-1.5">
          {OVERLAYS.map((opt) => {
            const checked = !!mapOptions[opt.key]
            return (
              <button
                key={opt.key}
                onClick={() => onMapOptionsChange({ ...mapOptions, [opt.key]: !checked })}
                className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
              >
                <span
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                    checked ? 'border-primary bg-primary' : 'border-border'
                  }`}
                >
                  {checked && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                </span>
                <span className="flex flex-col">
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-[10px] text-muted-foreground">{opt.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Airport Size ── */}
      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Airport Size
        </label>
        <div className="space-y-1">
          {SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setAirportSizeMode(opt.value)}
              className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                airportSizeMode === opt.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border bg-card hover:bg-muted'
              }`}
            >
              <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                airportSizeMode === opt.value ? 'border-primary bg-primary' : 'border-border'
              }`}>
                {airportSizeMode === opt.value && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
              </span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Max Airports ── */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Max Airports
          </label>
          <span className="text-xs font-semibold">{airportLimit.toLocaleString()}</span>
        </div>
        <input
          type="range"
          min={50}
          max={5000}
          step={50}
          value={airportLimit}
          onChange={(e) => setAirportLimit(Number(e.target.value))}
          className="w-full accent-sky-500"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Currently showing {airportCount.toLocaleString()} airports. Higher values may impact performance on slower devices.
        </p>
      </div>

      {/* ── Region ── */}
      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Region
        </label>
        <select
          value={regionMode}
          onChange={(e) => setRegionMode(e.target.value as typeof regionMode)}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        >
          {REGION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* ── Military Tools ── */}
      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Military Tools
        </label>
        <div className="space-y-1.5">
          {/* MGRS Grid */}
          <button
            onClick={() => onShowMgrsGridChange(!showMgrsGrid)}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
          >
            <span
              className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                showMgrsGrid ? 'border-primary bg-primary' : 'border-border'
              }`}
            >
              {showMgrsGrid && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
            </span>
            <span className="flex flex-col">
              <span className="font-medium">Reference Grid</span>
              <span className="text-[10px] text-muted-foreground">Distance grid with nm/mi/km per block</span>
            </span>
          </button>

          {/* Compass Rose */}
          <button
            onClick={() => onShowCompassChange(!showCompass)}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
          >
            <span
              className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                showCompass ? 'border-primary bg-primary' : 'border-border'
              }`}
            >
              {showCompass && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
            </span>
            <span className="flex flex-col">
              <span className="font-medium">Compass Rose</span>
              <span className="text-[10px] text-muted-foreground">Direction indicator overlay</span>
            </span>
          </button>

          {/* Distance Ruler */}
          <button
            onClick={() => onShowRulerChange(!showRuler)}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
          >
            <span
              className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                showRuler ? 'border-primary bg-primary' : 'border-border'
              }`}
            >
              {showRuler && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
            </span>
            <span className="flex flex-col">
              <span className="font-medium">Distance Ruler</span>
              <span className="text-[10px] text-muted-foreground">
                {showRuler
                  ? rulerPointCount > 0
                    ? `${rulerPointCount} point${rulerPointCount > 1 ? 's' : ''} — click map to add`
                    : 'Click map to place points'
                  : 'Click to enable, then click map'}
              </span>
            </span>
          </button>

          {/* Ruler point list */}
          {showRuler && rulerPoints.length > 0 && (
            <div className="ml-5 space-y-1">
              {rulerPoints.map((pt, i) => {
                let segmentNm: number | null = null
                let segmentHdg: number | null = null
                if (i > 0) {
                  const prev = rulerPoints[i - 1]
                  segmentNm = haversineNm(prev.lat, prev.lng, pt.lat, pt.lng)
                  segmentHdg = trueHeading(prev.lat, prev.lng, pt.lat, pt.lng)
                }
                return (
                  <div key={i}>
                    {segmentNm !== null && (
                      <div className="text-[9px] text-muted-foreground pl-1">
                        → {Math.round(segmentNm)} nm · {Math.round(segmentHdg!)}°
                      </div>
                    )}
                    <div className="flex items-center gap-1 rounded border border-border bg-card px-1.5 py-1">
                      <span className="w-4 text-center text-[10px] font-bold text-primary">{i + 1}</span>
                      <span className="flex-1 text-[10px] text-muted-foreground font-mono">
                        {pt.lat.toFixed(4)}°{pt.lat >= 0 ? 'N' : 'S'} {pt.lng.toFixed(4)}°{pt.lng >= 0 ? 'E' : 'W'}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => i > 0 && onRulerPointReorder(i, i - 1)}
                          disabled={i === 0}
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                          title="Move up"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => i < rulerPoints.length - 1 && onRulerPointReorder(i, i + 1)}
                          disabled={i === rulerPoints.length - 1}
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                          title="Move down"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => onRulerPointRemove(i)}
                          className="rounded p-0.5 text-destructive/70 hover:bg-destructive/10"
                          title="Remove point"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
              {/* Total */}
              {rulerPoints.length >= 2 && (() => {
                let total = 0
                for (let i = 1; i < rulerPoints.length; i++) {
                  total += haversineNm(rulerPoints[i - 1].lat, rulerPoints[i - 1].lng, rulerPoints[i].lat, rulerPoints[i].lng)
                }
                return (
                  <div className="text-[10px] font-semibold text-primary pl-1">
                    Total: {Math.round(total)} nm
                  </div>
                )
              })()}
              <button
                onClick={onRulerClear}
                className="text-[10px] text-destructive hover:underline"
              >
                Clear all ({rulerPointCount} point{rulerPointCount > 1 ? 's' : ''})
              </button>
            </div>
          )}

          {/* Range Rings */}
          <button
            onClick={() => onShowRangeRingsChange(!showRangeRings)}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
          >
            <span
              className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                showRangeRings ? 'border-primary bg-primary' : 'border-border'
              }`}
            >
              {showRangeRings && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
            </span>
            <span className="flex flex-col">
              <span className="font-medium">Range Rings</span>
              <span className="text-[10px] text-muted-foreground">
                {showRangeRings
                  ? `${rangeRingIntervals.length} interval${rangeRingIntervals.length !== 1 ? 's' : ''} — centered on last waypoint`
                  : 'Concentric range circles in nautical miles'}
              </span>
            </span>
          </button>

          {/* Range Ring interval picker */}
          {showRangeRings && (
            <div className="ml-5 space-y-1.5">
              <p className="text-[10px] text-muted-foreground">Intervals (nm)</p>
              <div className="flex flex-wrap gap-1">
                {[10, 25, 50, 100, 200, 500].map((nm) => {
                  const active = rangeRingIntervals.includes(nm)
                  return (
                    <button
                      key={nm}
                      onClick={() => {
                        onRangeRingIntervalsChange(
                          active
                            ? rangeRingIntervals.filter((v) => v !== nm)
                            : [...rangeRingIntervals, nm].sort((a, b) => a - b)
                        )
                      }}
                      className={`rounded border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {nm}
                    </button>
                  )
                })}
              </div>
              {rangeRingIntervals.length === 0 && (
                <p className="text-[10px] text-destructive">Select at least one interval</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Map Attribution ── */}
      <div className="rounded-md border border-border bg-muted/20 p-2.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Map Attribution
          </label>
          <button
            onClick={() => onShowAttributionChange(!showAttribution)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              showAttribution ? 'bg-primary' : 'bg-muted'
            }`}
            aria-label={showAttribution ? 'Hide map attribution' : 'Show map attribution'}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform ${
                showAttribution ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        {showAttribution && (
          <div className="mt-2.5 space-y-1">
            <p className="text-[10px] text-muted-foreground">Detail level</p>
            <div className="flex gap-1">
              {ATTRIBUTION_LEVELS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onAttributionDetailChange(opt.value as typeof attributionDetail)}
                  title={opt.hint}
                  className={`flex-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                    attributionDetail === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
