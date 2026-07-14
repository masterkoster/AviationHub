'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, ReferenceLine, Legend, ZAxis,
} from 'recharts'
import { Scale, Plane, Save, FileDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  ToolShell, ResultGrid, ResultRow, StatCard, StatGrid,
} from '@/components/ui/e6b'
import {
  saveAircraft, listUserAircraft, deleteAircraft, logToolUse,
  type E6bAircraft, type CgEnvelopePoint,
} from '@/desktop/lib/e6b-store'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { isTauriWebview } from '@/desktop/lib/is-tauri'

// ── Constants ────────────────────────────────────────────────────────────────

const FUEL_LBS_PER_GAL = 6 // 100LL standard density (lbs / US gal)

const DEFAULT_ENVELOPE: CgEnvelopePoint[] = [
  { weight: 1500, cgFwd: 35.0, cgAft: 40.5 },
  { weight: 1950, cgFwd: 35.5, cgAft: 42.5 },
  { weight: 2550, cgFwd: 40.0, cgAft: 47.3 },
]

interface AircraftSpec {
  tailnumber: string
  make: string
  model: string
  emptyWeight: number
  emptyCg: number
  maxWeight: number
  armPilot: number
  armPassenger: number
  armRear1: number
  armRear2: number
  armBaggage1: number
  armBaggage2: number
  armFuel: number
  fuelCapacity: number
  cruiseSpeed: number
  fuelBurn: number
  cgEnvelope: CgEnvelopePoint[]
}

const DEFAULT_AIRCRAFT: AircraftSpec = {
  tailnumber: 'N172SP',
  make: 'Cessna',
  model: '172',
  emptyWeight: 1689,
  emptyCg: 39.0,
  maxWeight: 2550,
  armPilot: 36,
  armPassenger: 73,
  armRear1: 73,
  armRear2: 73,
  armBaggage1: 95,
  armBaggage2: 123,
  armFuel: 47,
  fuelCapacity: 53,
  cruiseSpeed: 122,
  fuelBurn: 10,
  cgEnvelope: DEFAULT_ENVELOPE,
}

// Sentinel tail used by the aircraft <Select> to mean "use the built-in C172".
const DEFAULT_SELECT_VALUE = '__default__'

// ── Station model ────────────────────────────────────────────────────────────

/**
 * A single loading-station row. The `weight` field is in pounds for ordinary
 * stations, but in **gallons** for the fuel row (`isFuel === true`); the
 * chart/results layer converts gallons → lbs at consumption time.
 */
interface Station {
  id: string
  label: string
  /** Pounds for ordinary stations; gallons for the fuel station. */
  weight: number
  /** Inches aft of datum. */
  arm: number
  isFuel?: boolean
  /** Custom stations can be renamed; built-ins cannot. */
  editableLabel?: boolean
  /** Custom stations can be removed; built-ins cannot. */
  removable?: boolean
  /** Empty-weight row weight is locked to the airframe spec. */
  lockedWeight?: boolean
}

type StationId =
  | 'empty' | 'pilot' | 'frontPax' | 'rear1' | 'rear2'
  | 'bag1' | 'bag2' | 'fuel' | string

function buildStationsFromSpec(spec: AircraftSpec): Station[] {
  return [
    {
      id: 'empty',
      label: 'Empty Weight',
      weight: spec.emptyWeight,
      arm: spec.emptyCg,
      lockedWeight: true,
    },
    {
      id: 'pilot',
      label: 'Pilot (front)',
      weight: 170,
      arm: spec.armPilot,
    },
    {
      id: 'frontPax',
      label: 'Front Passenger',
      weight: 0,
      arm: spec.armPassenger,
    },
    {
      id: 'rear1',
      label: 'Rear Seat 1',
      weight: 0,
      arm: spec.armRear1 || spec.armPassenger,
    },
    {
      id: 'rear2',
      label: 'Rear Seat 2',
      weight: 0,
      arm: spec.armRear2 || spec.armPassenger,
    },
    {
      id: 'bag1',
      label: 'Baggage 1',
      weight: 0,
      arm: spec.armBaggage1,
    },
    {
      id: 'bag2',
      label: 'Baggage 2',
      weight: 0,
      arm: spec.armBaggage2,
    },
    {
      id: 'fuel',
      label: 'Fuel (gal)',
      weight: Math.max(0, Math.round(spec.fuelCapacity * 0.75)),
      arm: spec.armFuel,
      isFuel: true,
    },
  ]
}

// ── Envelope helpers ──────────────────────────────────────────────────────────

/**
 * Linearly interpolates the envelope's forward / aft CG bounds at a given
 * weight. Returns `null` when the envelope has no points.
 */
function envelopeAtWeight(
  env: CgEnvelopePoint[],
  weight: number,
): { cgFwd: number; cgAft: number } | null {
  if (!env || env.length === 0) return null
  const pts = [...env].sort((a, b) => a.weight - b.weight)
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (weight <= first.weight) return { cgFwd: first.cgFwd, cgAft: first.cgAft }
  if (weight >= last.weight) return { cgFwd: last.cgFwd, cgAft: last.cgAft }
  for (let i = 1; i < pts.length; i++) {
    const lo = pts[i - 1]
    const hi = pts[i]
    if (weight >= lo.weight && weight <= hi.weight) {
      const t = (weight - lo.weight) / (hi.weight - lo.weight || 1)
      return {
        cgFwd: lo.cgFwd + t * (hi.cgFwd - lo.cgFwd),
        cgAft: lo.cgAft + t * (hi.cgAft - lo.cgAft),
      }
    }
  }
  return { cgFwd: first.cgFwd, cgAft: first.cgAft }
}

/**
 * Builds the series of `<ReferenceArea>` segments (one per weight band of the
 * envelope) used to shade the approved CG envelope. When the envelope is empty
 * a single rectangle from CG 35→47.3 across the full weight range is emitted,
 * matching the legacy map-panel fallback.
 */
function buildEnvelopeRects(
  env: CgEnvelopePoint[],
  maxWeight: number,
): Array<{ x1: number; x2: number; y1: number; y2: number }> {
  if (!env || env.length === 0) {
    return [{ x1: 35.0, x2: 47.3, y1: 0, y2: Math.max(maxWeight, 3000) }]
  }
  const pts = [...env].sort((a, b) => a.weight - b.weight)
  const rects: Array<{ x1: number; x2: number; y1: number; y2: number }> = []
  // From zero up to the first defined weight, use the first segment's bounds.
  if (pts[0].weight > 0) {
    rects.push({
      x1: pts[0].cgFwd, x2: pts[0].cgAft, y1: 0, y2: pts[0].weight,
    })
  }
  // Intermediate bands: each rect uses the lower bound's CG values so the
  // outline traces the envelope's staircase corners crisply.
  for (let i = 1; i < pts.length; i++) {
    rects.push({
      x1: pts[i - 1].cgFwd,
      x2: pts[i - 1].cgAft,
      y1: pts[i - 1].weight,
      y2: pts[i].weight,
    })
  }
  // From the topmost point up to maxWeight, extend the last segment's bounds.
  const top = pts[pts.length - 1]
  if (top.weight < maxWeight) {
    rects.push({
      x1: top.cgFwd, x2: top.cgAft, y1: top.weight, y2: maxWeight,
    })
  }
  return rects
}

// ── Chart point types ─────────────────────────────────────────────────────────

interface ChartPoint {
  cg: number
  weight: number
  label?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WeightBalanceTool() {
  const { localUser, cloudUser } = useDesktopAuth()
  const userId = localUser?.id ?? cloudUser?.id ?? 'local-anon'

  // Saved-aircraft list (refreshed after save/delete).
  const [savedAircraft, setSavedAircraft] = useState<E6bAircraft[]>([])
  const [selectedTail, setSelectedTail] = useState<string>(DEFAULT_SELECT_VALUE)

  // Aircraft spec form state — drives the station arms and the envelope.
  const [tailnumber, setTailnumber] = useState(DEFAULT_AIRCRAFT.tailnumber)
  const [make, setMake] = useState(DEFAULT_AIRCRAFT.make)
  const [model, setModel] = useState(DEFAULT_AIRCRAFT.model)
  const [emptyWeight, setEmptyWeight] = useState(DEFAULT_AIRCRAFT.emptyWeight)
  const [emptyCg, setEmptyCg] = useState(DEFAULT_AIRCRAFT.emptyCg)
  const [maxWeight, setMaxWeight] = useState(DEFAULT_AIRCRAFT.maxWeight)
  const [armPilot, setArmPilot] = useState(DEFAULT_AIRCRAFT.armPilot)
  const [armPassenger, setArmPassenger] = useState(DEFAULT_AIRCRAFT.armPassenger)
  const [armRear1, setArmRear1] = useState(DEFAULT_AIRCRAFT.armRear1)
  const [armRear2, setArmRear2] = useState(DEFAULT_AIRCRAFT.armRear2)
  const [armBaggage1, setArmBaggage1] = useState(DEFAULT_AIRCRAFT.armBaggage1)
  const [armBaggage2, setArmBaggage2] = useState(DEFAULT_AIRCRAFT.armBaggage2)
  const [armFuel, setArmFuel] = useState(DEFAULT_AIRCRAFT.armFuel)
  const [fuelCapacity, setFuelCapacity] = useState(DEFAULT_AIRCRAFT.fuelCapacity)
  const [cruiseSpeed, setCruiseSpeed] = useState(DEFAULT_AIRCRAFT.cruiseSpeed)
  const [fuelBurn, setFuelBurn] = useState(DEFAULT_AIRCRAFT.fuelBurn)
  const [cgEnvelope, setCgEnvelope] = useState<CgEnvelopePoint[]>(
    DEFAULT_AIRCRAFT.cgEnvelope,
  )

  // Loading-stations table. `arm` updates here are independent of the spec
  // state so pilots can experiment with shifted loadings without losing the
  // POH default.
  const [stations, setStations] = useState<Station[]>(() =>
    buildStationsFromSpec(DEFAULT_AIRCRAFT),
  )

  // Save-dialog visibility + envelope-editor scratch state.
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [envelopeDraft, setEnvelopeDraft] = useState<CgEnvelopePoint[]>(
    DEFAULT_AIRCRAFT.cgEnvelope,
  )

  // Import-from-POH scratch state.
  const [importLoading, setImportLoading] = useState(false)
  const [importList, setImportList] = useState<PohRow[]>([])
  const [importValue, setImportValue] = useState<string>('')

  // ── Pull saved aircraft on mount / when the user changes ────────────────────
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    listUserAircraft(userId)
      .then((rows) => {
        if (!cancelled) setSavedAircraft(rows)
      })
      .catch((err) => console.error('listUserAircraft failed', err))
    return () => {
      cancelled = true
    }
  }, [userId])

  // ── Apply a saved (or default) aircraft spec when selection changes ────────
  const applyAircraftSpec = useCallback((spec: AircraftSpec) => {
    setTailnumber(spec.tailnumber)
    setMake(spec.make)
    setModel(spec.model)
    setEmptyWeight(spec.emptyWeight)
    setEmptyCg(spec.emptyCg)
    setMaxWeight(spec.maxWeight)
    setArmPilot(spec.armPilot)
    setArmPassenger(spec.armPassenger)
    setArmRear1(spec.armRear1 || spec.armPassenger)
    setArmRear2(spec.armRear2 || spec.armPassenger)
    setArmBaggage1(spec.armBaggage1)
    setArmBaggage2(spec.armBaggage2)
    setArmFuel(spec.armFuel)
    setFuelCapacity(spec.fuelCapacity)
    setCruiseSpeed(spec.cruiseSpeed)
    setFuelBurn(spec.fuelBurn)
    setCgEnvelope(spec.cgEnvelope && spec.cgEnvelope.length ? spec.cgEnvelope : DEFAULT_ENVELOPE)
    setStations(buildStationsFromSpec(spec))
  }, [])

  const selectedSaved = useMemo(
    () => savedAircraft.find((a) => a.tailnumber === selectedTail),
    [savedAircraft, selectedTail],
  )

  useEffect(() => {
    if (selectedTail === DEFAULT_SELECT_VALUE) {
      applyAircraftSpec(DEFAULT_AIRCRAFT)
      return
    }
    if (!selectedSaved) return
    applyAircraftSpec({
      tailnumber: selectedSaved.tailnumber,
      make: selectedSaved.make ?? '',
      model: selectedSaved.model ?? '',
      emptyWeight: numOr(selectedSaved.emptyWeight, DEFAULT_AIRCRAFT.emptyWeight),
      emptyCg: numOr(selectedSaved.emptyCg, DEFAULT_AIRCRAFT.emptyCg),
      maxWeight: numOr(selectedSaved.maxWeight, DEFAULT_AIRCRAFT.maxWeight),
      armPilot: numOr(selectedSaved.armPilot, DEFAULT_AIRCRAFT.armPilot),
      armPassenger: numOr(selectedSaved.armPassenger, DEFAULT_AIRCRAFT.armPassenger),
      armRear1: numOr(selectedSaved.armRear1, DEFAULT_AIRCRAFT.armRear1),
      armRear2: numOr(selectedSaved.armRear2, DEFAULT_AIRCRAFT.armRear2),
      armBaggage1: numOr(selectedSaved.armBaggage1, DEFAULT_AIRCRAFT.armBaggage1),
      armBaggage2: numOr(selectedSaved.armBaggage2, DEFAULT_AIRCRAFT.armBaggage2),
      armFuel: numOr(selectedSaved.armFuel, DEFAULT_AIRCRAFT.armFuel),
      fuelCapacity: numOr(selectedSaved.fuelCapacity, DEFAULT_AIRCRAFT.fuelCapacity),
      cruiseSpeed: numOr(selectedSaved.cruiseSpeed, DEFAULT_AIRCRAFT.cruiseSpeed),
      fuelBurn: numOr(selectedSaved.fuelBurn, DEFAULT_AIRCRAFT.fuelBurn),
      cgEnvelope: selectedSaved.cgEnvelope && selectedSaved.cgEnvelope.length
        ? selectedSaved.cgEnvelope
        : DEFAULT_ENVELOPE,
    })
    // applyAircraftSpec is stable via useCallback; selectedSaved derived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSaved, selectedTail])

  // ── Station mutation handlers ───────────────────────────────────────────────
  const updateStationWeight = useCallback((id: string, weight: number) => {
    setStations((prev) =>
      prev.map((s) => (s.id === id ? { ...s, weight: Number.isFinite(weight) ? weight : 0 } : s)),
    )
  }, [])

  const updateStationArm = useCallback((id: string, arm: number) => {
    setStations((prev) =>
      prev.map((s) => (s.id === id ? { ...s, arm: Number.isFinite(arm) ? arm : 0 } : s)),
    )
  }, [])

  const updateStationLabel = useCallback((id: string, label: string) => {
    setStations((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)))
  }, [])

  const addCustomStation = useCallback(() => {
    setStations((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: 'Custom',
        weight: 0,
        arm: 36,
        editableLabel: true,
        removable: true,
      },
    ])
  }, [])

  const removeStation = useCallback((id: string) => {
    setStations((prev) => prev.filter((s) => s.id !== id))
  }, [])

  // ── Core W&B computation (memoized) ─────────────────────────────────────────
  const {
    totalWeight, totalMoment, wbCg, fuelWeightLbs, emptyWeightUsed, payload,
    withinWeight, withinCg, cgFwd, cgAft, cgPercent, overweightLbs, fuelToOffloadGal,
  } = useMemo(() => {
    let totalW = 0
    let totalM = 0
    let fuelW = 0
    let emptyW = 0
    let payloadW = 0
    for (const s of stations) {
      const w = s.isFuel ? s.weight * FUEL_LBS_PER_GAL : s.weight
      totalW += w
      totalM += w * s.arm
      if (s.isFuel) fuelW += w
      if (s.id === 'empty') emptyW = w
      else payloadW += w
    }
    const cg = totalW > 0 ? totalM / totalW : emptyCg

    const env = cgEnvelope && cgEnvelope.length ? cgEnvelope : DEFAULT_ENVELOPE
    const bounds = envelopeAtWeight(env, totalW) ?? { cgFwd: 35.0, cgAft: 47.3 }
    const envWidth = Math.max(0.0001, bounds.cgAft - bounds.cgFwd)
    const cgPercent = Math.max(0, Math.min(100, ((cg - bounds.cgFwd) / envWidth) * 100))
    const withinW = totalW <= maxWeight
    const withinCgFlag =
      Number.isFinite(cg) && cg >= bounds.cgFwd && cg <= bounds.cgAft

    const over = Math.max(0, Math.round(totalW - maxWeight))
    return {
      totalWeight: totalW,
      totalMoment: totalM,
      wbCg: cg,
      fuelWeightLbs: fuelW,
      emptyWeightUsed: emptyW || emptyWeight,
      payload: payloadW,
      withinWeight: withinW,
      withinCg: withinCgFlag,
      cgFwd: bounds.cgFwd,
      cgAft: bounds.cgAft,
      cgPercent,
      overweightLbs: over,
      fuelToOffloadGal: Math.ceil(over / FUEL_LBS_PER_GAL),
    }
  }, [stations, emptyCg, maxWeight, cgEnvelope, emptyWeight])

  // ── Fuel-burn trajectory (CG walk as fuel is consumed) ──────────────────────
  const trajectory: ChartPoint[] = useMemo(() => {
    const fuelStation = stations.find((s) => s.id === 'fuel')
    const currentGal = fuelStation ? Math.max(0, fuelStation.weight) : 0
    const ratios = [1, 0.75, 0.5, 0.25, 0]
    return ratios.map((r, i) => {
      const gal = currentGal * r
      let w = 0
      let m = 0
      for (const s of stations) {
        const stationW = s.isFuel ? gal * FUEL_LBS_PER_GAL : s.weight
        w += stationW
        m += stationW * s.arm
      }
      const cg = w > 0 ? m / w : emptyCg
      const label =
        i === 0
          ? 'Takeoff fuel'
          : r === 0
            ? 'Empty'
            : `${Math.round(r * 100)}% fuel`
      return { cg, weight: w, label }
    })
  }, [stations, emptyCg])

  // ── Persist a history row (debounced 1s) whenever the result moves ─────────
  const logTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (logTimer.current) clearTimeout(logTimer.current)
    logTimer.current = setTimeout(async () => {
      try {
        await logToolUse(
          userId,
          'weight-balance',
          {
            tailnumber,
            stations: stations.map((s) => ({
              id: s.id, label: s.label, weight: s.weight, arm: s.arm, isFuel: !!s.isFuel,
            })),
            fuelGal: stations.find((s) => s.id === 'fuel')?.weight ?? 0,
          },
          {
            totalWeight: Math.round(totalWeight),
            cg: Number(wbCg.toFixed(2)),
            withinWeight,
            withinCg,
            overweightLbs,
          },
        )
      } catch (err) {
        // Persistence failure must never break the UI.
        console.error('logToolUse failed', err)
      }
    }, 1000)
    return () => {
      if (logTimer.current) clearTimeout(logTimer.current)
    }
  }, [
    userId, tailnumber, stations, totalWeight, wbCg, withinWeight, withinCg, overweightLbs,
  ])

  // ── Save / delete / new ─────────────────────────────────────────────────────
  const refreshAircraftList = useCallback(async () => {
    try {
      const rows = await listUserAircraft(userId)
      setSavedAircraft(rows)
    } catch (err) {
      console.error('refreshAircraftList failed', err)
    }
  }, [userId])

  const handleNewAircraft = useCallback(() => {
    setSelectedTail(DEFAULT_SELECT_VALUE)
    applyAircraftSpec(DEFAULT_AIRCRAFT)
    setShowSaveDialog(false)
  }, [applyAircraftSpec])

  const openSaveDialog = useCallback(() => {
    setEnvelopeDraft(
      cgEnvelope && cgEnvelope.length ? cgEnvelope.map((p) => ({ ...p })) : [
        { weight: maxWeight, cgFwd: 35.0, cgAft: 47.3 },
      ],
    )
    setShowSaveDialog(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cgEnvelope, maxWeight])

  const handleSave = useCallback(async () => {
    const tail = tailnumber.trim().toUpperCase()
    if (!tail) {
      toast.error('Tail number is required')
      return
    }
    try {
      const result = await saveAircraft({
        userId,
        tailnumber: tail,
        make: make.trim(),
        model: model.trim(),
        emptyWeight,
        emptyCg,
        maxWeight,
        armPilot,
        armPassenger,
        armRear1,
        armRear2,
        armBaggage1,
        armBaggage2,
        armFuel,
        fuelCapacity,
        cruiseSpeed,
        fuelBurn,
        cgEnvelope: envelopeDraft,
      })
      if (result) {
        toast.success('Aircraft saved')
        await refreshAircraftList()
        setSelectedTail(tail)
        // Apply the freshly saved envelope immediately.
        setCgEnvelope(envelopeDraft.length ? envelopeDraft : DEFAULT_ENVELOPE)
        setShowSaveDialog(false)
      } else {
        toast.error('Failed to save aircraft')
      }
    } catch (err) {
      console.error('saveAircraft failed', err)
      toast.error('Failed to save aircraft')
    }
  }, [
    userId, tailnumber, make, model, emptyWeight, emptyCg, maxWeight, armPilot,
    armPassenger, armRear1, armRear2, armBaggage1, armBaggage2, armFuel,
    fuelCapacity, cruiseSpeed, fuelBurn, envelopeDraft, refreshAircraftList,
  ])

  const handleDelete = useCallback(async () => {
    if (!selectedSaved) {
      toast.error('No saved aircraft selected')
      return
    }
    const tail = selectedSaved.tailnumber
    if (!window.confirm(`Delete aircraft ${tail}? This cannot be undone.`)) return
    try {
      const ok = await deleteAircraft(userId, tail)
      if (ok) {
        toast.success('Aircraft deleted')
        await refreshAircraftList()
        setSelectedTail(DEFAULT_SELECT_VALUE)
      } else {
        toast.error('Failed to delete aircraft')
      }
    } catch (err) {
      console.error('deleteAircraft failed', err)
      toast.error('Failed to delete aircraft')
    }
  }, [userId, selectedSaved, refreshAircraftList])

  // ── Import from POH database ────────────────────────────────────────────────
  const loadImportList = useCallback(async () => {
    setImportLoading(true)
    try {
      const res = await fetch('/api/weight-balance')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { aircraft?: PohRow[] } = await res.json()
      const rows = data.aircraft ?? []
      setImportList(rows)
      if (rows.length === 0) toast.error('No aircraft in POH database')
      else toast.success(`Loaded ${rows.length} POH aircraft`)
    } catch (err) {
      console.error('POH import failed', err)
      toast.error('Failed to load POH database')
    } finally {
      setImportLoading(false)
    }
  }, [])

  const applyImportRow = useCallback((row: PohRow) => {
    setEmptyWeight(numOr(row.empty_weight, emptyWeight))
    setEmptyCg(numOr(row.empty_cg, emptyCg))
    setMaxWeight(numOr(row.max_weight, maxWeight))
    setFuelCapacity(numOr(row.fuel_capacity, fuelCapacity))
    setCruiseSpeed(numOr(row.cruise_speed, cruiseSpeed))
    setFuelBurn(numOr(row.fuel_burn, fuelBurn))
    if (row.make) setMake(row.make)
    if (row.model) setModel(row.model)
    // The POH GET route does not currently return per-station arms or
    // cg_min/cg_max, so fall back to a rectangle envelope from those columns
    // when they are present, or to a generic 35→47.3 box otherwise.
    const cgMin = numOr(row.cg_min, null)
    const cgMax = numOr(row.cg_max, null)
    if (cgMin !== null && cgMax !== null) {
      const env: CgEnvelopePoint[] = [
        { weight: 0, cgFwd: cgMin, cgAft: cgMax },
        { weight: numOr(row.max_weight, maxWeight), cgFwd: cgMin, cgAft: cgMax },
      ]
      setCgEnvelope(env)
    } else {
      setCgEnvelope([
        { weight: 0, cgFwd: 35.0, cgAft: 47.3 },
        { weight: numOr(row.max_weight, maxWeight), cgFwd: 35.0, cgAft: 47.3 },
      ])
    }
    setStations((prev) =>
      prev.map((s) =>
        s.id === 'empty'
          ? { ...s, weight: numOr(row.empty_weight, s.weight), arm: numOr(row.empty_cg, s.arm) }
          : s,
      ),
    )
    if (!row.tailnumber) {
      const newTail = `N${(row.model ?? 'AC').toUpperCase().slice(0, 4)}`
      setTailnumber(newTail)
    }
    toast.success(`Imported ${row.make ?? ''} ${row.model ?? ''}`.trim())
  }, [emptyCg, cruiseSpeed, emptyWeight, fuelBurn, fuelCapacity, maxWeight])

  // ── Export PDF ──────────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    try {
      const { default: jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default
      const doc = new jsPDF({ unit: 'pt', format: 'letter' })
      const margin = 40
      const dateStr = new Date().toISOString().slice(0, 10)
      const title = `Weight & Balance — ${tailnumber}`
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.text(title, margin, margin + 4)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.text(`${make} ${model}`.trim(), margin, margin + 22)
      doc.text(`Date: ${dateStr}`, margin, margin + 36)

      const body = stations.map((s) => {
        const w = s.isFuel ? s.weight * FUEL_LBS_PER_GAL : s.weight
        const moment = w * s.arm
        return [
          s.isFuel ? `${s.label} (${s.weight} gal)` : s.label,
          w.toFixed(0),
          s.arm.toFixed(1),
          moment.toFixed(0),
        ]
      })
      autoTable(doc, {
        startY: margin + 52,
        head: [['Station', 'Weight (lbs)', 'Arm (in)', 'Moment (lb·in)']],
        body,
        foot: [[
          'Totals',
          totalWeight.toFixed(0),
          wbCg.toFixed(2),
          totalMoment.toFixed(0),
        ]],
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        columnStyles: {
          0: { halign: 'left' },
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
        },
      })

      const afterTableY =
        (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 160
      const summaryY = afterTableY + 24
      const status =
        withinWeight && withinCg
          ? 'Within limits'
          : !withinWeight
            ? `${overweightLbs} lbs overweight`
            : 'CG outside envelope'
      const lines = [
        `Total Weight: ${totalWeight.toFixed(0)} lbs (max ${maxWeight})`,
        `CG: ${wbCg.toFixed(2)} in  (${withinCg ? '' : 'outside '}${cgFwd.toFixed(1)}–${cgAft.toFixed(1)} in)`,
        `Status: ${status}`,
        ``,
        `POH verification required — verify every value against the official Pilot's Operating Handbook.`,
      ]
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text('Summary', margin, summaryY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      lines.forEach((line, i) => {
        doc.text(line, margin, summaryY + 16 + i * 14)
      })

      // Save PDF — Tauri desktop: use file dialog + fs; web: use jsPDF's built-in save
      const pdfFileName = `WB-${tailnumber || 'aircraft'}-${dateStr}.pdf`
      if (isTauriWebview()) {
        try {
          const { save } = await import('@tauri-apps/plugin-dialog')
          const filePath = await save({
            defaultPath: pdfFileName,
            filters: [{ name: 'PDF', extensions: ['pdf'] }],
          })
          if (filePath) {
            const { writeFile } = await import('@tauri-apps/plugin-fs')
            const pdfBytes = new Uint8Array(doc.output('arraybuffer'))
            await writeFile(filePath, pdfBytes)
            toast.success(`PDF saved to ${filePath}`)
          }
        } catch (tauriErr) {
          console.error('Tauri PDF save failed, falling back to browser download', tauriErr)
          doc.save(pdfFileName)
          toast.success('PDF exported (browser download)')
        }
      } else {
        // Web mode: generate blob URL and trigger download via anchor element
        const pdfBlob = doc.output('blob')
        const url = URL.createObjectURL(pdfBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = pdfFileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success('PDF exported')
      }
    } catch (err) {
      console.error('PDF export failed', err)
      toast.error('PDF export failed')
    }
  }, [
    tailnumber, make, model, stations, totalWeight, totalMoment, wbCg,
    maxWeight, withinWeight, withinCg, cgFwd, cgAft, overweightLbs,
  ])

  // ── Envelope editor helpers (inside the save dialog) ───────────────────────
  const updateEnvelopeDraft = useCallback(
    (index: number, patch: Partial<CgEnvelopePoint>) => {
      setEnvelopeDraft((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
    },
    [],
  )
  const addEnvelopeRow = useCallback(() => {
    setEnvelopeDraft((prev) => [
      ...prev,
      { weight: maxWeight, cgFwd: 35.0, cgAft: 47.3 },
    ])
  }, [maxWeight])
  const removeEnvelopeRow = useCallback((index: number) => {
    setEnvelopeDraft((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }, [])

  // ── Derived chart geometry ──────────────────────────────────────────────────
  const envelopeRects = useMemo(
    () => buildEnvelopeRects(cgEnvelope && cgEnvelope.length ? cgEnvelope : [], maxWeight),
    [cgEnvelope, maxWeight],
  )
  const xDomain: [number, number] = useMemo(() => {
    const lo = Math.min(30, cgFwd - 2)
    const hi = Math.max(50, cgAft + 2)
    return [lo, hi]
  }, [cgFwd, cgAft])
  const yDomain: [number, number] = useMemo(() => {
    const lo = 0
    const hi = Math.max(maxWeight * 1.1, totalWeight + 100)
    return [lo, hi]
  }, [maxWeight, totalWeight])

  const operatingPoint: ChartPoint = {
    cg: Number.isFinite(wbCg) ? wbCg : 0,
    weight: totalWeight,
    label: 'Current state',
  }

  // ── Status badge ────────────────────────────────────────────────────────────
  const statusTone: 'good' | 'warn' | 'bad' =
    withinWeight && withinCg
      ? 'good'
      : withinCg && !withinWeight
        ? 'warn'
        : 'bad'
  const statusBadge =
    statusTone === 'good'
      ? { text: 'Within limits', icon: '✓', className: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' }
      : statusTone === 'warn'
        ? { text: 'Overweight', icon: '⚠', className: 'border-amber-500/40 text-amber-600 dark:text-amber-400' }
        : { text: 'CG out of limits', icon: '⚠', className: 'border-red-500/40 text-red-600 dark:text-red-400' }

  // ── Reserve fuel available at takeoff (1-hour reserve) ──────────────────────
  const fuelGalAtTakeoff = stations.find((s) => s.id === 'fuel')?.weight ?? 0
  const reserveAtTakeoff = Math.max(0, fuelGalAtTakeoff - fuelBurn)

  return (
    <ToolShell
      title="Weight & Balance"
      description="Compute loading, CG, fuel-burn walk, and envelope compliance. Save per-aircraft presets and export a one-page PDF."
      notesUserId={userId}
      notesTool="weight-balance"
    >
      <div className="h-full flex flex-col gap-3 min-h-0">
        {/* ── Top strip: aircraft selector + actions ─────────────────────── */}
        <div className="shrink-0 flex flex-wrap items-center gap-2">
          <Select value={selectedTail} onValueChange={setSelectedTail}>
            <SelectTrigger className="min-w-56" size="sm">
              <SelectValue placeholder="Select aircraft" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_SELECT_VALUE}>
                Cessna 172 (typical)
              </SelectItem>
              {savedAircraft.map((a) => (
                <SelectItem key={a.id} value={a.tailnumber}>
                  {`${a.tailnumber} (${a.make ?? ''} ${a.model ?? ''})`.trim()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={handleNewAircraft}>
            <Plus className="size-4" /> New
          </Button>
          <Button variant="outline" size="sm" onClick={openSaveDialog}>
            <Save className="size-4" /> Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={!selectedSaved}
            title={selectedSaved ? `Delete ${selectedSaved.tailnumber}` : 'Select a saved aircraft to delete'}
          >
            <Trash2 className="size-4" /> Delete
          </Button>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Button
            variant="secondary"
            size="sm"
            onClick={loadImportList}
            disabled={importLoading}
          >
            <Scale className="size-4" />
            {importLoading ? 'Loading…' : 'Import POH'}
          </Button>

          {importList.length > 0 && (
            <Select
              value={importValue}
              onValueChange={(v) => {
                setImportValue(v)
                const row = importList.find((r) => `${r.make} ${r.model}` === v)
                if (row) applyImportRow(row)
              }}
            >
              <SelectTrigger className="min-w-56" size="sm">
                <SelectValue placeholder="Pick from POH DB" />
              </SelectTrigger>
              <SelectContent>
                {importList.map((r) => (
                  <SelectItem key={`${r.make} ${r.model}`} value={`${r.make} ${r.model}`}>
                    {r.make} {r.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Button variant="outline" size="sm" onClick={handleExportPdf}>
            <FileDown className="size-4" /> PDF
          </Button>
        </div>

        <Separator className="shrink-0 my-2" />

        {/* ── Middle: stations (left) + chart (right) ────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
          {/* Left — station table */}
          <div className="flex flex-col min-h-0">
            <div className="shrink-0 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Loading stations
              </h3>
              <Button variant="ghost" size="icon-sm" onClick={addCustomStation} title="Add custom station">
                <Plus className="size-4" />
              </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border bg-card">
              <div className="grid grid-cols-[1fr_5rem_5rem_6rem_2rem] gap-2 bg-muted/40 px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>Station</span>
                <span className="text-right">Weight</span>
                <span className="text-right">Arm (in)</span>
                <span className="text-right">Moment</span>
                <span />
              </div>
              <div className="divide-y divide-border">
                {stations.map((s) => {
                  const stationLbs = s.isFuel ? s.weight * FUEL_LBS_PER_GAL : s.weight
                  const moment = stationLbs * s.arm
                  return (
                    <div
                      key={s.id}
                      className="grid grid-cols-[1fr_5rem_5rem_6rem_2rem] items-center gap-2 px-2 py-1.5 text-sm"
                    >
                      <div className="min-w-0">
                        {s.editableLabel ? (
                          <Input
                            value={s.label}
                            onChange={(e) => updateStationLabel(s.id, e.target.value)}
                            className="h-8 px-2 text-sm"
                          />
                        ) : (
                          <span className="block truncate text-sm" title={s.label}>
                            {s.label}
                          </span>
                        )}
                        {s.isFuel && (
                          <span className="text-[10px] text-muted-foreground">
                            gal × 6 = {stationLbs.toFixed(0)} lbs
                          </span>
                        )}
                      </div>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={Number.isFinite(s.weight) ? s.weight : 0}
                        onChange={(e) =>
                          updateStationWeight(s.id, parseFloat(e.target.value))
                        }
                        disabled={s.lockedWeight}
                        className="h-8 px-2 text-right font-mono tabular-nums"
                      />
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={Number.isFinite(s.arm) ? s.arm : 0}
                        onChange={(e) =>
                          updateStationArm(s.id, parseFloat(e.target.value))
                        }
                        className="h-8 px-2 text-right font-mono tabular-nums"
                      />
                      <span className="text-right font-mono tabular-nums text-sm">
                        {moment.toFixed(0)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeStation(s.id)}
                        disabled={!s.removable}
                        title={s.removable ? 'Remove station' : 'Default stations cannot be removed'}
                        className="text-muted-foreground"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>

              {/* Fuel slider — pilots love dragging fuel */}
              {(() => {
                const fuelStation = stations.find((s) => s.id === 'fuel')
                if (!fuelStation) return null
                const cap = fuelCapacity > 0 ? fuelCapacity : 100
                return (
                  <div className="border-t border-border bg-muted/20 px-3 py-2">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Fuel slider</span>
                      <span className="font-mono tabular-nums">
                        {fuelStation.weight.toFixed(0)} / {cap.toFixed(0)} gal
                        <span className="ml-1">({(fuelStation.weight * FUEL_LBS_PER_GAL).toFixed(0)} lbs)</span>
                      </span>
                    </div>
                    <Slider
                      min={0}
                      max={cap}
                      step={1}
                      value={[fuelStation.weight]}
                      onValueChange={(vals) => {
                        const v = Array.isArray(vals) ? vals[0] : vals
                        updateStationWeight('fuel', typeof v === 'number' ? v : 0)
                      }}
                    />
                  </div>
                )
              })()}
            </div>
          </div>

          {/* Right — chart */}
          <div className="flex flex-col min-h-0">
            <div className="shrink-0 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                CG envelope
              </h3>
              <Badge variant="outline">Typical values</Badge>
            </div>
            <div className="flex-1 min-h-0 rounded-lg bg-muted/30 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trajectory} margin={{ top: 8, right: 16, left: 4, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    type="number"
                    dataKey="cg"
                    domain={xDomain}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => (typeof v === 'number' ? v.toFixed(1) : String(v))}
                    label={{
                      value: 'CG (inches)',
                      position: 'insideBottom',
                      offset: -4,
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="weight"
                    domain={yDomain}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => (typeof v === 'number' ? v.toFixed(0) : String(v))}
                    label={{
                      value: 'Weight (lbs)',
                      angle: -90,
                      position: 'insideLeft',
                      fontSize: 11,
                    }}
                  />
                  <ZAxis range={[60, 60]} />
                  {envelopeRects.map((r, i) => (
                    <ReferenceArea
                      // eslint-disable-next-line react/no-array-index-key
                      key={`env-rect-${i}`}
                      x1={r.x1}
                      x2={r.x2}
                      y1={r.y1}
                      y2={r.y2}
                      fill="#10b981"
                      fillOpacity={0.15}
                      stroke="none"
                    />
                  ))}
                  <ReferenceLine
                    x={Number.isFinite(wbCg) ? wbCg : 0}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                  />
                  <Line
                    data={trajectory}
                    dataKey="weight"
                    name="Fuel-burn walk"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    isAnimationActive={false}
                    dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                  <Scatter
                    data={[operatingPoint]}
                    dataKey="weight"
                    name="Current state"
                    fill="#10b981"
                    legendType="circle"
                  />
                  <Tooltip
                    content={<WbTooltip />}
                    cursor={{ strokeDasharray: '3 3' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="shrink-0 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Plane className="size-3.5" />
              <span>
                Amber line traces CG & weight from takeoff fuel → empty; the
                emerald marker is the current state.
              </span>
            </div>
          </div>
        </div>

        {/* ── Bottom results: StatGrid ──────────────────────────────────── */}
        <div className="shrink-0 space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Results
          </h3>
          <StatGrid cols={4}>
            <StatCard
              label="Empty Weight"
              value={`${emptyWeightUsed.toFixed(0)} lbs`}
            />
            <StatCard
              label="Payload"
              value={`${payload.toFixed(0)} lbs`}
            />
            <StatCard
              label="Fuel"
              value={`${fuelWeightLbs.toFixed(0)} lbs`}
            />
            <StatCard
              label="Total Weight"
              value={`${totalWeight.toFixed(0)} lbs`}
              tone={totalWeight > maxWeight ? 'bad' : 'default'}
            />
            <StatCard
              label="CG"
              value={`${wbCg.toFixed(2)}"`}
              className="font-mono tabular-nums"
            />
            <StatCard
              label="CG Range"
              value={`${cgFwd.toFixed(1)}" – ${cgAft.toFixed(1)}"`}
              className="font-mono tabular-nums"
            />
            <StatCard
              label="Max Weight"
              value={`${maxWeight.toFixed(0)} lbs`}
            />
            <StatCard
              label="Overweight"
              value={`${overweightLbs} lbs`}
              tone={overweightLbs > 0 ? 'bad' : 'default'}
            />
            <StatCard
              label="Fuel to offload"
              value={overweightLbs > 0 ? `${fuelToOffloadGal} gal` : '—'}
              tone={overweightLbs > 0 ? 'bad' : 'default'}
            />
            <StatCard
              label="Within Limits"
              value={
                <Badge variant="outline" className={statusBadge.className}>
                  <span className="mr-1">{statusBadge.icon}</span>
                  {statusBadge.text}
                </Badge>
              }
              tone={statusTone}
            />
          </StatGrid>

          <ResultGrid className="max-w-2xl">
            <ResultRow
              label="Total Moment"
              value={`${totalMoment.toFixed(0)} lb·in`}
            />
            <ResultRow
              label="Useful Load"
              value={`${Math.max(0, maxWeight - emptyWeight).toFixed(0)} lbs`}
            />
            <ResultRow
              label="CG % of envelope"
              value={`${cgPercent.toFixed(0)}% (fwd 0% → aft 100%)`}
              color="primary"
            />
            <ResultRow
              label="Reserve fuel at takeoff"
              value={`${reserveAtTakeoff.toFixed(1)} gal (1-hr reserve)`}
              color={reserveAtTakeoff < fuelBurn ? 'red' : 'green'}
            />
          </ResultGrid>
        </div>

        {/* ── Save-aircraft inline panel ────────────────────────────────── */}
        {showSaveDialog && (
          <div className="mt-4 space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Save className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Save aircraft preset</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Tail number</Label>
                <Input
                  value={tailnumber}
                  onChange={(e) => setTailnumber(e.target.value)}
                  className="mt-1"
                  placeholder="N12345"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Make</Label>
                <Input
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  className="mt-1"
                  placeholder="Cessna"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Model</Label>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="mt-1"
                  placeholder="172"
                />
              </div>
            </div>

            {/* Editable airframe numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SmallNum label="Empty wt (lbs)" value={emptyWeight} onChange={setEmptyWeight} />
              <SmallNum label="Empty CG (in)" value={emptyCg} step="0.1" onChange={setEmptyCg} />
              <SmallNum label="Max wt (lbs)" value={maxWeight} onChange={setMaxWeight} />
              <SmallNum label="Fuel cap (gal)" value={fuelCapacity} onChange={setFuelCapacity} />
              <SmallNum label="Arm pilot" value={armPilot} step="0.1" onChange={setArmPilot} />
              <SmallNum label="Arm pax" value={armPassenger} step="0.1" onChange={setArmPassenger} />
              <SmallNum label="Arm rear" value={armRear1} step="0.1" onChange={setArmRear1} />
              <SmallNum label="Arm bag" value={armBaggage1} step="0.1" onChange={setArmBaggage1} />
              <SmallNum label="Arm fuel" value={armFuel} step="0.1" onChange={setArmFuel} />
              <SmallNum label="Cruise (kts)" value={cruiseSpeed} onChange={setCruiseSpeed} />
              <SmallNum label="Fuel burn (gph)" value={fuelBurn} step="0.1" onChange={setFuelBurn} />
            </div>

            {/* Envelope editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">CG envelope (weight / cgFwd / cgAft)</Label>
                <Button variant="ghost" size="sm" onClick={addEnvelopeRow}>
                  <Plus className="size-4" /> Add row
                </Button>
              </div>
              <div className="space-y-1.5">
                {envelopeDraft.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_2rem] gap-2 items-center">
                    <Input
                      type="number"
                      value={p.weight}
                      onChange={(e) =>
                        updateEnvelopeDraft(i, { weight: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8"
                    />
                    <Input
                      type="number"
                      step="0.1"
                      value={p.cgFwd}
                      onChange={(e) =>
                        updateEnvelopeDraft(i, { cgFwd: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8"
                    />
                    <Input
                      type="number"
                      step="0.1"
                      value={p.cgAft}
                      onChange={(e) =>
                        updateEnvelopeDraft(i, { cgAft: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeEnvelopeRow(i)}
                      disabled={envelopeDraft.length <= 1}
                      className="text-muted-foreground"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={handleSave}>
                <Save className="size-4" /> Save aircraft
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowSaveDialog(false)}>
                Cancel
              </Button>
              <Switch
                id="wb-save-notes"
                aria-label="Save reminder"
                defaultChecked
                className="ml-auto"
              />
              <Label htmlFor="wb-save-notes" className="text-[11px] text-muted-foreground">
                Remind to verify arms with POH
              </Label>
            </div>
          </div>
        )}

        {/* ── Disclaimer ─────────────────────────────────────────────────── */}
        <p className="shrink-0 text-xs text-muted-foreground">
          Arms and limits based on POH data for the selected aircraft. Always
          verify against the official POH for your specific aircraft.
        </p>
      </div>
    </ToolShell>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function numOr<T>(value: number | null | undefined, fallback: T): number | T {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback
  return value
}

/** Shape returned by GET /api/weight-balance (subset; some columns optional). */
interface PohRow {
  make?: string
  model?: string
  empty_weight?: number
  empty_cg?: number
  max_weight?: number
  fuel_capacity?: number
  cruise_speed?: number
  fuel_burn?: number
  // These columns exist in the curated DB schema but are not currently
  // returned by the GET route; defensively consumed when present.
  cg_min?: number
  cg_max?: number
  arm_pilot?: number
  arm_passenger?: number
  arm_baggage?: number
  arm_fuel?: number
  tailnumber?: string
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────

function WbTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: ChartPoint }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0]?.payload
  if (!point) return null
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-mono tabular-nums">CG: {point.cg.toFixed(1)}&quot;</p>
      <p className="font-mono tabular-nums">Weight: {point.weight.toFixed(0)} lbs</p>
      {point.label && <p className="text-muted-foreground">{point.label}</p>}
    </div>
  )
}

// ── Small numeric field for the save dialog ───────────────────────────────────

function SmallNum({
  label,
  value,
  onChange,
  step,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: string
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="mt-1 h-8 font-mono tabular-nums"
      />
    </div>
  )
}