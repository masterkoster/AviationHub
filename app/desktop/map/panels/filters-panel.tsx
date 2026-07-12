'use client'

interface FiltersPanelProps {
  airportSizeMode: 'all' | 'only-large' | 'only-medium' | 'only-small'
  setAirportSizeMode: (v: 'all' | 'only-large' | 'only-medium' | 'only-small') => void
  airportLimit: number
  setAirportLimit: (v: number) => void
  regionMode: 'map-view' | 'all-us' | 'east-coast' | 'west-coast'
  setRegionMode: (v: 'map-view' | 'all-us' | 'east-coast' | 'west-coast') => void
  airportCount: number
}

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

export function FiltersPanel(props: FiltersPanelProps) {
  const { airportSizeMode, setAirportSizeMode, airportLimit, setAirportLimit, regionMode, setRegionMode, airportCount } = props

  return (
    <div className="space-y-4">
      {/* Airport size filter */}
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

      {/* Airport count limit */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Max Airports
          </label>
          <span className="text-xs font-semibold">{airportLimit}</span>
        </div>
        <input
          type="range"
          min={50}
          max={1000}
          step={50}
          value={airportLimit}
          onChange={(e) => setAirportLimit(Number(e.target.value))}
          className="w-full accent-sky-500"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Currently showing {airportCount} airports. Higher values may impact performance.
        </p>
      </div>

      {/* Region filter */}
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
    </div>
  )
}
