'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Plane,
  BookOpen,
  ShieldCheck,
  Clock,
  Menu,
  X,
  MapPin,
  Check,
  Download,
  Monitor,
  Cloud,
  Map,
  Fuel,
  Scale,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Mail,
  Loader2,
} from 'lucide-react'

const desktopFeatures = [
  {
    icon: BookOpen,
    title: 'Pilot Logbook',
    description: 'Log flights with full time breakdowns — PIC, SIC, night, instrument, cross-country. Search and filter your entire history.',
    color: 'bg-blue-500/10 text-blue-500',
  },
  {
    icon: Map,
    title: 'Interactive Map',
    description: 'Explore 20,000+ airports with fuel prices, frequencies, and runway info. Plan routes visually.',
    color: 'bg-emerald-500/10 text-emerald-500',
  },
  {
    icon: ShieldCheck,
    title: 'Currency Tracking',
    description: 'FAA currency rules computed from your logbook — night landings, IPC, BFR, medical. Always know your status.',
    color: 'bg-violet-500/10 text-violet-500',
  },
  {
    icon: Scale,
    title: 'Weight & Balance',
    description: 'Built-in W&B calculator with CG visualization. Pre-flight planning made simple.',
    color: 'bg-amber-500/10 text-amber-500',
  },
  {
    icon: Fuel,
    title: 'Fuel Planning',
    description: 'Compare fuel prices, calculate range, and find the cheapest stops along your route.',
    color: 'bg-rose-500/10 text-rose-500',
  },
  {
    icon: Clock,
    title: 'Route Weather',
    description: 'METAR, TAF, and wind aloft data for your entire route. See fuel impact from headwinds.',
    color: 'bg-cyan-500/10 text-cyan-500',
  },
]

const GITHUB_RELEASE_URL = 'https://github.com/yourusername/aviationhub/releases/latest'

export default function V1LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showSmartScreen, setShowSmartScreen] = useState(false)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [emailError, setEmailError] = useState('')

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) {
      setEmailError('Please enter a valid email')
      return
    }
    setSubmitting(true)
    setEmailError('')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (res.ok) {
        setSubmitted(true)
      } else {
        const data = await res.json().catch(() => ({}))
        setEmailError(data.error || 'Something went wrong')
      }
    } catch {
      setEmailError('Network error — try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Plane className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
            <span className="text-base font-bold tracking-tight">AviationHub</span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#screenshots" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Screenshots
            </Link>
            <Link href="#waitlist" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Web Version
            </Link>
            <a
              href={GITHUB_RELEASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-border bg-background px-4 py-4 md:hidden">
            <div className="flex flex-col gap-3">
              <Link href="#features" onClick={() => setMobileMenuOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">
                Features
              </Link>
              <Link href="#screenshots" onClick={() => setMobileMenuOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">
                Screenshots
              </Link>
              <Link href="#waitlist" onClick={() => setMobileMenuOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">
                Web Version
              </Link>
              <a
                href={GITHUB_RELEASE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground"
              >
                Download for Windows
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative pt-14">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0">
            <img
              src="https://images.unsplash.com/photo-1436491865332-7a61a109db05?w=1920&q=80"
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-background/80 via-background/90 to-background" />
          </div>

          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28 lg:py-32">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                <Monitor className="h-3.5 w-3.5" />
                Desktop App for Windows
              </div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Your flights.
                <br />
                <span className="text-primary">Your data.</span>
              </h1>
              <p className="mt-6 text-lg text-muted-foreground max-w-xl">
                A modern pilot logbook and flight planner. Track flights, plan routes, check weather, manage currency — all offline on your desktop.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href={GITHUB_RELEASE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3.5 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                >
                  <Download className="h-5 w-5" />
                  Download for Windows
                </a>
                <Link
                  href="#waitlist"
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/50 px-6 py-3.5 text-base font-medium hover:bg-card transition-colors backdrop-blur-sm"
                >
                  <Cloud className="h-5 w-5" />
                  Web Version (Soon)
                </Link>
              </div>

              <div className="mt-6">
                <button
                  onClick={() => setShowSmartScreen(!showSmartScreen)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  Windows shows a warning?
                  {showSmartScreen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {showSmartScreen && (
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 max-w-md animate-in fade-in slide-in-from-top-2">
                    <p className="text-sm text-foreground font-medium mb-2">How to bypass SmartScreen:</p>
                    <ol className="text-xs text-muted-foreground space-y-1.5">
                      <li>1. Click <span className="font-medium text-foreground">&quot;More info&quot;</span> on the warning</li>
                      <li>2. Click <span className="font-medium text-foreground">&quot;Run anyway&quot;</span></li>
                    </ol>
                    <p className="text-xs text-muted-foreground mt-3">
                      This warning appears because we haven&apos;t purchased a code signing certificate yet ($100+/year). The app is safe — you can verify the source code on GitHub.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <StatBlock value="20,000+" label="Airports" />
            <StatBlock value="100%" label="Offline capable" />
            <StatBlock value="< 1 min" label="To log a flight" />
            <StatBlock value="Free" label="Core features" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold sm:text-3xl">Everything you need</h2>
          <p className="mt-2 text-muted-foreground">
            A complete toolkit for GA pilots.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {desktopFeatures.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-6 transition-colors hover:bg-muted/50">
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${f.color}`}>
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Screenshots */}
      <section id="screenshots" className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold sm:text-3xl">See it in action</h2>
            <p className="mt-2 text-muted-foreground">
              Screenshots of AviationHub Desktop.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <ScreenshotPlaceholder label="Dashboard" />
            <ScreenshotPlaceholder label="Flight Logbook" />
            <ScreenshotPlaceholder label="Interactive Map" />
            <ScreenshotPlaceholder label="Route Planner" />
            <ScreenshotPlaceholder label="Weather Tab" />
            <ScreenshotPlaceholder label="Weight & Balance" />
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Screenshots coming soon — download the app to try it yourself!
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold sm:text-3xl">Two ways to use it</h2>
            <p className="mt-2 text-muted-foreground">
              Local mode for privacy, cloud mode for sync.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 max-w-3xl mx-auto">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10">
                <Monitor className="h-6 w-6 text-violet-500" />
              </div>
              <h3 className="text-lg font-semibold">Local Mode</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Your data stays on your machine. No account required. Works completely offline. Protected with a PIN.
              </p>
              <ul className="mt-4 space-y-2">
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  No internet required
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Your data never leaves your PC
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Encrypted backup/restore
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10">
                <Cloud className="h-6 w-6 text-sky-500" />
              </div>
              <h3 className="text-lg font-semibold">Cloud Mode</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in to sync across devices. Access your logbook from the desktop app and (soon) the web.
              </p>
              <ul className="mt-4 space-y-2">
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Sync across devices
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Automatic backups
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Web access (coming soon)
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Web Waitlist */}
      <section id="waitlist" className="border-t border-border bg-primary/5">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="max-w-xl mx-auto text-center">
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Cloud className="h-3.5 w-3.5" />
              Coming Soon
            </div>
            <h2 className="text-2xl font-bold sm:text-3xl">Web version in the works</h2>
            <p className="mt-3 text-muted-foreground">
              Access your logbook from any browser. Sign up to be notified when it launches.
            </p>

            {submitted ? (
              <div className="mt-8 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-6">
                <Check className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-sm font-medium text-foreground">                You&apos;re on the list!</p>
                <p className="text-xs text-muted-foreground mt-1">We&apos;ll email you when the web version is ready.</p>
              </div>
            ) : (
              <form onSubmit={handleWaitlist} className="mt-8 flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <div className="flex-1">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                  />
                  {emailError && <p className="mt-1 text-xs text-destructive text-left">{emailError}</p>}
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Join Waitlist
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Ready to fly?</h2>
          <p className="mt-2 text-muted-foreground">Download AviationHub and start logging today.</p>
          <div className="mt-8">
            <a
              href={GITHUB_RELEASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-4 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
            >
              <Download className="h-5 w-5" />
              Download for Windows
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10">
                <Plane className="h-3 w-3 text-primary" />
              </div>
              <span className="text-sm font-semibold">AviationHub</span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/yourusername/aviationhub"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                GitHub
              </a>
              <Link href="/v1/privacy" className="text-xs text-muted-foreground hover:text-foreground">
                Privacy
              </Link>
              <Link href="/v1/login" className="text-xs text-muted-foreground hover:text-foreground">
                Sign In (Web)
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} AviationHub. Built for pilots.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function ScreenshotPlaceholder({ label }: { label: string }) {
  return (
    <div className="aspect-video rounded-xl border border-dashed border-border bg-card/50 flex items-center justify-center">
      <div className="text-center">
        <MapPin className="mx-auto h-8 w-8 text-muted-foreground/30" />
        <p className="mt-2 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
