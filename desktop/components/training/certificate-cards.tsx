'use client'

import { Award, Check, Lock } from 'lucide-react'
import { CERTIFICATES, type CertType, type CertProgress } from '@/desktop/data/training-data'

interface Props {
  progressMap: Record<string, CertProgress>
  activeCert: CertType
  onSelect: (cert: CertType) => void
}

export default function CertificateCards({ progressMap, activeCert, onSelect }: Props) {
  // Show all certs, but only unlock path: PPL → IR → CPL → CFI → CFII → MEI
  const getCertStatus = (certId: CertType): 'active' | 'locked' | 'unlocked' => {
    const cert = CERTIFICATES.find(c => c.id === certId)!
    if (certId === activeCert) return 'active'
    if (cert.prerequisites.length === 0) return 'unlocked'

    // A cert is unlocked if all its prereqs are at 100%
    const allPrereqsMet = cert.prerequisites.every(prereqId => {
      const p = progressMap[prereqId]
      return p && p.overallPercent >= 100
    })
    return allPrereqsMet ? 'unlocked' : 'locked'
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {CERTIFICATES.map((cert) => {
        const progress = progressMap[cert.id]
        const status = getCertStatus(cert.id)
        const isActive = status === 'active'
        const isLocked = status === 'locked'
        const pct = progress?.overallPercent || 0
        const circumference = 2 * Math.PI * 18 // r=18

        return (
          <button
            key={cert.id}
            onClick={() => !isLocked && onSelect(cert.id)}
            disabled={isLocked}
            className={cn(
              'group relative flex flex-col items-center rounded-xl border p-3 text-center transition-all',
              isActive
                ? 'border-primary bg-gradient-to-br shadow-sm ring-1 ring-primary/30'
                : isLocked
                  ? 'border-border/60 bg-muted/20 opacity-50 cursor-not-allowed'
                  : 'border-border bg-card hover:border-primary/40 hover:shadow-sm hover:bg-muted/30 cursor-pointer'
            )}>
            {/* Lock overlay */}
            {isLocked && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-muted/30">
                <div className="flex flex-col items-center gap-1">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {cert.prerequisites.join(' + ')}
                  </span>
                </div>
              </div>
            )}

            {/* Progress ring */}
            <div className="relative mb-1.5 h-12 w-12">
              <svg className="h-12 w-12 -rotate-90" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="3"
                  className="text-muted/20" />
                <circle cx="22" cy="22" r="18" fill="none" strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
                  className={cn(
                    'transition-all duration-700',
                    pct >= 100 ? 'stroke-emerald-500' : isActive ? 'stroke-primary' : 'stroke-muted-foreground/40'
                  )} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                {pct >= 100 ? (
                  <Check className="h-5 w-5 text-emerald-500" />
                ) : (
                  <span className={cn(
                    'text-xs font-bold tabular-nums',
                    pct >= 80 ? 'text-emerald-500' : pct >= 50 ? 'text-amber-500' : 'text-muted-foreground'
                  )}>
                    {pct}%
                  </span>
                )}
              </div>
            </div>

            {/* Name */}
            <span className={cn(
              'text-xs font-semibold',
              isActive ? 'text-foreground' : 'text-muted-foreground'
            )}>
              {cert.shortName}
            </span>
            <span className={cn(
              'text-[10px] tabular-nums',
              isActive ? 'text-muted-foreground' : 'text-muted-foreground/60'
            )}>
              {progress ? `${Math.round(progress.requirements.reduce((s, r) => s + r.current, 0))}/${cert.totalHoursRequired}h` : `0/${cert.totalHoursRequired}h`}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
