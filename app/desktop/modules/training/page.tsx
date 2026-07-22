'use client'

import { Suspense, useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  GraduationCap,
  Loader2,
  Plane,
  Users,
  Award,
  BookOpen,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
import EndorsementsTab from '@/desktop/components/training/endorsements-tab'

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

// ── Tabs ────────────────────────────────────────────────────────

type TabName = 'my-training' | 'instruction' | 'endorsements' | 'research'
const DEFAULT_TAB: TabName = 'my-training'

interface TabItem {
  name: TabName
  label: string
  icon: React.ReactNode
  cloudOnly?: boolean
}

const ALL_TABS: TabItem[] = [
  { name: 'my-training', label: 'My training', icon: <GraduationCap className="h-3.5 w-3.5" /> },
  { name: 'instruction', label: 'Instruction', icon: <Users className="h-3.5 w-3.5" />, cloudOnly: true },
  { name: 'endorsements', label: 'Endorsements', icon: <Award className="h-3.5 w-3.5" />, cloudOnly: true },
  { name: 'research', label: 'Research', icon: <BookOpen className="h-3.5 w-3.5" /> },
]

function isValidTab(name: string | null, available: TabName[]): name is TabName {
  return !!name && available.includes(name as TabName)
}

// ── Page Component ──────────────────────────────────────────────

export default function DesktopTrainingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <TrainingPageInner />
    </Suspense>
  )
}

function TrainingPageInner() {
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

  // Tabs available depend on whether cloud (social) features are usable.
  const tabs = useMemo(
    () => ALL_TABS.filter((t) => !t.cloudOnly || cloudReady),
    [cloudReady]
  )
  const availableNames = useMemo(() => tabs.map((t) => t.name), [tabs])

  const searchParams = useSearchParams()
  const queryTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<TabName>(
    isValidTab(queryTab, ALL_TABS.map((t) => t.name)) ? queryTab : DEFAULT_TAB
  )

  // If the active tab is no longer available (e.g. cloud features unavailable),
  // fall back to the default.
  useEffect(() => {
    if (!availableNames.includes(activeTab)) setActiveTab(DEFAULT_TAB)
  }, [availableNames, activeTab])

  function selectTab(name: TabName) {
    if (name === activeTab) return
    setActiveTab(name)
    if (typeof window !== 'undefined') {
      // Update the URL for deep-linking WITHOUT navigating - replaceState
      // (not router.push/Link) so switching tabs stays instant.
      window.history.replaceState(null, '', `?tab=${name}`)
    }
  }

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

  // ── Loading / Error ──

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
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Training</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          FAR requirements progress, instruction, endorsements, and study resources.
        </p>
      </div>

      {/* ── Tab bar (instant, ?tab-synced buttons — no navigation) ── */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tab) => {
          const active = activeTab === tab.name
          return (
            <button
              key={tab.name}
              type="button"
              onClick={() => selectTab(tab.name)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors -mb-px',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <span className={active ? 'text-primary' : 'text-muted-foreground'}>{tab.icon}</span>
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Active tab content (others unmounted) ── */}
      {activeTab === 'my-training' && (
        <MyTrainingTab
          hasData={!!hasData}
          progressMap={progressMap}
          activeCert={activeCert}
          onSelectCert={setActiveCert}
          activeProgress={activeProgress}
          fullLogbook={fullLogbook}
          cloudReady={cloudReady}
          relationships={relationships}
          templates={templates}
          socialLoading={socialLoading}
          socialError={socialError}
          onRefreshSocial={loadSocial}
        />
      )}

      {activeTab === 'instruction' && cloudReady && (
        <MyStudentsPanel
          myUserId={cloudUser!.id!}
          relationships={relationships}
          endorsementRequests={endorsementRequests}
          templates={templates}
          loading={socialLoading}
          error={socialError}
          onRefresh={loadSocial}
        />
      )}

      {activeTab === 'endorsements' && cloudReady && <EndorsementsTab />}

      {activeTab === 'research' && <ResearchTab />}
    </div>
  )
}

// ── My training tab (student home) ──────────────────────────────

function MyTrainingTab({
  hasData,
  progressMap,
  activeCert,
  onSelectCert,
  activeProgress,
  fullLogbook,
  cloudReady,
  relationships,
  templates,
  socialLoading,
  socialError,
  onRefreshSocial,
}: {
  hasData: boolean
  progressMap: Record<string, CertProgress>
  activeCert: CertType
  onSelectCert: (c: CertType) => void
  activeProgress: CertProgress | null
  fullLogbook: LogbookEntry[]
  cloudReady: boolean
  relationships: TrainingRelationship[]
  templates: EndorsementTemplate[]
  socialLoading: boolean
  socialError: string | null
  onRefreshSocial: () => void
}) {
  return (
    <div>
      {/* ── Certificate Selector ── */}
      <section className="mb-6">
        <CertificateCards
          progressMap={progressMap}
          activeCert={activeCert}
          onSelect={onSelectCert}
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
          <section className="mb-6">
            <RecentTrainingFlights entries={fullLogbook} />
          </section>
        </>
      )}

      {/* ── The student's instructors / request-a-CFI / request-endorsement ── */}
      {cloudReady && (
        <section>
          <MyInstructorsPanel
            relationships={relationships}
            templates={templates}
            loading={socialLoading}
            error={socialError}
            onRefresh={onRefreshSocial}
          />
        </section>
      )}
    </div>
  )
}

// ── Research tab (lightweight placeholder) ──────────────────────

const RESEARCH_LINKS: { label: string; href: string; note: string }[] = [
  {
    label: 'FAA Airman Certification Standards (ACS) & PTS',
    href: 'https://www.faa.gov/training_testing/testing/acs',
    note: 'Practical test standards for every certificate and rating.',
  },
  {
    label: 'Aeronautical Information Manual (AIM)',
    href: 'https://www.faa.gov/air_traffic/publications/atpubs/aim_html/',
    note: 'Official guide to flight information and ATC procedures.',
  },
  {
    label: '14 CFR Part 61 — Certification of Airmen',
    href: 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-D/part-61',
    note: 'Regulatory requirements for pilots and instructors.',
  },
]

function ResearchTab() {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Research</h3>
      </div>
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          Curated study resources are coming soon. In the meantime, here are the essential FAA references.
        </p>
        <ul className="space-y-2">
          {RESEARCH_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 transition-colors hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{link.label}</p>
                  <p className="text-xs text-muted-foreground">{link.note}</p>
                </div>
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
