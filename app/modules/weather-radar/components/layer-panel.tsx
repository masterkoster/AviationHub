'use client'

import { useState } from 'react'
import { Layers, CloudSun, MapPin, Radio, Wind, TriangleAlert } from 'lucide-react'

export type RadarSource = 'mrms' | 'nexrad' | 'rainviewer'
export type BasemapMode = 'light' | 'dark'

export interface LayerState {
  radar: boolean
  metar: boolean
  hazards: boolean
}

interface LayerPanelProps {
  layers: LayerState
  onToggle: (layer: keyof LayerState) => void
  radarSource: RadarSource
  onRadarSourceChange: (source: RadarSource) => void
  basemap: BasemapMode
  onBasemapChange: (mode: BasemapMode) => void
  radarOpacity: number
  onRadarOpacityChange: (opacity: number) => void
}

const RADAR_SOURCES: { value: RadarSource; label: string; detail: string }[] = [
  { value: 'mrms', label: 'MRMS', detail: 'High-res, 2min' },
  { value: 'nexrad', label: 'NEXRAD', detail: 'Standard, 5min' },
  { value: 'rainviewer', label: 'RainViewer', detail: 'Global' },
]

const LAYER_CONFIG: { key: keyof LayerState; icon: typeof CloudSun; label: string; desc: string }[] = [
  { key: 'radar', icon: Radio, label: 'Radar', desc: 'Precipitation overlay' },
  { key: 'metar', icon: MapPin, label: 'METAR Stations', desc: 'Flight category dots' },
  { key: 'hazards', icon: TriangleAlert, label: 'Hazards', desc: 'AIRMET/SIGMET' },
]

export default function LayerPanel({
  layers,
  onToggle,
  radarSource,
  onRadarSourceChange,
  basemap,
  onBasemapChange,
  radarOpacity,
  onRadarOpacityChange,
}: LayerPanelProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="h-10 w-10 rounded-xl bg-slate-800/70 hover:bg-slate-700/70 border border-slate-700 text-slate-200 flex items-center justify-center"
        title="Weather Layers"
      >
        <Layers className="h-4 w-4" />
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="absolute top-24 left-16 z-[1000] w-56 pointer-events-auto">
          <div className="rounded-2xl border border-slate-200/10 bg-slate-900/80 backdrop-blur-xl shadow-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white uppercase tracking-wider">Layers</span>
              <button
                onClick={() => setExpanded(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            {/* Layer toggles */}
            <div className="space-y-1">
              {LAYER_CONFIG.map((cfg) => {
                const Icon = cfg.icon
                const isOn = layers[cfg.key]
                return (
                  <button
                    key={cfg.key}
                    onClick={() => onToggle(cfg.key)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                      isOn
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'text-slate-300 hover:bg-slate-800/70'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isOn ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <div className="flex-1">
                      <div className="text-xs font-medium">{cfg.label}</div>
                      <div className="text-[10px] text-slate-400">{cfg.desc}</div>
                    </div>
                    <div
                      className={`h-3.5 w-3.5 rounded border ${
                        isOn
                          ? 'border-emerald-500 bg-emerald-500'
                          : 'border-slate-600 bg-transparent'
                      }`}
                    />
                  </button>
                )
              })}
            </div>

            {/* Radar source selector (only when radar is on) */}
            {layers.radar && (
              <>
                <div className="border-t border-slate-700/50 pt-2">
                  <div className="mb-1.5 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                    Radar Source
                  </div>
                  <div className="flex gap-1">
                    {RADAR_SOURCES.map((src) => (
                      <button
                        key={src.value}
                        onClick={() => onRadarSourceChange(src.value)}
                        className={`flex-1 rounded-lg px-2 py-1.5 text-center text-[10px] transition-colors ${
                          radarSource === src.value
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800/70 text-slate-400 border border-slate-700/50 hover:text-slate-200'
                        }`}
                      >
                        <div className="font-medium">{src.label}</div>
                        <div className="text-[8px] opacity-70">{src.detail}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Opacity slider */}
                <div className="border-t border-slate-700/50 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                      Opacity
                    </span>
                    <span className="text-[10px] text-slate-400">{Math.round(radarOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.01}
                    value={radarOpacity}
                    onChange={(e) => onRadarOpacityChange(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </>
            )}

            {/* Basemap toggle */}
            <div className="border-t border-slate-700/50 pt-2">
              <div className="mb-1.5 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                Basemap
              </div>
              <div className="flex gap-1">
                {(['light', 'dark'] as BasemapMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onBasemapChange(mode)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-center text-[10px] transition-colors ${
                      basemap === mode
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800/70 text-slate-400 border border-slate-700/50 hover:text-slate-200'
                    }`}
                  >
                    {mode === 'light' ? '☀️ Light' : '🌙 Dark'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
