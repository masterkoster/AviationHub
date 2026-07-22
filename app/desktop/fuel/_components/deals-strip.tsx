'use client'

import { useEffect, useState } from 'react'
import { Tag, ExternalLink } from 'lucide-react'
import { cloudApi, type FuelDeal } from '@/apps/desktop/src/lib/cloud-api'
import { Badge } from '@/components/ui/badge'

function typeLabel(t: string): string {
  if (t === 'AVGAS') return 'Avgas'
  if (t === 'CAR_GAS') return 'Car gas'
  return 'Deal'
}

function fmtEnds(iso: string | null): string | null {
  if (!iso) return null
  try {
    return `ends ${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  } catch {
    return null
  }
}

/** Fuel / gas deals strip. Renders nothing when there are no active deals. */
export function DealsStrip({ icao }: { icao?: string }) {
  const [deals, setDeals] = useState<FuelDeal[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    cloudApi
      .getFuelDeals(icao ? { icao } : {})
      .then((res) => {
        if (alive) setDeals(Array.isArray(res?.deals) ? res.deals : [])
      })
      .catch(() => {
        /* deals are non-critical — never block the page */
      })
      .finally(() => {
        if (alive) setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [icao])

  if (!loaded || deals.length === 0) return null

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Fuel deals</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {deals.map((d) => {
          const ends = fmtEnds(d.endsAt)
          const inner = (
            <>
              <div className="mb-1 flex items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px]">{typeLabel(d.dealType)}</Badge>
                {d.isSample && <Badge variant="outline" className="text-[10px]">Sample</Badge>}
                {d.url && <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />}
              </div>
              <p className="text-sm font-medium leading-tight">{d.title}</p>
              {d.discountText && <p className="mt-0.5 text-sm text-primary">{d.discountText}</p>}
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                {d.brand && <span>{d.brand}</span>}
                {d.icao && <span className="font-mono">{d.icao}</span>}
                {ends && <span>{ends}</span>}
              </div>
            </>
          )
          const cls =
            'min-w-[220px] max-w-[280px] shrink-0 rounded-lg border border-border bg-card p-3'
          return d.url ? (
            <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className={`${cls} transition-colors hover:bg-muted/50`}>
              {inner}
            </a>
          ) : (
            <div key={d.id} className={cls}>
              {inner}
            </div>
          )
        })}
      </div>
    </section>
  )
}
