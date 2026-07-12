'use client'

import { CheckCircle2, Circle, FileText, BookOpen, Shuffle, Award, AlertTriangle } from 'lucide-react'
import { CHECKRIDE_ITEMS, type CertType, type RequirementProgress } from '@/desktop/data/training-data'

interface Props {
  certId: CertType
  requirements: RequirementProgress[]
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  requirement: { label: 'Requirements', icon: Award, color: 'text-blue-500' },
  document: { label: 'Documents & Endorsements', icon: FileText, color: 'text-purple-500' },
  oral: { label: 'Oral Topics', icon: BookOpen, color: 'text-amber-500' },
  maneuver: { label: 'Flight Maneuvers', icon: Shuffle, color: 'text-emerald-500' },
}

export default function CheckrideMeter({ certId, requirements }: Props) {
  const items = CHECKRIDE_ITEMS[certId]
  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-xs text-muted-foreground">No checkride items defined for this certificate.</p>
      </div>
    )
  }

  // Determine if a requirement checkride item is met
  const isItemMet = (itemId: string): boolean => {
    const item = items.find(i => i.id === itemId)
    if (!item || item.category !== 'requirement') return false
    // Map checkride item labels to requirement keys
    const reqKey = requirements.find(r => {
      // Match by checking if the item label relates to this requirement
      const label = item.label.toLowerCase()
      const rLabel = r.label.toLowerCase()
      return label.includes(rLabel) || rLabel.includes(label) ||
        label.includes(r.key.toLowerCase())
    })
    if (reqKey) return reqKey.met
    return false
  }

  // Group items by category
  const grouped = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, typeof items>)

  // Compute overall readiness
  let metItems = 0
  let totalAutoCheckable = 0
  for (const item of items) {
    if (item.category === 'requirement') {
      totalAutoCheckable++
      if (isItemMet(item.id)) metItems++
    }
  }
  const readinessPct = totalAutoCheckable > 0 ? Math.round((metItems / totalAutoCheckable) * 100) : 0
  const circumference = 2 * Math.PI * 32 // r=32

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Checkride Readiness</h3>
        </div>
        <div className="flex items-center gap-2 text-xs tabular-nums">
          <span className={readinessPct >= 100 ? 'text-emerald-500 font-semibold' : 'text-foreground'}>
            {metItems}/{totalAutoCheckable} met
          </span>
          <span className="text-muted-foreground">·</span>
          <span className={readinessPct >= 100 ? 'text-emerald-500 font-semibold' : readinessPct >= 80 ? 'text-amber-500 font-semibold' : 'text-foreground'}>
            {readinessPct}%
          </span>
        </div>
      </div>

      <div className="p-4">
        {/* Readiness doughnut */}
        <div className="mb-4 flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0">
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="32" fill="none" stroke="currentColor" strokeWidth="4"
                className="text-muted/20" />
              <circle cx="36" cy="36" r="32" fill="none" strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${(readinessPct / 100) * circumference} ${circumference}`}
                className={cn(
                  'transition-all duration-700',
                  readinessPct >= 100 ? 'stroke-emerald-500' : readinessPct >= 80 ? 'stroke-amber-500' : 'stroke-primary'
                )} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={cn(
                'text-lg font-bold tabular-nums',
                readinessPct >= 100 ? 'text-emerald-500' : readinessPct >= 80 ? 'text-amber-500' : 'text-foreground'
              )}>
                {readinessPct}%
              </span>
            </div>
          </div>
          <div className="flex-1 text-xs text-muted-foreground">
            <p>
              Checkride readiness is auto-computed from your logbook.
              {readinessPct >= 100
                ? ' All FAR requirements are met. Schedule your checkride!'
                : ` ${totalAutoCheckable - metItems} requirement${totalAutoCheckable - metItems !== 1 ? 's' : ''} still need attention.`}
            </p>
            <p className="mt-1">
              <span className="font-medium text-foreground">Note:</span> Documents, oral topics, and maneuvers are shown for reference and are marked as manual.
            </p>
          </div>
        </div>

        {/* Category groups */}
        <div className="space-y-3">
          {Object.entries(CATEGORY_CONFIG).map(([catKey, config]) => {
            const catItems = grouped[catKey]
            if (!catItems || catItems.length === 0) return null
            const Icon = config.icon
            const catMet = catItems.filter(i => isItemMet(i.id)).length

            return (
              <div key={catKey}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Icon className={cn('h-3.5 w-3.5', config.color)} />
                  <span className="text-xs font-medium text-foreground">{config.label}</span>
                  {catKey === 'requirement' && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      ({catMet}/{catItems.length})
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {catItems.map(item => {
                    const met = item.category === 'requirement' ? isItemMet(item.id) : null
                    return (
                      <div key={item.id}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                          met === true ? 'bg-emerald-500/5' :
                          met === false ? 'bg-muted/30' :
                          'bg-muted/10'
                        )}
                      >
                        {met === true && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                        {met === false && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                        {met === null && <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />}
                        <span className={cn(
                          'flex-1',
                          met === true ? 'text-emerald-600' :
                          met === false ? 'text-foreground' :
                          'text-muted-foreground'
                        )}>
                          {item.label}
                        </span>
                        {met === null && (
                          <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground/60">
                            Manual
                          </span>
                        )}
                        {met === true && (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
