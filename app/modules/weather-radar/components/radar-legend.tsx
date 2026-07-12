'use client'

const RADAR_COLORS = [
  { color: '#00ff00', label: 'Light' },
  { color: '#00cc00', label: '' },
  { color: '#009900', label: '' },
  { color: '#ffcc00', label: 'Moderate' },
  { color: '#ff9900', label: '' },
  { color: '#ff6600', label: '' },
  { color: '#ff0000', label: 'Heavy' },
  { color: '#cc0000', label: '' },
  { color: '#990000', label: '' },
  { color: '#ff00ff', label: 'Severe' },
]

const CAT_ITEMS = [
  { color: '#22c55e', label: 'VFR', desc: '>3 SM, >1000ft' },
  { color: '#3b82f6', label: 'MVFR', desc: '3-5 SM, 500-1000ft' },
  { color: '#ef4444', label: 'IFR', desc: '1-3 SM, 200-500ft' },
  { color: '#a855f7', label: 'LIFR', desc: '<1 SM, <200ft' },
]

const HAZARD_ITEMS = [
  { color: '#f59e0b', label: 'AIRMET' },
  { color: '#ef4444', label: 'SIGMET' },
  { color: '#a855f7', label: 'TFR' },
  { color: '#06b6d4', label: 'PIREP' },
]

interface RadarLegendProps {
  show: boolean
  onClose: () => void
}

export default function RadarLegend({ show, onClose }: RadarLegendProps) {
  if (!show) return null

  return (
    <div className="absolute top-24 right-4 z-[1000] pointer-events-auto w-[220px]">
      <div className="rounded-2xl border border-slate-200/10 bg-slate-900/60 backdrop-blur-xl shadow-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white">Legend</span>
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-white">Close</button>
        </div>

        {/* Radar intensity */}
        <div>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Radar Intensity</div>
          <div className="flex h-4 rounded overflow-hidden">
            {RADAR_COLORS.map((c, i) => (
              <div key={i} className="flex-1" style={{ backgroundColor: c.color }} title={c.label || undefined} />
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
            <span>Light</span>
            <span>Heavy</span>
            <span>Severe</span>
          </div>
        </div>

        {/* Flight categories */}
        <div>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Flight Categories</div>
          <div className="space-y-1">
            {CAT_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-slate-200">{item.label}</span>
                <span className="text-[9px] text-slate-400">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hazard types */}
        <div>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Hazards</div>
          <div className="space-y-1">
            {HAZARD_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-slate-200">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[9px] text-slate-500">
          Radar: IEM MRMS/NEXRAD / RainViewer • METAR: NOAA
        </div>
      </div>
    </div>
  )
}
