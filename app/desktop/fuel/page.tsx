'use client'

import { useCallback, useEffect, useState } from 'react'
import { Fuel, Loader2, PlusCircle, Search } from 'lucide-react'
import { cloudApi, type FuelFeedRow } from '@/apps/desktop/src/lib/cloud-api'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { ErrorCard } from '@/desktop/components/error-card'
import { toast } from '@/components/ui/use-toast'
import { notifyError } from '@/desktop/lib/toast-helpers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ── Constants ─────────────────────────────────────────────────

const FUEL_TYPES = ['100LL', 'JetA', 'MOGAS', 'UL94'] as const
type FuelType = (typeof FUEL_TYPES)[number]

const PAGE_SIZE = 50

// ── Formatting helpers ──────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`
}

function relativeTime(dateStr: string): string {
  const then = new Date(dateStr)
  if (isNaN(then.getTime())) return dateStr
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const dayDiff = Math.round((startOfToday.getTime() - startOfThen.getTime()) / 86400000)

  if (dayDiff <= 0) return 'today'
  if (dayDiff === 1) return 'yesterday'
  if (dayDiff < 7) return `${dayDiff} days ago`
  const weeks = Math.floor(dayDiff / 7)
  if (weeks < 5) return `${weeks} week${weeks > 1 ? 's' : ''} ago`
  const months = Math.floor(dayDiff / 30)
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`
  const years = Math.floor(dayDiff / 365)
  return `${years} year${years > 1 ? 's' : ''} ago`
}

// ── Component ─────────────────────────────────────────────────

export default function DesktopFuelPage() {
  const { status } = useDesktopAuth()

  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [fuelType, setFuelType] = useState('all')
  const [sort, setSort] = useState('recent')
  const [mode, setMode] = useState('all')

  const [rows, setRows] = useState<FuelFeedRow[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim().toUpperCase()), 300)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (append) setLoadingMore(true)
      else setLoading(true)
      setLoadError(null)
      try {
        const res = await cloudApi.getFuelFeed({
          q: debouncedQ || undefined,
          fuelType,
          sort,
          mode,
          limit: PAGE_SIZE,
          offset: nextOffset,
        })
        const newRows = Array.isArray(res?.prices) ? res.prices : []
        setRows((prev) => (append ? [...prev, ...newRows] : newRows))
        setHasMore(Boolean(res?.hasMore))
        setOffset(nextOffset)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load fuel prices')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [debouncedQ, fuelType, sort, mode]
  )

  useEffect(() => {
    load(0, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, fuelType, sort, mode])

  async function handleLoadMore() {
    await load(offset + PAGE_SIZE, true)
  }

  function handleReported() {
    setDialogOpen(false)
    load(0, false)
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Fuel className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Fuel Prices</h1>
          </div>
          <p className="text-sm text-muted-foreground">Community-submitted fuel prices from other pilots.</p>
        </div>
        {status === 'authenticated' && (
          <Button onClick={() => setDialogOpen(true)}>
            <PlusCircle className="h-4 w-4" />
            Report a price
          </Button>
        )}
      </div>

      {status === 'authenticated' && (
        <>
          {/* Controls */}
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[160px]">
              <Label htmlFor="fuel-search" className="mb-1.5">Airport</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="fuel-search"
                  value={q}
                  onChange={(e) => setQ(e.target.value.toUpperCase())}
                  placeholder="ICAO (e.g. KPAO)"
                  maxLength={7}
                  className="pl-8 uppercase"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="min-w-[140px]">
              <Label className="mb-1.5">Fuel type</Label>
              <Select value={fuelType} onValueChange={setFuelType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {FUEL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[150px]">
              <Label className="mb-1.5">Sort</Label>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Most recent</SelectItem>
                  <SelectItem value="cheapest">Cheapest</SelectItem>
                  <SelectItem value="highest">Highest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[190px]">
              <Label className="mb-1.5">View</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All submissions</SelectItem>
                  <SelectItem value="latest">Latest per airport</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : loadError ? (
            <ErrorCard message={loadError} onRetry={() => load(0, false)} />
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
              <Fuel className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                No fuel prices reported yet — be the first to report one.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Airport</th>
                      <th className="px-3 py-2 text-left">FBO</th>
                      <th className="px-3 py-2 text-left">Fuel</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-left">Reported</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                        <td className="px-3 py-2 font-mono text-sm font-semibold">
                          <div className="flex items-center gap-1.5">
                            {row.icao}
                            {row.isMine && (
                              <Badge variant="secondary" className="text-[10px]">you</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.fbo || '—'}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline">{row.fuelType}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right text-base font-bold tabular-nums">
                          {fmtMoney(row.price)}<span className="text-xs font-normal text-muted-foreground">/gal</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          reported {relativeTime(row.purchaseDate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
                    {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <ReportPriceDialog open={dialogOpen} onOpenChange={setDialogOpen} onReported={handleReported} />
    </div>
  )
}

// ── Report price dialog ──────────────────────────────────────

function ReportPriceDialog({
  open,
  onOpenChange,
  onReported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReported: () => void
}) {
  const [icao, setIcao] = useState('')
  const [fbo, setFbo] = useState('')
  const [fuelType, setFuelType] = useState<FuelType>('100LL')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(todayIso())
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setIcao('')
      setFbo('')
      setFuelType('100LL')
      setPrice('')
      setDate(todayIso())
      setFormError(null)
    }
  }, [open])

  function validate(): string | null {
    const icaoUpper = icao.trim().toUpperCase()
    if (!/^[A-Z0-9]{3,7}$/.test(icaoUpper)) return 'Airport must be 3-7 letters/numbers (e.g. KPAO).'
    const p = Number(price)
    if (!Number.isFinite(p) || p <= 0 || p > 50) return 'Price must be a number between $0 and $50.'
    return null
  }

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
      await cloudApi.reportFuelPrice({
        icao: icao.trim().toUpperCase(),
        fbo: fbo.trim() || undefined,
        fuelType,
        price: Number(price),
        purchaseDate: date ? new Date(date).toISOString() : undefined,
      })
      toast({ title: 'Price reported', description: 'Thanks for sharing with the community.' })
      onReported()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to report price'
      if (message.includes('409') || message.toLowerCase().includes('already reported')) {
        setFormError('You already reported this airport/fuel today.')
      } else {
        notifyError('Report price', message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report a fuel price</DialogTitle>
          <DialogDescription>Share what you paid to help other pilots plan fuel stops.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="report-icao" className="mb-1.5">Airport</Label>
              <Input
                id="report-icao"
                value={icao}
                onChange={(e) => setIcao(e.target.value.toUpperCase())}
                placeholder="KPAO"
                maxLength={7}
                className="uppercase"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="report-fbo" className="mb-1.5">
                FBO <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="report-fbo"
                value={fbo}
                onChange={(e) => setFbo(e.target.value)}
                placeholder="e.g. Signature"
              />
            </div>
            <div>
              <Label htmlFor="report-fuel-type" className="mb-1.5">Fuel type</Label>
              <Select value={fuelType} onValueChange={(v) => setFuelType(v as FuelType)}>
                <SelectTrigger id="report-fuel-type" className="w-full">
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
              <Label htmlFor="report-price" className="mb-1.5">Price / gal</Label>
              <Input
                id="report-price"
                type="number"
                inputMode="decimal"
                min={0}
                max={50}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="report-date" className="mb-1.5">Date</Label>
              <Input
                id="report-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fuel className="h-4 w-4" />}
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
