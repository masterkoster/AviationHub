'use client'

import type { PilotCertStatus } from '@/desktop/lib/weather-types'
import { Check, X, AlertTriangle, Clock, User } from 'lucide-react'

interface Props {
  status: PilotCertStatus | null
  loading?: boolean
}

export function WeatherPilotStatus({ status, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 animate-spin" />
          Loading pilot status...
        </div>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          No pilot data found. Set up your profile and currency rules.
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <User className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">
          {status.licenseType}{status.hasInstrumentRating ? ' + Instrument' : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        {/* Medical */}
        <div className="flex items-center gap-1.5">
          {status.medicalExpired ? (
            <X className="h-3.5 w-3.5 shrink-0 text-red-500" />
          ) : status.medicalExpiry ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}
          <span className="text-muted-foreground">Medical</span>
          <span className="font-medium">
            {status.medicalClass ? `Class ${status.medicalClass}` : ''}
            {status.medicalExpiry ? ` · ${new Date(status.medicalExpiry).toLocaleDateString()}` : ''}
            {!status.medicalExpiry ? ' · Not set' : ''}
          </span>
        </div>

        {/* BFR */}
        <div className="flex items-center gap-1.5">
          {status.bfrCurrent ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0 text-red-500" />
          )}
          <span className="text-muted-foreground">BFR</span>
          <span className="font-medium">
            {status.bfrExpiry ? new Date(status.bfrExpiry).toLocaleDateString() : 'Not set'}
          </span>
        </div>

        {/* Night currency */}
        <div className="flex items-center gap-1.5">
          {status.nightCurrency.current ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}
          <span className="text-muted-foreground">Night</span>
          <span className="font-medium">
            {status.nightCurrency.completed}/{status.nightCurrency.required} landings
          </span>
        </div>

        {/* IFR currency */}
        <div className="flex items-center gap-1.5">
          {status.ifrCurrency.current ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
          ) : !status.hasInstrumentRating ? (
            <span className="h-3.5 w-3.5 shrink-0 text-muted-foreground text-center leading-none">—</span>
          ) : (
            <X className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}
          <span className="text-muted-foreground">IFR</span>
          <span className="font-medium">
            {status.hasInstrumentRating
              ? `${status.ifrCurrency.completed}/${status.ifrCurrency.required} appr`
              : 'No rating'}
          </span>
        </div>
      </div>
    </div>
  )
}
