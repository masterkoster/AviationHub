'use client'

import { Plane, Fuel, Scale, Clock, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Waypoint } from '../types'

interface MapStatusBarProps {
  waypoints: Waypoint[]
  fuelPercent: number
  wbWithinLimits: boolean
  wbCg: number
  estRangeNm: number
  estTimeHrs?: number
  totalDistanceNm?: number
}

export function MapStatusBar({
  waypoints,
  fuelPercent,
  wbWithinLimits,
  wbCg,
  estRangeNm,
  estTimeHrs,
  totalDistanceNm,
}: MapStatusBarProps) {
  const hasRoute = waypoints.length >= 2

  if (!hasRoute) {
    return (
      <div className="flex h-8 shrink-0 items-center justify-center border-t border-border bg-card px-4 text-[11px] text-muted-foreground">
        <MapPin className="mr-1.5 h-3 w-3" />
        Search airports and click them to build a route
      </div>
    )
  }

  const route = waypoints.map((w) => w.icao).join(' → ')

  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-card px-4 text-[11px]">
      {/* Route summary */}
      <div className="flex min-w-0 items-center gap-1.5">
        <Plane className="h-3 w-3 shrink-0 text-primary" />
        <span className="truncate font-mono font-medium">{route}</span>
        {totalDistanceNm != null && (
          <span className="ml-2 text-muted-foreground">· {Math.round(totalDistanceNm)}nm</span>
        )}
        {estTimeHrs != null && (
          <span className="text-muted-foreground">
            · {estTimeHrs.toFixed(1)}h
          </span>
        )}
      </div>

      {/* Live stats */}
      <div className="flex items-center gap-3">
        <StatBadge
          icon={Fuel}
          label="Fuel"
          value={`${fuelPercent}%`}
        />
        <StatBadge
          icon={Scale}
          label="W&B"
          value={wbWithinLimits ? 'OK' : '⚠'}
          className={wbWithinLimits ? 'text-emerald-600' : 'text-destructive'}
          title={`CG: ${wbCg.toFixed(1)}"`}
        />
        <StatBadge
          icon={Clock}
          label="Range"
          value={`${Math.round(estRangeNm)}nm`}
        />
      </div>
    </div>
  )
}

function StatBadge({
  icon: Icon,
  label,
  value,
  className,
  title,
}: {
  icon: typeof Fuel
  label: string
  value: string
  className?: string
  title?: string
}) {
  return (
    <div className="flex items-center gap-1" title={title}>
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className={cn('font-semibold', className)}>{value}</span>
    </div>
  )
}
