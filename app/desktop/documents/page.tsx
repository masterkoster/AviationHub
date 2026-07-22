'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileText, ClipboardList, GraduationCap, Loader2, Download } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { getLocalTotals, type LocalTotals } from '@/desktop/lib/local-logbook'
import { cloudApi, type EndorsementRecord } from '@/apps/desktop/src/lib/cloud-api'
import { ErrorCard } from '@/desktop/components/error-card'
import { notifyExported } from '@/desktop/lib/toast-helpers'
import { download8710, downloadTrainingFolder } from '@/desktop/lib/forms/pdf-forms'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function fmtH(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export default function DesktopDocumentsPage() {
  const { mode, localUser, cloudUser, status } = useDesktopAuth()
  const [totals, setTotals] = useState<LocalTotals | null>(null)
  const [endorsements, setEndorsements] = useState<EndorsementRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const pilotName = mode === 'local' ? localUser?.name || '' : cloudUser?.name || ''

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      if (mode === 'local') {
        if (!localUser) return
        const t = await getLocalTotals(localUser.id)
        setTotals(t)
      } else if (status === 'authenticated') {
        const t = await cloudApi.getTotals()
        setTotals((t.totals as unknown as LocalTotals) || null)
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load your logbook totals')
    } finally {
      setLoading(false)
    }

    // Endorsements are only available in cloud mode (they're server-signed
    // records) — a failure here should never block the 8710 worksheet.
    if (status === 'authenticated') {
      try {
        const res = await cloudApi.listEndorsements()
        setEndorsements(res.endorsements || [])
      } catch {
        setEndorsements([])
      }
    }
  }, [mode, localUser, status])

  useEffect(() => {
    load()
  }, [load])

  function handleDownload8710() {
    if (!totals) return
    download8710({ pilotName, dateISO: new Date().toISOString(), totals })
    notifyExported('Aeronautical Experience Summary')
  }

  function handleDownloadTrainingFolder() {
    if (!totals) return
    downloadTrainingFolder({ pilotName, dateISO: new Date().toISOString(), totals, endorsements })
    notifyExported('Training Record')
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <ErrorCard message={loadError} onRetry={load} />
      </div>
    )
  }

  const hasData = !!totals && totals.totalFlights > 0
  const studentEndorsementCount = endorsements.filter((e) => e.myRole === 'student').length

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Documents</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Generate worksheets from your logbook and training records — worksheets, not official FAA forms.
        </p>
      </div>

      {!hasData ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No flight data yet — add some flights to generate worksheets.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-border bg-card">
            <CardHeader>
              <div className="mb-1 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Aeronautical experience summary</CardTitle>
              </div>
              <CardDescription>
                A worksheet listing your total, PIC, night, instrument, and cross-country time plus landings — organized
                to help you fill out your official FAA application.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Total time</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{fmtH(totals!.totalTime)}</p>
            </CardContent>
            <CardFooter>
              <Button onClick={handleDownload8710} className="w-full">
                <Download className="h-4 w-4" /> Generate PDF worksheet
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <div className="mb-1 flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Training record</CardTitle>
              </div>
              <CardDescription>
                Endorsements and hours worksheet for your training folder — combines your signed endorsements with a
                summary of your logged hours.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Endorsements on file</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{studentEndorsementCount}</p>
            </CardContent>
            <CardFooter>
              <Button onClick={handleDownloadTrainingFolder} className="w-full">
                <Download className="h-4 w-4" /> Generate PDF worksheet
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-dashed border-border bg-card opacity-60">
            <CardHeader>
              <CardTitle className="text-base">Currency report</CardTitle>
              <CardDescription>Worksheet of your currency status across ratings and endorsements.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button disabled className="w-full" variant="outline">
                Coming soon
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-dashed border-border bg-card opacity-60">
            <CardHeader>
              <CardTitle className="text-base">Weight &amp; balance</CardTitle>
              <CardDescription>Worksheet for a saved aircraft&apos;s weight and balance calculation.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button disabled className="w-full" variant="outline">
                Coming soon
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  )
}
