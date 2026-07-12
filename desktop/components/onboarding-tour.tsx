'use client'

import { useState, useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  List,
  Plus,
  BarChart3,
  ShieldCheck,
  Plane,
  Globe,
  CloudSun,
  CalendarDays,
  User,
  Settings,
  X,
  ChevronLeft,
  ChevronRight,
  Hand,
  Compass,
} from 'lucide-react'

// ── Tutorial Steps (with page hrefs) ──
export interface TutorialStep {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  /**
   * 'observe' (default): auto-navigates, user reads and clicks Next.
   * 'navigate': user must click the highlighted sidebar item to advance.
   */
  mode?: 'observe' | 'navigate'
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    href: '/desktop/dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
    description:
      'Your aviation command center. View flight statistics, FTL gauges, weather at your home airport, recent flights, charts, and quick-access tools — all on one customizable page.',
  },
  {
    href: '/desktop/logbook',
    icon: List,
    label: 'Flights',
    description:
      'Browse your complete logbook. Search, filter by date or aircraft, sort columns, and review every flight you have recorded. Your flying history at your fingertips.',
  },
  {
    href: '/desktop/logbook/new',
    icon: Plus,
    label: 'Add Flight',
    description:
      'Click "Add Flight" in the sidebar, under the Flights section — then log your first trip. Duration auto-calculates and defaults are pulled from your fleet.',
    mode: 'navigate',
  },
  {
    href: '/desktop/logbook/totals',
    icon: BarChart3,
    label: 'Totals',
    description:
      'Yearly, monthly, and all-time flight time breakdowns. Track hours by category — PIC, SIC, dual, instrument, cross-country, and night — with progress bars.',
  },
  {
    href: '/desktop/logbook/currency',
    icon: ShieldCheck,
    label: 'Currency',
    description:
      'Stay current at a glance. Monitor 90-day, 6-month, and 12-month rolling currency requirements for day/VFR, night, instrument, and other regulatory currencies.',
  },
  {
    href: '/desktop/aircraft',
    icon: Plane,
    label: 'Aircraft',
    description:
      'Click "Aircraft" in the Manage section of the sidebar to view your fleet. Edit weight & balance, auto-fill from the reference database, and track maintenance documents.',
    mode: 'navigate',
  },
  {
    href: '/desktop/map',
    icon: Globe,
    label: 'Map',
    description:
      'Click "Map" in the Fly section of the sidebar. Plan routes with waypoints, check METAR weather, view fuel prices, and export to GPX, FPL, or JSON.',
    mode: 'navigate',
  },
  {
    href: '/desktop/weather',
    icon: CloudSun,
    label: 'Weather',
    description:
      'Full aviation weather briefings. Enter any ICAO code to get METAR conditions, TAF forecasts, winds aloft, radar imagery, and hazards from NOAA/NWS.',
  },
  {
    href: '/desktop/calendar',
    icon: CalendarDays,
    label: 'Calendar',
    description:
      'View your flight history on a calendar. Spot flying patterns, identify gaps in your logbook, and click any date to see the flights logged that day.',
  },
  {
    href: '/desktop/profile',
    icon: User,
    label: 'Profile',
    description:
      'Click "Profile" in the Manage section of the sidebar. Manage certifications, upload documents, view logbook stats, and backup or restore your data.',
    mode: 'navigate',
  },
  {
    href: '/desktop/settings',
    icon: Settings,
    label: 'Settings',
    description:
      'Customize your experience. Switch themes, choose units and time formats, control notifications, manage privacy and analytics, export data, and check for updates.',
  },
]

const STORAGE_KEY = 'desktop.tutorial.completed'

// ── Persistence helpers ──
export function isTutorialCompleted(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return true
  }
}

export function markTutorialCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // ignore
  }
}

export function resetTutorial(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** Get the highlighted href for the current tutorial step (used by DesktopShell → sidebar) */
export function getHighlightedHref(stepIndex: number | null): string | undefined {
  if (stepIndex === null || stepIndex < 0 || stepIndex >= TUTORIAL_STEPS.length) return undefined
  return TUTORIAL_STEPS[stepIndex].href
}

// ── Props ──
interface OnboardingTourProps {
  onComplete: () => void
  onStepChange?: (stepIndex: number | null) => void
  navigate?: (href: string) => void
}

// ── Component ──
export function OnboardingTour({ onComplete, onStepChange, navigate }: OnboardingTourProps) {
  const [phase, setPhase] = useState<'welcome' | 'touring'>('welcome')
  const [step, setStep] = useState(0)
  const pathname = usePathname()

  const totalSteps = TUTORIAL_STEPS.length

  /** Advance to the next step. For 'observe' steps, auto-navigate. */
  const advance = useCallback(() => {
    if (step >= totalSteps - 1) {
      finish()
      return
    }
    const next = step + 1
    setStep(next)
    onStepChange?.(next)

    // Auto-navigate only for 'observe' steps
    const nextStep = TUTORIAL_STEPS[next]
    if (nextStep.mode !== 'navigate') {
      navigate?.(nextStep.href)
    }
  }, [step, onStepChange, navigate])

  const goBack = useCallback(() => {
    if (step > 0) {
      const prev = step - 1
      setStep(prev)
      onStepChange?.(prev)
      // Always navigate on back
      navigate?.(TUTORIAL_STEPS[prev].href)
    }
  }, [step, onStepChange, navigate])

  const finish = useCallback(() => {
    markTutorialCompleted()
    onStepChange?.(null)
    onComplete()
  }, [onComplete, onStepChange])

  const skip = useCallback(() => {
    markTutorialCompleted()
    onStepChange?.(null)
    onComplete()
  }, [onComplete, onStepChange])

  const startTour = useCallback(() => {
    setPhase('touring')
    setStep(0)
    onStepChange?.(0)

    // Dashboard is 'observe' so auto-navigate
    navigate?.(TUTORIAL_STEPS[0].href)
  }, [onStepChange, navigate])

  // ── Pathname watcher for 'navigate' steps ──
  // When the user clicks the highlighted sidebar item, the pathname changes.
  // We detect that and auto-advance to the next step.
  useEffect(() => {
    if (phase !== 'touring') return
    const current = TUTORIAL_STEPS[step]
    if (current.mode === 'navigate' && pathname === current.href) {
      advance()
    }
  }, [pathname, step, advance, phase])

  // ── Welcome Dialog ──
  if (phase === 'welcome') {
    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
          <div className="border-b border-border p-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Compass className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">Welcome to AviationHub</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your all-in-one aviation companion for flight logging, planning, aircraft management, and more.
              Take a quick tour to see what you can do.
            </p>
          </div>
          <div className="flex gap-2 p-4">
            <button
              onClick={skip}
              className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              Skip
            </button>
            <button
              onClick={startTour}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Take a Tour
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Tour Step ──
  const current = TUTORIAL_STEPS[step]
  const StepIcon = current.icon
  const isNavigateStep = current.mode === 'navigate'
  const navigateDone = isNavigateStep && pathname === current.href

  return (
    <>
      {/* Subtle backdrop */}
      <div className="fixed inset-0 z-[9999] bg-black/10" />

      {/* Floating card — bottom-center */}
      <div className="fixed bottom-6 left-1/2 z-[10000] w-full max-w-lg -translate-x-1/2 px-4">
        <div className="rounded-xl border border-border bg-card shadow-2xl">
          {/* Header row: icon + label + close */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <StepIcon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <span className="text-sm font-semibold">{current.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {step + 1} of {totalSteps}
                </span>
              </div>
            </div>
            <button
              onClick={skip}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Skip tutorial"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Description / Instruction */}
          <div className="px-4 py-3">
            {isNavigateStep && !navigateDone ? (
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 animate-pulse">
                  <Hand className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Try it now</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {current.description}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground/70">
                    The item is highlighted in the sidebar. Click it to navigate.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">{current.description}</p>
            )}
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1 px-4 pb-2">
            {TUTORIAL_STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === step
                    ? 'w-5 bg-primary'
                    : i < step
                      ? 'w-1.5 bg-primary/40'
                      : 'w-1.5 bg-muted-foreground/20'
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <button
              onClick={skip}
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip tour
            </button>
            <div className="flex gap-2">
              {step > 0 && (
                <button
                  onClick={goBack}
                  className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Back
                </button>
              )}
              {isNavigateStep && !navigateDone ? (
                <span className="flex items-center gap-1 rounded-md bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground/50 cursor-not-allowed">
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </span>
              ) : (
                <button
                  onClick={advance}
                  className="flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  {step < totalSteps - 1 ? (
                    <>Next <ChevronRight className="h-3.5 w-3.5" /></>
                  ) : (
                    'Done'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
