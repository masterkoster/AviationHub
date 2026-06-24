'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react'

type CurrencyRule = {
  code: string
  name: string
  authority: string
  status: string
  daysRemaining?: number | null
  completed?: number
  required?: number
  unit?: string
  nextDue?: string | null
  requirement?: string
  progress?: { completed: number; required: number; unit: string }[]
}

export default function CurrencyPage() {
  const router = useRouter()
  const { status } = useSession()
  const [rules, setRules] = useState<CurrencyRule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/v1/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/v1/currency')
      .then(r => r.ok ? r.json() : null)
      .then(data => setRules(data?.rules || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [status])

  if (status === 'loading' || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const grouped = rules.reduce((acc, rule) => {
    if (!acc[rule.authority]) acc[rule.authority] = []
    acc[rule.authority].push(rule)
    return acc
  }, {} as Record<string, CurrencyRule[]>)

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Currency Status
          </h1>
          <p className="text-sm text-muted-foreground">Your FAA/EASA currency requirements</p>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No currency data. Log some flights and set your medical/BFR dates in your profile.
          </p>
        </div>
      ) : (
        Object.entries(grouped).map(([authority, items]) => (
          <div key={authority} className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">{authority} Currency</h2>
            <div className="space-y-3">
              {items.map(rule => (
                <div key={rule.code} className="rounded-md bg-muted/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium">{rule.name}</p>
                      {rule.requirement && (
                        <p className="text-xs text-muted-foreground">{rule.requirement}</p>
                      )}
                    </div>
                    <StatusBadge status={rule.status} />
                  </div>

                  {/* Progress bar for numeric rules */}
                  {rule.progress && rule.progress.length > 0 && rule.progress.map((p, i) => (
                    <div key={i} className="mt-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>{p.completed} / {p.required} {p.unit}</span>
                        <span>{Math.min(100, Math.round((p.completed / p.required) * 100))}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-border overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.min(100, (p.completed / p.required) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}

                  {/* Days remaining for expiry rules */}
                  {rule.daysRemaining !== null && rule.daysRemaining !== undefined && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {rule.nextDue && `Due ${new Date(rule.nextDue).toLocaleDateString()} · `}
                      {rule.daysRemaining > 0
                        ? `${rule.daysRemaining} days remaining`
                        : 'Expired'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    current: 'bg-emerald-500/10 text-emerald-500',
    expiring: 'bg-amber-500/10 text-amber-500',
    expired: 'bg-destructive/10 text-destructive',
    unknown: 'bg-muted text-muted-foreground',
  }
  const labels: Record<string, string> = {
    current: 'Current',
    expiring: 'Expiring Soon',
    expired: 'Expired',
    unknown: 'Unknown',
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status] || styles.unknown}`}>
      {labels[status] || status}
    </span>
  )
}
