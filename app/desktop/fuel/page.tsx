'use client'

import { useCallback, useEffect, useState } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Fuel, Loader2, PlusCircle, Search, DollarSign, TrendingDown, Users, ListChecks } from 'lucide-react'
import { cloudApi, type FuelFeedRow } from '@/apps/desktop/src/lib/cloud-api'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { ErrorCard } from '@/desktop/components/error-card'
import { toast } from '@/components/ui/use-toast'
import { notifyError } from '@/desktop/lib/toast-helpers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
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

const FUEL_TYPE_CHIP_CLASS: Record<string, string> = {
  '100LL': 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  JetA: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  MOGAS: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  UL94: 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400',
}

// ── Formatting helpers ──────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtAxisDate(dateStr: string, scope: 'airport' | 'overall'): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const short = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return scope === 'overall' ? `wk of ${short}` : short
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

  // Trend + stats
  const [trendScope, setTrendScope] = useState<'airport' | 'overall'>('overall')
  const [trendFuelType, setTrendFuelType] = useState<string>('100LL')
  const [trendPoints, setTrendPoints] = useState<{ date: string; price: number; count?: number; icao?: string }[]>([])
  const [stats, setStats] = useState<{
    count: number
    contributors: number
    avgPrice: number | null
    cheapest: { icao: string; price: number } | null
    fuelType: string
  } | null>(null)
  const [trendLoading, setTrendLoading] = useState(true)

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

  // Trend + stats — re-fetch on fuel type / airport search change.
  useEffect(() => {
    let cancelled = false
    async function loadTrend() {
      setTrendLoading(true)
      try {
        const res = await cloudApi.getFuelTrend({
          icao: debouncedQ || undefined,
          fuelType,
        })
        if (cancelled) return
        setTrendScope(res.scope)
        setTrendFuelType(res.fuelType)
        setTrendPoints(Array.isArray(res.points) ? res.points : [])
        setStats(res.stats)
      } catch {
        if (cancelled) return
        setTrendPoints([])
        setStats(null)
      } finally {
        if (!cancelled) setTrendLoading(false)
      }
    }
    loadTrend()
    return () => {
      cancelled = true
    }
  }, [debouncedQ, fuelType])

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

          {/* Stats band */}
          <StatsBand stats={stats} loading={trendLoading} />

          {/* Trend chart */}
          <TrendChart scope={trendScope} fuelType={trendFuelType} points={trendPoints} loading={trendLoading} icaoFilter={debouncedQ} />

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
              <div className="grid gap-3 sm:grid-cols-2">
                {rows.map((row) => (
                  <FuelPriceCard key={row.id} row={row} />
                ))}
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

// ── Stats band ────────────────────────────────────────────────

function StatsBand({
  stats,
  loading,
}: {
  stats: { count: number; contributors: number; avgPrice: number | null; cheapest: { icao: string; price: number } | null; fuelType: string } | null
  loading: boolean
}) {
  const cheapestLabel = stats?.cheapest ? `${stats.cheapest.icao} ${fmtMoney(stats.cheapest.price)}` : '—'
  const avgLabel = stats?.avgPrice != null ? fmtMoney(stats.avgPrice) : '—'
  const contributorsLabel = stats ? String(stats.contributors) : '—'
  const reportsLabel = stats ? String(stats.count) : '—'

  const items = [
    { label: 'Cheapest', value: cheapestLabel, icon: TrendingDown },
    { label: 'Average', value: avgLabel, icon: DollarSign },
    { label: 'Contributors', value: contributorsLabel, icon: Users },
    { label: 'Reports', value: reportsLabel, icon: ListChecks },
  ]

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(({ label, value, icon: Icon }) => (
        <Card key={label} className="py-3">
          <CardContent className="flex items-center gap-2.5 px-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className={`truncate text-sm font-semibold tabular-nums ${loading ? 'text-muted-foreground' : 'text-foreground'}`}>
                {loading ? '…' : value}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ── Trend chart ───────────────────────────────────────────────

function TrendChart({
  scope,
  fuelType,
  points,
  loading,
  icaoFilter,
}: {
  scope: 'airport' | 'overall'
  fuelType: string
  points: { date: string; price: number; count?: number; icao?: string }[]
  loading: boolean
  icaoFilter: string
}) {
  const title =
    scope === 'airport' && points[0]?.icao
      ? `${points[0].icao} ${fuelType} price history`
      : scope === 'airport' && icaoFilter
      ? `${icaoFilter} ${fuelType} price history`
      : `Average ${fuelType} price · recent weeks`

  const chartConfig: ChartConfig = {
    price: {
      label: `${fuelType} price`,
      color: 'hsl(199, 89%, 48%)',
    },
  }

  return (
    <Card className="mb-4 py-4">
      <CardContent className="px-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : points.length < 2 ? (
          <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-border">
            <p className="text-sm text-muted-foreground">Not enough data yet to chart a trend.</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-48 w-full">
            <AreaChart data={points} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
              <defs>
                <linearGradient id="fuelPriceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-price)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-price)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => fmtAxisDate(v, scope)}
                tick={{ fontSize: 10 }}
                axisLine={{ strokeWidth: 1 }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                axisLine={{ strokeWidth: 1 }}
                tickLine={false}
                width={44}
                tickFormatter={(v: number) => fmtMoney(v)}
                domain={['auto', 'auto']}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_label: unknown, payload: Array<{ payload?: { date: string } }>) => {
                      const p = payload?.[0]?.payload
                      return p ? fmtAxisDate(p.date, scope) : ''
                    }}
                    formatter={(value: unknown) => [fmtMoney(Number(value)), scope === 'airport' ? 'Price' : 'Avg price']}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="var(--color-price)"
                fill="url(#fuelPriceFill)"
                strokeWidth={2}
                dot={{ r: 2.5, fill: 'var(--color-price)', strokeWidth: 0 }}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ── Fuel price card ───────────────────────────────────────────

function FuelPriceCard({ row }: { row: FuelFeedRow }) {
  const chipClass = FUEL_TYPE_CHIP_CLASS[row.fuelType] || 'border-border bg-muted text-muted-foreground'

  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-base font-bold text-foreground">{row.icao}</span>
            {row.isMine && (
              <Badge variant="secondary" className="text-[10px]">you</Badge>
            )}
          </div>
          <Badge variant="outline" className={chipClass}>
            {row.fuelType}
          </Badge>
        </div>

        <div className="mb-2">
          <span className="text-2xl font-bold tabular-nums text-foreground">{fmtMoney(row.price)}</span>
          <span className="ml-1 text-xs font-normal text-muted-foreground">/gal</span>
        </div>

        <p className="mb-2 truncate text-sm text-muted-foreground">{row.fbo || 'FBO not specified'}</p>

        <p className="text-xs text-muted-foreground">
          {fmtDate(row.purchaseDate)}{' '}
          <span className="text-muted-foreground/70">({relativeTime(row.purchaseDate)})</span>
          {' · reported by '}
          {row.submittedBy || 'a pilot'}
        </p>
      </CardContent>
    </Card>
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
