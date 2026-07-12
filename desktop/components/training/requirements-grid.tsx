'use client'

import { CheckCircle2, Clock, AlertTriangle, Award } from 'lucide-react'
import { type RequirementProgress, type CertInfo } from '@/desktop/data/training-data'

interface Props {
  cert: CertInfo
  requirements: RequirementProgress[]
  overallPercent: number
  metCount: number
  totalCount: number
}

export default function RequirementsGrid({ cert, requirements, overallPercent, metCount, totalCount }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{cert.name} — FAR Requirements</h3>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {cert.farPart}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs tabular-nums">
          <span className={metCount === totalCount ? 'text-emerald-500 font-semibold' : 'text-foreground'}>
            {metCount}/{totalCount} met
          </span>
          <span className="text-muted-foreground">·</span>
          <span className={overallPercent >= 80 ? 'text-emerald-500 font-semibold' : 'text-foreground'}>
            {overallPercent}%
          </span>
        </div>
      </div>

      {/* Requirements */}
      <div className="divide-y divide-border/50">
        {requirements.map((req) => {
          const barColor = req.met
            ? 'bg-emerald-500'
            : req.percent >= 80
              ? 'bg-amber-500'
              : 'bg-primary'

          return (
            <div key={req.key} className="px-4 py-2.5">
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-medium text-foreground">{req.label}</span>
                  <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                    {req.farRef}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                  <span className={cn(
                    'text-xs font-semibold',
                    req.met ? 'text-emerald-500' : 'text-foreground'
                  )}>
                    {fmtReq(req.current, req.unit)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    / {fmtReq(req.required, req.unit)}
                  </span>
                  {req.met ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-all duration-700', barColor)}
                  style={{ width: `${req.percent}%` }}
                />
              </div>

              <div className="mt-0.5 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{req.description}</span>
                {!req.met && (
                  <span className="text-[10px] font-medium tabular-nums text-amber-500">
                    {fmtReq(req.remaining, req.unit)} left
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function fmtReq(value: number, unit: string): string {
  if (unit === 'hours') {
    const h = Math.floor(value)
    const m = Math.round((value - h) * 60)
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }
  return String(Math.round(value))
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
