'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { GraduationCap, Loader2, AlertTriangle, Plane, Target } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { getLocalTotals, type LocalTotals } from '@/desktop/lib/local-logbook'
import {
  cloudApi,
  type TrainingRelationship,
  type EndorsementRequestRow,
  type EndorsementTemplate,
} from '@/apps/desktop/src/lib/cloud-api'
import { ErrorCard } from '@/desktop/components/error-card'
import {
  CERTIFICATES,
  computeCertProgress,
  type CertType,
  type CertProgress,
  type LogbookEntry,
} from '@/desktop/data/training-data'
import CertificateCards from '@/desktop/components/training/certificate-cards'
import RequirementsGrid from '@/desktop/components/training/requirements-grid'
import TrainingRoadmap from '@/desktop/components/training/training-roadmap'
import RecentTrainingFlights from '@/desktop/components/training/recent-training'
import CheckrideMeter from '@/desktop/components/training/checkride-meter'
import CostTracker from '@/desktop/components/training/cost-tracker'
import MyStudentsPanel from '@/desktop/components/training/my-students-panel'
import MyInstructorsPanel from '@/desktop/components/training/my-instructors-panel'

// ── Local DB helper (same pattern as Reports page) ──────────────

let _localDbPromise: Promise<any> | null = null

async function getLocalDb(): Promise<any> {
  if (typeof window === 'undefined') return null
  if (!_localDbPromise) {
    try {
      const Database = await import('@tauri-apps/plugin-sql').then((m) => m.default || m)
      _localDbPromise = Database.load('sqlite:aviationhub.db')
    } catch { _localDbPromise = null; return null }
  }
  try { return await _localDbPromise } catch { _localDbPromise = null; return null }
}

async function queryLocalFullLogbook(userId: string): Promise<LogbookEntry[]> {
  const db = await getLocalDb()
  if (!db) return []
  try {
    return await db.select(
      `SELECT id, date, aircraft,
              route_from as routeFrom, route_to as routeTo,
              total_time as totalTime, pic_time as picTime, sic_time as sicTime,
              night_time as nightTime, instrument_time as instrumentTime,
              cross_country_time as crossCountryTime,
              landings_day as landingsDay, landings_night as landingsNight,
              solo_time as soloTime, dual_given as dualGiven, dual_received as dualReceived, remarks
       FROM logbook_entries WHERE user_id = $1 AND voided = 0
       ORDER BY date DESC`, [userId])
  } catch { return [] }
}

// ── Cloud helper (same pattern as Reports page) ─────────────────

function mapCloudToLogbookEntry(f: any): LogbookEntry {
  return {
    id: f.id || '', date: f.date || '', aircraft: f.aircraft || '',
    routeFrom: f.routeFrom || f.route_from || '', routeTo: f.routeTo || f.route_to || '',
    totalTime: f.totalTime || f.total_time || 0,
    picTime: f.picTime || f.pic_time || 0,
    sicTime: f.sicTime || f.sic_time || 0,
    nightTime: f.nightTime || f.night_time || 0,
    instrumentTime: f.instrumentTime || f.instrument_time || 0,
    crossCountryTime: f.crossCountryTime || f.cross_country_time || 0,
    landingsDay: f.dayLandings || f.landings_day || 0,
    landingsNight: f.nightLandings || f.night_landings || 0,
    soloTime: f.soloTime || f.solo_time || 0,
    dualGiven: f.dualGiven || f.dual_given || 0,
    dualReceived: f.dualReceived || f.dual_received || 0,
    remarks: f.remarks || '',
  }
}

// ── Page Component ──────────────────────────────────────────────

export default function DesktopTrainingPage() {
  const { mode, localUser, status, cloudUser } = useDesktopAuth()
  const [totals, setTotals] = useState<LocalTotals | null>(null)
  const [fullLogbook, setFullLogbook] = useState<LogbookEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeCert, setActiveCert] = useState<CertType>('PPL')

  // Instructor sign-off features (relationships, endorsement requests/templates)
  // are session-cookie-gated — only available in cloud mode, not a local
  // (offline PIN kiosk) profile, which has no server session.
  const cloudReady = mode === 'cloud' && status === 'authenticated' && !!cloudUser?.id
  const [relationships, setRelationships] = useState<TrainingRelationship[]>([])
  const [endorsementRequests, setEndorsementRequests] = useState<EndorsementRequestRow[]>([])
  const [templates, setTemplates] = useState<EndorsementTemplate[]>([])
  const [socialLoading, setSocialLoading] = useState(true)
  const [socialError, setSocialError] = useState<string | null>(null)

  const loadSocial = useCallback(async () => {
    if (!cloudReady) {
      setSocialLoading(false)
      return
    }
    setSocialLoading(true)
    setSocialError(null)
    try {
      const [relRes, reqRes, tplRes] = await Promise.all([
        cloudApi.listTrainingRelationships(),
        cloudApi.listEndorsementRequests(),
        cloudApi.getEndorsementTemplates(),
      ])
      setRelationships(relRes.relationships)
      setEndorsementRequests(reqRes.requests)
      setTemplates(tplRes.templates)
    } catch (err) {
      setSocialError(err instanceof Error ? err.message : 'Failed to load training network')
    } finally {
      setSocialLoading(false)
    }
  }, [cloudReady])

  useEffect(() => { loadSocial() }, [loadSocial])

  // ── Initial data load ──

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      if (mode === 'local') {
        if (!localUser) return
        const uid = localUser.id
        const [t, entries] = await Promise.all([
          getLocalTotals(uid),
          queryLocalFullLogbook(uid),
        ])
        setTotals(t)
        setFullLogbook(entries)
        return
      }
      if (status === 'authenticated') {
        const [t, cloudFlights] = await Promise.all([
          cloudApi.getTotals(),
          cloudApi.getLogbook(9999),
        ])
        setTotals((t.totals as unknown as LocalTotals) || null)
        if (Array.isArray(cloudFlights)) {
          setFullLogbook(cloudFlights.map(mapCloudToLogbookEntry))
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load training data')
    } finally { setLoading(false) }
  }, [mode, localUser, status])

  useEffect(() => { load() }, [load])

  // ── Compute progress for all certificates ──

  const progressMap = useMemo(() => {
    if (!totals) return {} as Record<string, CertProgress>
    const map: Record<string, CertProgress> = {}
    for (const cert of CERTIFICATES) {
      map[cert.id] = computeCertProgress(cert.id, totals, fullLogbook)
    }
    return map
  }, [totals, fullLogbook])

  const activeProgress = activeCert ? progressMap[activeCert] : null

  // ── Loading / Error / Empty ──

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <ErrorCard message={loadError} onRetry={load} />
      </div>
    )
  }

  const hasData = totals && totals.totalFlights > 0

  // ── Render ──

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* ── Header ── */}
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Training Dashboard</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          FAR requirements progress, checkride readiness, and cost tracking — auto-computed from your logbook.
        </p>
      </div>

      {/* ── Certificate Selector ── */}
      <section className="mb-6">
        <CertificateCards
          progressMap={progressMap}
          activeCert={activeCert}
          onSelect={setActiveCert}
        />
      </section>

      {!hasData ? (
        /* ── Empty state ── */
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <Plane className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">No flight data yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add flights to your logbook to see training progress auto-compute against FAR Part 61 requirements.
          </p>
        </div>
      ) : (
        <>
          {/* ── Main grid: Requirements + Roadmap ── */}
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <RequirementsGrid
              cert={activeProgress!.cert}
              requirements={activeProgress!.requirements}
              overallPercent={activeProgress!.overallPercent}
              metCount={activeProgress!.metCount}
              totalCount={activeProgress!.totalCount}
            />
            <TrainingRoadmap
              cert={activeProgress!.cert}
              milestones={activeProgress!.milestones}
            />
          </div>

          {/* ── Checkride Readiness + Cost Tracker ── */}
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <CheckrideMeter
              certId={activeCert}
              requirements={activeProgress!.requirements}
            />
            <CostTracker
              hoursRemaining={activeProgress!.hoursRemaining}
            />
          </div>

          {/* ── Recent Flights ── */}
          <section>
            <RecentTrainingFlights entries={fullLogbook} />
          </section>
        </>
      )}

      {/* ── Instructor sign-off: relationships + endorsements ── */}
      {cloudReady && (
        <div className="mt-6 space-y-6">
          <div className="mb-1">
            <h2 className="text-lg font-semibold">Instruction</h2>
            <p className="text-sm text-muted-foreground">
              Manage students and instructors, and sign or request endorsements.
            </p>
          </div>
          <MyStudentsPanel
            myUserId={cloudUser!.id!}
            relationships={relationships}
            endorsementRequests={endorsementRequests}
            templates={templates}
            loading={socialLoading}
            error={socialError}
            onRefresh={loadSocial}
          />
          <MyInstructorsPanel
            relationships={relationships}
            templates={templates}
            loading={socialLoading}
            error={socialError}
            onRefresh={loadSocial}
          />
        </div>
      )}
    </div>
  )
}
