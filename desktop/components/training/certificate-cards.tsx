'use client'

import { Check, Lock } from 'lucide-react'
import { CERTIFICATES, type CertType, type CertProgress } from '@/desktop/data/training-data'

interface Props {
  progressMap: Record<string, CertProgress>
  activeCert: CertType
  onSelect: (cert: CertType) => void
}

export default function CertificateCards({ progressMap, activeCert, onSelect }: Props) {
  const getCertStatus = (certId: CertType): 'active' | 'locked' | 'unlocked' => {
    const cert = CERTIFICATES.find(c => c.id === certId)!
    if (certId === activeCert) return 'active'
    if (cert.prerequisites.length === 0) return 'unlocked'
    const allPrereqsMet = cert.prerequisites.every(prereqId => {
      const p = progressMap[prereqId]
      return p && p.overallPercent >= 100
    })
    return allPrereqsMet ? 'unlocked' : 'locked'
  }

  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-7 gap-2">
      {CERTIFICATES.map((cert) => {
        const progress = progressMap[cert.id]
        const status = getCertStatus(cert.id)
        const isActive = status === 'active'
        const isLocked = status === 'locked'
        const pct = progress?.overallPercent ?? 0
        const r = 16
        const circumference = 2 * Math.PI * r

        const hoursDone = progress
          ? Math.round(progress.requirements.reduce((s, r) => s + (r.current ?? 0), 0))
          : 0

        return (
          <button
            key={cert.id}
            onClick={() => !isLocked && onSelect(cert.id)}
            disabled={isLocked}
            className={cn(
              'relative flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all min-w-0',
              isActive
                ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30'
                : isLocked
                  ? 'border-border/60 bg-muted/20 opacity-50 cursor-not-allowed'
                  : 'border-border bg-card hover:border-primary/40 hover:shadow-sm hover:bg-muted/30 cursor-pointer'
            )}>
            {/* Lock overlay */}
            {isLocked && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-muted/40 backdrop-blur-[1px]">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}

            {/* Mini progress ring */}
            <div className="relative h-9 w-9 shrink-0">
              <svg className="h-9 w-9 -rotate-90" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="3"
                  className="text-muted/25" />
                <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
                  className={cn(
                    'transition-all duration-700',
                    pct >= 100 ? 'stroke-emerald-500' : isActive ? 'stroke-primary' : 'stroke-muted-foreground/40'
                  )} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                {pct >= 100 ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <span className={cn(
                    'text-[10px] font-bold tabular-nums leading-none',
                    pct >= 80 ? 'text-emerald-500' : pct >= 50 ? 'text-amber-500' : 'text-muted-foreground'
                  )}>
                    {pct}%
                  </span>
                )}
              </div>
            </div>

            {/* Text */}
            <div className="min-w-0">
              <div className={cn(
                'text-xs font-semibold leading-tight truncate',
                isActive ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {cert.shortName}
              </div>
              <div className="text-[10px] tabular-nums leading-tight text-muted-foreground/70">
                {hoursDone}/{cert.totalHoursRequired}h
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
