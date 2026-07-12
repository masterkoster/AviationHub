'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { getLocalAircraft, updateLocalAircraft } from '@/apps/desktop/src/lib/local-logbook'
import { ArrowLeft, Plane, Loader2, Scale, Fuel, Gauge, Database as DatabaseIcon, Save, RefreshCw } from 'lucide-react'
import { notifySaved } from '@/desktop/lib/toast-helpers'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { DocumentUploader } from '@/desktop/components/document-uploader'
import { DocumentGrid } from '@/desktop/components/document-grid'
import {
  getDocuments,
  saveDocument,
  deleteDocument,
  type DocumentRecord,
} from '@/desktop/lib/document-store'

export default function AircraftDetailPage({ params }: { params: Promise<{ nNumber: string }> }) {
  const { nNumber } = use(params)
  const router = useRouter()
  const { mode, localUser } = useDesktopAuth()
  const [aircraft, setAircraft] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState<DocumentRecord[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [wbEditing, setWbEditing] = useState(false)
  const [wbSaving, setWbSaving] = useState(false)
  const [wbData, setWbData] = useState({
    emptyWeight: null as number | null,
    emptyCg: null as number | null,
    maxWeight: null as number | null,
    armPilot: null as number | null,
    armPassenger: null as number | null,
    armBaggage: null as number | null,
    armFuel: null as number | null,
    fuelCapacity: null as number | null,
    cruiseSpeed: null as number | null,
    fuelBurn: null as number | null,
    unusableFuel: null as number | null,
    cgMin: null as number | null,
    cgMax: null as number | null,
  })
  const [autoFillLoading, setAutoFillLoading] = useState(false)
  const [autoFillError, setAutoFillError] = useState('')

  useEffect(() => {
    if (mode !== 'local' || !localUser) return
    loadAircraft()
  }, [mode, localUser, nNumber])

  useEffect(() => {
    if (!aircraft) return
    loadDocs()
  }, [aircraft])

  useEffect(() => {
    if (!aircraft) return
    setWbData({
      emptyWeight: aircraft.emptyWeight ?? null,
      emptyCg: aircraft.emptyCg ?? null,
      maxWeight: aircraft.maxWeight ?? null,
      armPilot: aircraft.armPilot ?? null,
      armPassenger: aircraft.armPassenger ?? null,
      armBaggage: aircraft.armBaggage ?? null,
      armFuel: aircraft.armFuel ?? null,
      fuelCapacity: aircraft.fuelCapacity ?? null,
      cruiseSpeed: aircraft.cruiseSpeed ?? null,
      fuelBurn: aircraft.fuelBurn ?? null,
      unusableFuel: aircraft.unusableFuel ?? null,
      cgMin: aircraft.cgMin ?? null,
      cgMax: aircraft.cgMax ?? null,
    })
  }, [aircraft])

  async function loadAircraft() {
    if (!localUser) return
    try {
      const list = await getLocalAircraft(localUser.id)
      const ac = list.find((a: any) => a.nNumber === nNumber)
      setAircraft(ac || null)
    } catch (err) {
      console.error('[aircraft/detail] load failed', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadDocs() {
    setDocsLoading(true)
    try {
      const result = await getDocuments('aircraft', nNumber)
      setDocs(result)
    } finally {
      setDocsLoading(false)
    }
  }

  async function handleUpload(file: File) {
    if (!localUser) return
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    await saveDocument(
      localUser.id,
      'aircraft',
      nNumber,
      file.name,
      bytes,
      file.type || 'application/octet-stream',
    )
    await loadDocs()
  }

  async function handleDelete(doc: DocumentRecord) {
    await deleteDocument(doc.id)
    await loadDocs()
  }

  async function handleSaveWb() {
    if (!aircraft) return
    setWbSaving(true)
    try {
      await updateLocalAircraft(aircraft.id, wbData)
      await loadAircraft()
      setWbEditing(false)
      notifySaved('Weight & Balance')
    } catch (err) {
      console.error('[aircraft/wb] save failed', err)
    } finally {
      setWbSaving(false)
    }
  }

  async function handleAutoFill() {
    if (!aircraft?.model) {
      setAutoFillError('Set a model name first to auto-fill from database')
      return
    }
    setAutoFillLoading(true)
    setAutoFillError('')
    try {
      const res = await fetch('/api/weight-balance')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      const refs = data.aircraft || []
      const modelLower = aircraft.model.toLowerCase()
      const match = refs.find((r: any) => {
        const refName = `${r.make} ${r.model}`.toLowerCase()
        return modelLower.includes(r.model.toLowerCase()) || refName.includes(modelLower) || modelLower.includes(refName)
      })
      if (!match) {
        setAutoFillError(`No match found for "${aircraft.model}" in reference database (${refs.length} aircraft available)`)
        return
      }
      setWbData({
        emptyWeight: match.empty_weight ?? null,
        emptyCg: match.empty_cg ?? null,
        maxWeight: match.max_weight ?? null,
        armPilot: match.arm_pilot ?? null,
        armPassenger: match.arm_passenger ?? null,
        armBaggage: match.arm_baggage ?? null,
        armFuel: match.arm_fuel ?? null,
        fuelCapacity: match.fuel_capacity ?? null,
        cruiseSpeed: match.cruise_speed ?? null,
        fuelBurn: match.fuel_burn ?? null,
        unusableFuel: match.unusable_fuel ?? null,
        cgMin: match.cg_min ?? null,
        cgMax: match.cg_max ?? null,
      })
      setWbEditing(true)
    } catch (err) {
      setAutoFillError('Failed to load reference database')
    } finally {
      setAutoFillLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!aircraft) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <Plane className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Aircraft not found</p>
        <button
          onClick={() => router.back()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          Go back
        </button>
      </div>
    )
  }

  return (
    <div className="p-6">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/desktop/aircraft">Aircraft</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{aircraft.nNumber}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="rounded-lg border border-border bg-card shadow-sm divide-y divide-border">
        {/* Header */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => router.back()}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Plane className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold font-mono">{aircraft.nNumber}</h1>
              {aircraft.nickname && (
                <p className="text-xs text-muted-foreground">{aircraft.nickname}</p>
              )}
            </div>
          </div>
          {aircraft.model && (
            <p className="text-xs text-muted-foreground">Model: {aircraft.model}</p>
          )}
        </div>

        {/* Weight & Balance */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Scale className="h-4 w-4" />
              Weight & Balance
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleAutoFill}
                disabled={autoFillLoading}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
              >
                {autoFillLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <DatabaseIcon className="h-3 w-3" />}
                Auto-fill from DB
              </button>
              {!wbEditing ? (
                <button
                  onClick={() => setWbEditing(true)}
                  className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
                >
                  Edit
                </button>
              ) : (
                <button
                  onClick={handleSaveWb}
                  disabled={wbSaving}
                  className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {wbSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </button>
              )}
            </div>
          </div>

          {autoFillError && (
            <p className="mb-2 text-[11px] text-destructive">{autoFillError}</p>
          )}

          {!wbEditing ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <WbStat label="Empty Weight" value={wbData.emptyWeight} unit="lbs" />
              <WbStat label="Empty CG" value={wbData.emptyCg} unit='"' />
              <WbStat label="Max Weight" value={wbData.maxWeight} unit="lbs" />
              <WbStat label="Fuel Capacity" value={wbData.fuelCapacity} unit="gal" />
              <WbStat label="Cruise Speed" value={wbData.cruiseSpeed} unit="kts" />
              <WbStat label="Fuel Burn" value={wbData.fuelBurn} unit="gph" />
              <WbStat label="CG Range" value={wbData.cgMin != null && wbData.cgMax != null ? `${wbData.cgMin}" - ${wbData.cgMax}"` : null} />
              <WbStat label="Arm: Pilot" value={wbData.armPilot} />
              <WbStat label="Arm: Passenger" value={wbData.armPassenger} />
              <WbStat label="Arm: Baggage" value={wbData.armBaggage} />
              <WbStat label="Arm: Fuel" value={wbData.armFuel} />
              <WbStat label="Unusable Fuel" value={wbData.unusableFuel} unit="gal" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <WbInput label="Empty Weight (lbs)" value={wbData.emptyWeight} onChange={(v) => setWbData(d => ({ ...d, emptyWeight: v }))} />
                <WbInput label="Empty CG (in)" value={wbData.emptyCg} onChange={(v) => setWbData(d => ({ ...d, emptyCg: v }))} />
                <WbInput label="Max Weight (lbs)" value={wbData.maxWeight} onChange={(v) => setWbData(d => ({ ...d, maxWeight: v }))} />
                <WbInput label="Fuel Capacity (gal)" value={wbData.fuelCapacity} onChange={(v) => setWbData(d => ({ ...d, fuelCapacity: v }))} />
                <WbInput label="Cruise Speed (kts)" value={wbData.cruiseSpeed} onChange={(v) => setWbData(d => ({ ...d, cruiseSpeed: v }))} />
                <WbInput label="Fuel Burn (gph)" value={wbData.fuelBurn} onChange={(v) => setWbData(d => ({ ...d, fuelBurn: v }))} />
                <WbInput label="Unusable Fuel (gal)" value={wbData.unusableFuel} onChange={(v) => setWbData(d => ({ ...d, unusableFuel: v }))} />
                <WbInput label="CG Min (in)" value={wbData.cgMin} onChange={(v) => setWbData(d => ({ ...d, cgMin: v }))} />
                <WbInput label="CG Max (in)" value={wbData.cgMax} onChange={(v) => setWbData(d => ({ ...d, cgMax: v }))} />
              </div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Arm Stations</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <WbInput label="Pilot" value={wbData.armPilot} onChange={(v) => setWbData(d => ({ ...d, armPilot: v }))} />
                <WbInput label="Passenger" value={wbData.armPassenger} onChange={(v) => setWbData(d => ({ ...d, armPassenger: v }))} />
                <WbInput label="Baggage" value={wbData.armBaggage} onChange={(v) => setWbData(d => ({ ...d, armBaggage: v }))} />
                <WbInput label="Fuel" value={wbData.armFuel} onChange={(v) => setWbData(d => ({ ...d, armFuel: v }))} />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setWbEditing(false)
                    if (aircraft) setWbData({
                      emptyWeight: aircraft.emptyWeight ?? null,
                      emptyCg: aircraft.emptyCg ?? null,
                      maxWeight: aircraft.maxWeight ?? null,
                      armPilot: aircraft.armPilot ?? null,
                      armPassenger: aircraft.armPassenger ?? null,
                      armBaggage: aircraft.armBaggage ?? null,
                      armFuel: aircraft.armFuel ?? null,
                      fuelCapacity: aircraft.fuelCapacity ?? null,
                      cruiseSpeed: aircraft.cruiseSpeed ?? null,
                      fuelBurn: aircraft.fuelBurn ?? null,
                      unusableFuel: aircraft.unusableFuel ?? null,
                      cgMin: aircraft.cgMin ?? null,
                      cgMax: aircraft.cgMax ?? null,
                    })
                  }}
                  className="rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">Values from your aircraft&apos;s POH. Use &quot;Auto-fill from DB&quot; to load typical values for common aircraft types.</p>
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="p-5">
          <h2 className="text-sm font-semibold mb-3">Documents & Photos</h2>
          <div className="mb-4">
            <DocumentUploader onUpload={handleUpload} />
          </div>
          <DocumentGrid
            documents={docs}
            onDelete={handleDelete}
            loading={docsLoading}
            emptyMessage="No documents for this aircraft yet. Upload maintenance records, photos, or any related files."
          />
        </div>
      </div>
    </div>
  )
}

function WbStat({ label, value, unit }: { label: string; value: number | string | null; unit?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold">
        {value != null ? (typeof value === 'number' ? `${value}${unit ? ` ${unit}` : ''}` : value) : <span className="text-muted-foreground/50">—</span>}
      </p>
    </div>
  )
}

function WbInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] text-muted-foreground">{label}</label>
      <input
        type="number"
        step="any"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  )
}
