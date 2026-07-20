'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Fuel, Loader2, Plane, Receipt, DollarSign } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'
import { ErrorCard } from '@/desktop/components/error-card'
import { toast } from '@/components/ui/use-toast'
import { notifyError } from '@/desktop/lib/toast-helpers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// ── Types ──────────────────────────────────────────────────────

const FUEL_TYPES = ['100LL', 'JetA', 'MOGAS', 'UL94'] as const
type FuelType = (typeof FUEL_TYPES)[number]

interface FuelLog {
  id: string
  airportIcao: string | null
  gallons: number
  pricePerGallon: number
  totalCost: number
  fuelType: string | null
  notes: string | null
  createdAt: string
}

// ── Formatting helpers ──────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

// ── Page Component ─────────────────────────────────────────────

export default function DesktopExpensesPage() {
  const { status } = useDesktopAuth()

  // Form state
  const [airportIcao, setAirportIcao] = useState('')
  const [gallons, setGallons] = useState('')
  const [pricePerGallon, setPricePerGallon] = useState('')
  const [fuelType, setFuelType] = useState<FuelType>('100LL')
  const [purchaseDate, setPurchaseDate] = useState(todayIso())
  const [notes, setNotes] = useState('')
  const [contributeToCommunity, setContributeToCommunity] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // History state
  const [logs, setLogs] = useState<FuelLog[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await cloudApi.getFuelLogs()
      setLogs(Array.isArray(res?.fuelLogs) ? res.fuelLogs : [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load fuel history')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated') load()
  }, [status, load])

  // ── Derived values ──

  const liveTotal = useMemo(() => {
    const g = Number(gallons)
    const p = Number(pricePerGallon)
    if (!Number.isFinite(g) || !Number.isFinite(p) || g <= 0 || p <= 0) return null
    return g * p
  }, [gallons, pricePerGallon])

  const summary = useMemo(() => {
    let totalGallons = 0
    let totalSpent = 0
    for (const log of logs) {
      totalGallons += log.gallons
      totalSpent += log.totalCost
    }
    return { totalGallons, totalSpent }
  }, [logs])

  // ── Validation ──

  function validate(): string | null {
    const icao = airportIcao.trim().toUpperCase()
    if (!/^[A-Z0-9]{3,7}$/.test(icao)) return 'Airport must be 3-7 letters/numbers (e.g. KPAO).'
    const g = Number(gallons)
    if (!Number.isFinite(g) || g <= 0 || g > 500) return 'Gallons must be a number between 0 and 500.'
    const p = Number(pricePerGallon)
    if (!Number.isFinite(p) || p <= 0 || p > 50) return 'Price per gallon must be a number between $0 and $50.'
    return null
  }

  // ── Submit ──

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = validate()
    if (err) {
      setFormError(err)
      return
    }
    setFormError(null)
    setSubmitting(true)
    try {
      const res = await cloudApi.logFuel({
        airportIcao: airportIcao.trim().toUpperCase(),
        gallons: Number(gallons),
        pricePerGallon: Number(pricePerGallon),
        fuelType,
        purchaseDate: purchaseDate ? new Date(purchaseDate).toISOString() : undefined,
        notes: notes.trim() || undefined,
        contributeToCommunity,
      })
      toast({
        title: 'Fuel logged',
        description: res.contributed
          ? `${fmtMoney(res.totalCost)} total. Shared to community map.`
          : `${fmtMoney(res.totalCost)} total.`,
      })
      setAirportIcao('')
      setGallons('')
      setPricePerGallon('')
      setFuelType('100LL')
      setPurchaseDate(todayIso())
      setNotes('')
      setContributeToCommunity(true)
      await load()
    } catch (err) {
      notifyError('Fuel log', err instanceof Error ? err.message : 'Failed to log fuel')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ──

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Expenses</h1>
        </div>
        <p className="text-sm text-muted-foreground">Track your flying costs — start by logging fuel.</p>
      </div>

      {/* ── Log fuel ── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Fuel className="h-4 w-4 text-muted-foreground" /> Log fuel
          </CardTitle>
          <CardDescription>Record a fuel purchase to track your personal flying costs.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="fuel-airport" className="mb-1.5">Airport</Label>
                <Input
                  id="fuel-airport"
                  value={airportIcao}
                  onChange={(e) => setAirportIcao(e.target.value.toUpperCase())}
                  placeholder="KPAO"
                  maxLength={7}
                  className="uppercase"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="fuel-type" className="mb-1.5">Fuel type</Label>
                <Select value={fuelType} onValueChange={(v) => setFuelType(v as FuelType)}>
                  <SelectTrigger id="fuel-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FUEL_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="fuel-gallons" className="mb-1.5">Gallons</Label>
                <Input
                  id="fuel-gallons"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={500}
                  step="0.01"
                  value={gallons}
                  onChange={(e) => setGallons(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="fuel-price" className="mb-1.5">Price / gal</Label>
                <div className="relative">
                  <DollarSign className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="fuel-price"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={50}
                    step="0.01"
                    value={pricePerGallon}
                    onChange={(e) => setPricePerGallon(e.target.value)}
                    placeholder="0.00"
                    className="pl-8"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="fuel-date" className="mb-1.5">Date</Label>
                <Input
                  id="fuel-date"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="fuel-notes" className="mb-1.5">
                  Notes <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="fuel-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Self-serve, tail number"
                />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3">
              <Checkbox
                id="fuel-contribute"
                checked={contributeToCommunity}
                onCheckedChange={(v) => setContributeToCommunity(v === true)}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="fuel-contribute" className="font-medium">Share this price to the community fuel map</Label>
                <p className="text-xs text-muted-foreground">Helps other pilots find current fuel prices at this airport. No personal info is shared.</p>
              </div>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="flex items-center justify-between border-t border-border pt-4">
              <div className="text-sm text-muted-foreground">
                Total: <span className="font-semibold text-foreground tabular-nums">{liveTotal !== null ? fmtMoney(liveTotal) : '—'}</span>
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fuel className="h-4 w-4" />}
                {submitting ? 'Logging…' : 'Log fuel'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Fuel history ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Fuel history</h2>
          {logs.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {summary.totalGallons.toFixed(1)} gal &middot; {fmtMoney(summary.totalSpent)} total
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <ErrorCard message={loadError} onRetry={load} />
        ) : logs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <Plane className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No fuel logged yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Airport</th>
                  <th className="px-3 py-2 text-right">Gallons</th>
                  <th className="px-3 py-2 text-right">$/gal</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Fuel type</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(log.createdAt)}</td>
                    <td className="px-3 py-2 font-mono text-xs font-medium">{log.airportIcao || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{log.gallons.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(log.pricePerGallon)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(log.totalCost)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{log.fuelType || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
