'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Calculator, Wind, Fuel, Gauge, ArrowRightLeft, Sun, Compass,
  type LucideIcon,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'

type Tool = 'wind' | 'crosswind' | 'fuel' | 'tas' | 'convert' | 'sun'

// ── Solar position algorithm (USNO simplified) ────────────────────────────────

function calcSunAngle(
  date: Date,
  lat: number,
  lng: number,
  angle: number,
): { rise: Date | null; set: Date | null; noon: Date } {
  const rad = Math.PI / 180
  const JD = date.getTime() / 86400000 + 2440587.5
  const n = JD - 2451545.0 + 0.0008
  const Jstar = n - lng / 360
  const M = ((357.5291 + 0.98560028 * Jstar) % 360 + 360) % 360
  const Mrad = M * rad
  const C =
    1.9148 * Math.sin(Mrad) +
    0.02 * Math.sin(2 * Mrad) +
    0.0003 * Math.sin(3 * Mrad)
  const lambda = ((M + C + 180 + 102.9372) % 360 + 360) % 360
  const Jtransit =
    2451545.0 +
    Jstar +
    0.0053 * Math.sin(Mrad) -
    0.0069 * Math.sin(2 * lambda * rad)
  const sinDec = Math.sin(lambda * rad) * Math.sin(23.4397 * rad)
  const cosDec = Math.cos(Math.asin(sinDec))
  const noon = new Date((Jtransit - 2440587.5) * 86400000)
  const cosH =
    (Math.sin(angle * rad) - Math.sin(lat * rad) * sinDec) /
    (Math.cos(lat * rad) * cosDec)
  if (cosH < -1 || cosH > 1) return { rise: null, set: null, noon }
  const H = Math.acos(cosH) * (180 / Math.PI)
  const jdToDate = (jd: number) => new Date((jd - 2440587.5) * 86400000)
  return {
    rise: jdToDate(Jtransit - H / 360),
    set: jdToDate(Jtransit + H / 360),
    noon,
  }
}

function formatTime(date: Date | null, tz: string): string {
  if (!date) return '—'
  try {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz,
    })
  } catch {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DesktopToolsPage() {
  const [active, setActive] = useState<Tool>('wind')

  const nav: { id: Tool; label: string; icon: LucideIcon }[] = [
    { id: 'wind', label: 'Wind Correction', icon: Wind },
    { id: 'crosswind', label: 'Crosswind', icon: Compass },
    { id: 'fuel', label: 'Fuel Burn', icon: Fuel },
    { id: 'tas', label: 'True Airspeed', icon: Gauge },
    { id: 'convert', label: 'Unit Converter', icon: ArrowRightLeft },
    { id: 'sun', label: 'Sunrise / Sunset', icon: Sun },
  ]

  return (
    <div className="flex h-full min-h-screen bg-background">
      {/* Sidebar nav */}
      <aside className="w-52 shrink-0 border-r border-border bg-card flex flex-col py-4">
        <div className="px-4 mb-4 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm">E6B &amp; Tools</span>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left w-full ${
                active === item.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Tool area */}
      <main className="flex-1 overflow-auto p-8">
        {active === 'wind' && <WindTool />}
        {active === 'crosswind' && <CrosswindTool />}
        {active === 'fuel' && <FuelTool />}
        {active === 'tas' && <TASTool />}
        {active === 'convert' && <ConvertTool />}
        {active === 'sun' && <SunTool />}
      </main>
    </div>
  )
}

// ── Wind Correction ───────────────────────────────────────────────────────────

function WindTool() {
  const [tas, setTas] = useState(120)
  const [heading, setHeading] = useState(360)
  const [windDir, setWindDir] = useState(270)
  const [windSpeed, setWindSpeed] = useState(15)
  const [result, setResult] = useState<{ gs: number; track: number; wca: number } | null>(null)

  const calculate = () => {
    const toRad = (d: number) => (d * Math.PI) / 180
    const windFrom = toRad(windDir) + Math.PI
    const wx = windSpeed * Math.cos(windFrom)
    const wy = windSpeed * Math.sin(windFrom)
    const gsx = tas * Math.cos(toRad(heading)) - wx
    const gsy = tas * Math.sin(toRad(heading)) - wy
    const gs = Math.sqrt(gsx * gsx + gsy * gsy)
    const track = ((Math.atan2(gsy, gsx) * 180) / Math.PI + 360) % 360
    setResult({ gs: Math.round(gs), track: Math.round(track), wca: Math.round(track - heading) })
  }

  return (
    <ToolShell
      title="Wind Correction Angle"
      description="Calculate ground speed, track, and wind correction angle from TAS and winds."
    >
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <Field label="True Airspeed (kts)" value={tas} onChange={setTas} />
        <Field label="Course (°)" value={heading} onChange={setHeading} />
        <Field label="Wind From (°)" value={windDir} onChange={setWindDir} />
        <Field label="Wind Speed (kts)" value={windSpeed} onChange={setWindSpeed} />
      </div>
      <Button onClick={calculate} className="mt-4">
        Calculate
      </Button>
      {result && (
        <ResultGrid>
          <ResultRow label="Ground Speed" value={`${result.gs} kts`} />
          <ResultRow label="Track" value={`${result.track}°`} />
          <ResultRow
            label="Wind Correction Angle"
            value={`${result.wca > 0 ? '+' : ''}${result.wca}°`}
            color={result.wca !== 0 ? (result.wca > 0 ? 'amber' : 'blue') : undefined}
          />
        </ResultGrid>
      )}
    </ToolShell>
  )
}

// ── Crosswind Calculator ──────────────────────────────────────────────────────

function CrosswindTool() {
  const [rwHdg, setRwHdg] = useState(180)
  const [windDir, setWindDir] = useState(220)
  const [windSpeed, setWindSpeed] = useState(15)
  const [gusts, setGusts] = useState<number | ''>('')
  const [result, setResult] = useState<{
    xw: number
    hw: number
    xwG?: number
    hwG?: number
    side: 'left' | 'right' | 'none'
    tailwind: boolean
  } | null>(null)

  const calculate = () => {
    const angleRad = ((windDir - rwHdg) * Math.PI) / 180
    const xw = windSpeed * Math.sin(angleRad)
    const hw = windSpeed * Math.cos(angleRad)
    let xwG: number | undefined, hwG: number | undefined
    if (gusts !== '') {
      const g = Number(gusts)
      xwG = Math.abs(g * Math.sin(angleRad))
      hwG = g * Math.cos(angleRad)
    }
    setResult({
      xw: +(Math.abs(xw).toFixed(1)),
      hw: +(Math.abs(hw).toFixed(1)),
      xwG: xwG !== undefined ? +xwG.toFixed(1) : undefined,
      hwG: hwG !== undefined ? +Math.abs(hwG).toFixed(1) : undefined,
      side: xw > 0.5 ? 'right' : xw < -0.5 ? 'left' : 'none',
      tailwind: hw < 0,
    })
  }

  return (
    <ToolShell
      title="Crosswind Calculator"
      description="Runway crosswind and headwind/tailwind components from reported winds."
    >
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <div>
          <Label className="text-xs text-muted-foreground">Runway Heading (°)</Label>
          <p className="text-xs text-muted-foreground/60 mb-1">Runway 18 → 180°</p>
          <Input
            type="number"
            value={rwHdg}
            onChange={(e) => setRwHdg(Number(e.target.value))}
          />
        </div>
        <Field label="Wind From (°)" value={windDir} onChange={setWindDir} />
        <Field label="Wind Speed (kts)" value={windSpeed} onChange={setWindSpeed} />
        <div>
          <Label className="text-xs text-muted-foreground">Gusts (kts, optional)</Label>
          <Input
            type="number"
            value={gusts}
            placeholder="—"
            className="mt-1"
            onChange={(e) =>
              setGusts(e.target.value === '' ? '' : Number(e.target.value))
            }
          />
        </div>
      </div>
      <Button onClick={calculate} className="mt-4">
        Calculate
      </Button>
      {result && (
        <div className="mt-4 bg-muted rounded-lg divide-y divide-border max-w-md">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium">Crosswind</div>
              <div className="text-xs text-muted-foreground">
                {result.side === 'none'
                  ? 'No significant crosswind'
                  : `From the ${result.side}`}
              </div>
            </div>
            <div className="text-right">
              <span className="font-bold text-lg">{result.xw} kts</span>
              {result.xwG !== undefined && (
                <span className="text-sm text-muted-foreground ml-1">
                  (G{result.xwG})
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium">
                {result.tailwind ? 'Tailwind' : 'Headwind'}
              </div>
              {result.tailwind && (
                <div className="text-xs text-amber-500">Performance penalty</div>
              )}
            </div>
            <div className="text-right">
              <span
                className={`font-bold text-lg ${result.tailwind ? 'text-amber-500' : ''}`}
              >
                {result.hw} kts
              </span>
              {result.hwG !== undefined && (
                <span className="text-sm text-muted-foreground ml-1">
                  (G{result.hwG})
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </ToolShell>
  )
}

// ── Fuel Burn ─────────────────────────────────────────────────────────────────

function FuelTool() {
  const [fuelBurn, setFuelBurn] = useState(8.5)
  const [totalFuel, setTotalFuel] = useState(48)
  const [flightTime, setFlightTime] = useState(2.5)
  const [result, setResult] = useState<{
    fuelReq: number
    endurance: number
    reserve: number
  } | null>(null)

  const calculate = () => {
    const fuelReq = +(fuelBurn * flightTime).toFixed(1)
    const endurance = +(totalFuel / fuelBurn).toFixed(1)
    const reserve = +(totalFuel - fuelReq).toFixed(1)
    setResult({ fuelReq, endurance, reserve })
  }

  const reserveColor = result
    ? result.reserve < 6
      ? 'red'
      : result.reserve < 12
      ? 'amber'
      : 'green'
    : undefined

  return (
    <ToolShell
      title="Fuel Burn Calculator"
      description="Fuel required, endurance, and reserves for your flight."
    >
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <Field label="Fuel Burn (gph)" value={fuelBurn} onChange={setFuelBurn} step={0.1} />
        <Field label="Total Usable Fuel (gal)" value={totalFuel} onChange={setTotalFuel} />
        <Field label="Flight Time (hrs)" value={flightTime} onChange={setFlightTime} step={0.1} />
      </div>
      <Button onClick={calculate} className="mt-4">
        Calculate
      </Button>
      {result && (
        <ResultGrid>
          <ResultRow label="Fuel Required" value={`${result.fuelReq} gal`} />
          <ResultRow label="Endurance" value={`${result.endurance} hrs`} />
          <Separator />
          <ResultRow
            label="Fuel Remaining"
            value={`${result.reserve} gal`}
            color={reserveColor as 'red' | 'amber' | 'green'}
          />
        </ResultGrid>
      )}
    </ToolShell>
  )
}

// ── True Airspeed ─────────────────────────────────────────────────────────────

function TASTool() {
  const [ias, setIas] = useState(100)
  const [altitude, setAltitude] = useState(6500)
  const [oat, setOat] = useState<number | ''>('')
  const [result, setResult] = useState<{
    tas: number
    da: number
    isaTemp: number
  } | null>(null)

  const calculate = () => {
    const isaTemp = 15 - (altitude / 1000) * 2
    const temp = oat !== '' ? Number(oat) : isaTemp
    const tas = Math.round(ias * (1 + altitude / 1000 * 0.02))
    const da = Math.round(altitude + 118.8 * (temp - isaTemp))
    setResult({ tas, da, isaTemp: Math.round(isaTemp) })
  }

  return (
    <ToolShell
      title="True Airspeed & Density Altitude"
      description="Calculate TAS and density altitude from IAS, altitude, and temperature."
    >
      <div className="grid grid-cols-3 gap-4 max-w-lg">
        <Field label="IAS (kts)" value={ias} onChange={setIas} />
        <Field label="Pressure Altitude (ft)" value={altitude} onChange={setAltitude} step={500} />
        <div>
          <Label className="text-xs text-muted-foreground">OAT (°C)</Label>
          <p className="text-xs text-muted-foreground/60 mb-1">
            ISA std: {Math.round(15 - (altitude / 1000) * 2)}°C
          </p>
          <Input
            type="number"
            value={oat}
            placeholder="ISA"
            onChange={(e) => setOat(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </div>
      </div>
      <Button onClick={calculate} className="mt-4">
        Calculate
      </Button>
      {result && (
        <ResultGrid>
          <ResultRow label="True Airspeed" value={`${result.tas} kts`} color="primary" />
          <ResultRow label="Density Altitude" value={`${result.da.toLocaleString()} ft`} />
          <ResultRow label="ISA Temperature" value={`${result.isaTemp}°C`} />
        </ResultGrid>
      )}
    </ToolShell>
  )
}

// ── Unit Converter ────────────────────────────────────────────────────────────

const CONVERSIONS = [
  {
    value: 'nm',
    label: 'Nautical Miles → Distance',
    convert: (v: number) => ({ NM: v, SM: +(v * 1.15078).toFixed(2), km: +(v * 1.852).toFixed(2) }),
  },
  {
    value: 'sm',
    label: 'Statute Miles → Distance',
    convert: (v: number) => ({ SM: v, NM: +(v * 0.868976).toFixed(2), km: +(v * 1.60934).toFixed(2) }),
  },
  {
    value: 'ft',
    label: 'Feet → Altitude',
    convert: (v: number) => ({ ft: v, m: +(v * 0.3048).toFixed(1), FL: Math.round(v / 100) }),
  },
  {
    value: 'kts',
    label: 'Knots → Speed',
    convert: (v: number) => ({
      kts: v,
      mph: +(v * 1.15078).toFixed(1),
      'km/h': +(v * 1.852).toFixed(1),
      'm/s': +(v * 0.514444).toFixed(2),
    }),
  },
  {
    value: 'gal',
    label: 'Gallons → Fuel',
    convert: (v: number) => ({ gal: v, L: +(v * 3.78541).toFixed(1), lbs: +(v * 6).toFixed(1) }),
  },
  {
    value: 'lbs',
    label: 'Pounds → Weight',
    convert: (v: number) => ({ lbs: v, kg: +(v * 0.453592).toFixed(1), gal: +(v / 6).toFixed(2) }),
  },
  {
    value: 'c',
    label: '°C → Temperature',
    convert: (v: number) => ({ '°C': v, '°F': +(v * 9 / 5 + 32).toFixed(1), K: +(v + 273.15).toFixed(2) }),
  },
  {
    value: 'f',
    label: '°F → Temperature',
    convert: (v: number) => ({ '°F': v, '°C': +((v - 32) * 5 / 9).toFixed(1), K: +((v - 32) * 5 / 9 + 273.15).toFixed(2) }),
  },
  {
    value: 'inhg',
    label: 'inHg → Pressure',
    convert: (v: number) => ({ inHg: v, 'hPa/mb': +(v * 33.8639).toFixed(1) }),
  },
]

function ConvertTool() {
  const [from, setFrom] = useState('nm')
  const [value, setValue] = useState(100)
  const [result, setResult] = useState<Record<string, number> | null>(null)

  const calculate = () => {
    const conv = CONVERSIONS.find((c) => c.value === from)
    if (conv) setResult(conv.convert(value))
  }

  return (
    <ToolShell
      title="Unit Converter"
      description="Distance, speed, altitude, fuel, weight, temperature, and pressure."
    >
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <div>
          <Label className="text-xs text-muted-foreground">Category</Label>
          <select
            value={from}
            onChange={(e) => { setFrom(e.target.value); setResult(null) }}
            className="w-full mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {CONVERSIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Value</Label>
          <Input
            type="number"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="mt-1"
          />
        </div>
      </div>
      <Button onClick={calculate} className="mt-4">
        Convert
      </Button>
      {result && (
        <ResultGrid>
          {Object.entries(result).map(([key, val]) => (
            <ResultRow key={key} label={key} value={String(val)} />
          ))}
        </ResultGrid>
      )}
    </ToolShell>
  )
}

// ── Sunrise / Sunset ──────────────────────────────────────────────────────────

function SunTool() {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [lat, setLat] = useState(39.86)
  const [lng, setLng] = useState(-104.67)
  const [tz, setTz] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  )
  const [result, setResult] = useState<{
    civilDawn: Date | null
    sunrise: Date | null
    solarNoon: Date
    sunset: Date | null
    civilDusk: Date | null
    dayLength: string
  } | null>(null)

  const geolocate = () => {
    navigator.geolocation?.getCurrentPosition((pos) => {
      setLat(+(pos.coords.latitude.toFixed(4)))
      setLng(+(pos.coords.longitude.toFixed(4)))
    })
  }

  const calculate = () => {
    const d = new Date(date + 'T12:00:00Z')
    const sun = calcSunAngle(d, lat, lng, -0.8333)
    const twi = calcSunAngle(d, lat, lng, -6)
    let dayLength = '—'
    if (sun.rise && sun.set) {
      const mins = Math.round((sun.set.getTime() - sun.rise.getTime()) / 60000)
      dayLength = `${Math.floor(mins / 60)}h ${mins % 60}m`
    }
    setResult({
      civilDawn: twi.rise,
      sunrise: sun.rise,
      solarNoon: sun.noon,
      sunset: sun.set,
      civilDusk: twi.set,
      dayLength,
    })
  }

  return (
    <ToolShell
      title="Sunrise / Sunset"
      description="Civil twilight, sunrise, solar noon, and sunset. Night currency planning per FAR 61.57."
    >
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <div>
          <Label className="text-xs text-muted-foreground">Date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Timezone</Label>
          <Input
            type="text"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            placeholder="America/Denver"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Latitude</Label>
          <Input
            type="number"
            step="0.0001"
            value={lat}
            onChange={(e) => setLat(Number(e.target.value))}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Longitude</Label>
          <Input
            type="number"
            step="0.0001"
            value={lng}
            onChange={(e) => setLng(Number(e.target.value))}
            className="mt-1"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <Button onClick={calculate}>Calculate</Button>
        <Button variant="outline" onClick={geolocate}>
          Use My Location
        </Button>
      </div>
      {result && (
        <div className="mt-4 max-w-sm">
          <div className="bg-muted rounded-lg overflow-hidden divide-y divide-border">
            <SunRow
              label="Civil Dawn"
              time={formatTime(result.civilDawn, tz)}
              note="Night currency window ends"
              dim
            />
            <SunRow
              label="Sunrise"
              time={formatTime(result.sunrise, tz)}
              highlight
            />
            <SunRow
              label="Solar Noon"
              time={formatTime(result.solarNoon, tz)}
              note={result.dayLength !== '—' ? `Day length: ${result.dayLength}` : undefined}
            />
            <SunRow
              label="Sunset"
              time={formatTime(result.sunset, tz)}
              highlight
            />
            <SunRow
              label="Civil Dusk"
              time={formatTime(result.civilDusk, tz)}
              note="Night currency window begins"
              dim
            />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Night landings count from 1 hr after sunset to 1 hr before sunrise (FAR 61.57).
          </p>
        </div>
      )}
    </ToolShell>
  )
}

function SunRow({
  label,
  time,
  note,
  highlight,
  dim,
}: {
  label: string
  time: string
  note?: string
  highlight?: boolean
  dim?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 ${highlight ? 'bg-background' : ''}`}
    >
      <div>
        <div
          className={`text-sm font-medium ${dim ? 'text-muted-foreground' : 'text-foreground'}`}
        >
          {label}
        </div>
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
      </div>
      <span
        className={`font-mono text-sm font-semibold ${
          highlight ? 'text-primary' : dim ? 'text-muted-foreground' : ''
        }`}
      >
        {time}
      </span>
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function ToolShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      {children}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1"
      />
    </div>
  )
}

function ResultGrid({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 bg-muted rounded-lg p-4 space-y-2 max-w-md">{children}</div>
  )
}

const COLOR_MAP: Record<string, string> = {
  amber: 'text-amber-500',
  blue: 'text-blue-500',
  green: 'text-emerald-500',
  red: 'text-red-500',
  primary: 'text-primary',
}

function ResultRow({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: 'amber' | 'blue' | 'green' | 'red' | 'primary'
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-semibold ${color ? COLOR_MAP[color] : ''}`}>{value}</span>
    </div>
  )
}
