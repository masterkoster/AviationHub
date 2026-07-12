'use client'

import { Check, Circle, ChevronRight } from 'lucide-react'
import { type MilestoneProgress, type CertInfo } from '@/desktop/data/training-data'

interface Props {
  cert: CertInfo
  milestones: MilestoneProgress[]
}

export default function TrainingRoadmap({ cert, milestones }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold">Training Roadmap</span>
        <span className="text-xs text-muted-foreground">— {cert.name}</span>
      </div>

      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-muted-foreground/20" />

        <div className="space-y-0">
          {milestones.map((ms, i) => {
            const isLast = i === milestones.length - 1

            return (
              <div key={ms.id} className="relative flex gap-4 pb-6 last:pb-0">
                {/* Status dot */}
                <div className="relative z-10 mt-0.5 flex shrink-0">
                  <div className={cn(
                    'flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 transition-all',
                    ms.status === 'complete'
                      ? 'border-emerald-500 bg-emerald-500'
                      : ms.status === 'active'
                        ? 'border-primary bg-primary shadow-sm shadow-primary/30'
                        : 'border-muted-foreground/30 bg-card'
                  )}>
                    {ms.status === 'complete' && <Check className="h-3.5 w-3.5 text-white" />}
                    {ms.status === 'active' && <div className="h-2.5 w-2.5 rounded-full bg-white" />}
                    {ms.status === 'pending' && <Circle className="h-3 w-3 text-muted-foreground/40" />}
                  </div>
                </div>

                {/* Content */}
                <div className={cn(
                  'flex-1 rounded-lg border p-3 transition-all',
                  ms.status === 'active'
                    ? 'border-primary/40 bg-primary/[0.03]'
                    : ms.status === 'complete'
                      ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
                      : 'border-border bg-muted/10'
                )}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={cn(
                        'text-sm font-medium',
                        ms.status === 'complete' ? 'text-emerald-600' :
                        ms.status === 'active' ? 'text-foreground' : 'text-muted-foreground'
                      )}>
                        {ms.title}
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">{ms.description}</p>
                    </div>
                    {ms.status === 'active' && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Current
                      </span>
                    )}
                    {ms.status === 'complete' && (
                      <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                        Done
                      </span>
                    )}
                  </div>

                  {/* Requirement badges */}
                  {ms.requirementKeys.length > 0 && ms.status !== 'complete' && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {ms.requirementKeys.map(key => (
                        <span key={key} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {key}
                        </span>
                      ))}
                    </div>
                  )}
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
