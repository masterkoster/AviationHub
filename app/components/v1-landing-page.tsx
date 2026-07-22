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
  Users,
  Wallet,
  FileOutput,
} from 'lucide-react'

const desktopFeatures = [
  {
    icon: Map,
    title: 'Flight Planner + Fuel Map',
    description: 'Free, no signup required. 20,000+ airports, route planning, and community-reported fuel prices with trends.',
    color: 'bg-emerald-500/10 text-emerald-500',
  },
  {
    icon: BookOpen,
    title: 'Pilot Logbook',
    description: 'Log flights with full time breakdowns — PIC, SIC, night, instrument, cross-country. Search and filter your entire history.',
    color: 'bg-blue-500/10 text-blue-500',
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
    icon: Clock,
    title: 'Route Weather',
    description: 'METAR, TAF, and wind aloft data for your entire route. See fuel impact from headwinds.',
    color: 'bg-cyan-500/10 text-cyan-500',
  },
  {
    icon: Users,
    title: 'Flying Clubs',
    description: 'Schedule aircraft, share costs, and manage billing with your club — built for co-ownership.',
    color: 'bg-fuchsia-500/10 text-fuchsia-500',
  },
  {
    icon: Wallet,
    title: 'Aircraft Cost Tracking',
    description: 'Per-flight and hourly cost of ownership, tracked automatically from your logbook.',
    color: 'bg-orange-500/10 text-orange-500',
  },
  {
    icon: FileOutput,
    title: 'ForeFlight / Garmin Export',
    description: 'Take your logbook with you. Export in formats ForeFlight and Garmin Pilot understand.',
    color: 'bg-rose-500/10 text-rose-500',
  },
]

const GITHUB_RELEASE_URL = 'https://github.com/masterkoster/next-dashboard/releases/latest'

export default function V1LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showSmartScreen, setShowSmartScreen] = useState(false)

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
            <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link
              href="/fuel-saver"
              className="text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              Open web app
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
              <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">
                Pricing
              </Link>
              <Link
                href="/fuel-saver"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md border border-border px-4 py-2.5 text-center text-sm font-medium hover:bg-muted"
              >
                Open the web app
              </Link>
              <a
                href={GITHUB_RELEASE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground"
              >
                Download for desktop
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative pt-14">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10">
            <div
              className="h-full w-full"
              style={{
                background:
                  'radial-gradient(60% 50% at 15% 10%, color-mix(in srgb, var(--primary) 22%, transparent), transparent), ' +
                  'radial-gradient(50% 40% at 85% 20%, color-mix(in srgb, var(--primary) 14%, transparent), transparent), ' +
                  'radial-gradient(70% 60% at 50% 100%, color-mix(in srgb, var(--primary) 10%, transparent), transparent)',
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
          </div>

          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28 lg:py-32">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                <Cloud className="h-3.5 w-3.5" />
                Web app + Desktop app
              </div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                One logbook,
                <br />
                <span className="text-primary">everywhere.</span>
              </h1>
              <p className="mt-6 text-lg text-muted-foreground max-w-xl">
                One product, two surfaces. Use AviationHub in your browser or install it on your desktop — track flights, plan routes, check weather, and manage currency either way.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href="/fuel-saver"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3.5 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                >
                  <Cloud className="h-5 w-5" />
                  Open the web app
                </Link>
                <a
                  href={GITHUB_RELEASE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/50 px-6 py-3.5 text-base font-medium hover:bg-card transition-colors backdrop-blur-sm"
                >
                  <Download className="h-5 w-5" />
                  Download for desktop
                </a>
              </div>

              <p className="mt-4 text-sm text-muted-foreground">
                Free to start — no signup needed for the planner.
              </p>

              <div className="mt-6">
                <button
                  onClick={() => setShowSmartScreen(!showSmartScreen)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  Windows shows a warning on the desktop download?
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
            <StatBlock value="Web + Desktop" label="Use it anywhere" />
            <StatBlock value="< 1 min" label="To log a flight" />
            <StatBlock value="Free" label="To start" />
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
              Real screenshots — the free planner runs in your browser.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <BrowserScreenshot src="/marketing/planner.png" url="aviationhub.app/fuel-saver" label="Flight Planner" />
            <BrowserScreenshot src="/marketing/fuel-map.png" url="aviationhub.app/fuel-saver" label="Fuel Map" />
            <BrowserScreenshot src="/marketing/logbook.png" url="aviationhub.app/logbook" label="Pilot Logbook" />
            <BrowserScreenshot src="/marketing/clubs.png" url="aviationhub.app/clubs" label="Flying Clubs" />
            <BrowserScreenshot src="/marketing/weather.png" url="aviationhub.app/weather" label="Route Weather" />
            <BrowserScreenshot src="/marketing/weight-balance.png" url="aviationhub.app/weight-balance" label="Weight & Balance" />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold sm:text-3xl">Two ways to use it</h2>
            <p className="mt-2 text-muted-foreground">
              Same product, same data — pick the surface that fits.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 max-w-3xl mx-auto">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10">
                <Cloud className="h-6 w-6 text-sky-500" />
              </div>
              <h3 className="text-lg font-semibold">Web App</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing to install. The flight planner and fuel map are free to use with no signup at all.
              </p>
              <ul className="mt-4 space-y-2">
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Works in any modern browser
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  No signup for the planner
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Sign in to sync your logbook
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10">
                <Monitor className="h-6 w-6 text-violet-500" />
              </div>
              <h3 className="text-lg font-semibold">Desktop App</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Your data stays on your machine. Works completely offline, protected with a PIN.
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
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold sm:text-3xl">Simple pricing</h2>
            <p className="mt-2 text-muted-foreground">
              Free forever, or go Pro for $3.99/mo ($39.99/yr).
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 max-w-2xl mx-auto">
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-lg font-semibold">Free</h3>
              <p className="mt-1 text-sm text-muted-foreground">Everything you need to get started.</p>
              <ul className="mt-4 space-y-2">
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Up to 6 waypoints per route
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  5 saved flight plans
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  1 flying club, 3 aircraft
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Home-state fuel prices
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-primary/40 bg-card p-6 relative">
              <div className="absolute -top-3 right-6 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                Pro
              </div>
              <h3 className="text-lg font-semibold">Pro</h3>
              <p className="mt-1 text-sm text-muted-foreground">$3.99/mo or $39.99/yr</p>
              <ul className="mt-4 space-y-2">
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Unlimited waypoints & plans
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Unlimited clubs & aircraft
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Fuel prices in all 50 states
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground/80">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Document storage + ForeFlight/Garmin export
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Get started free
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 text-sm font-medium hover:bg-card transition-colors"
            >
              See full pricing
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Ready to fly?</h2>
          <p className="mt-2 text-muted-foreground">Open the web app or download for desktop — same logbook, either way.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/fuel-saver"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-4 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
            >
              <Cloud className="h-5 w-5" />
              Open the web app
            </Link>
            <a
              href={GITHUB_RELEASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-8 py-4 text-base font-medium hover:bg-muted transition-colors"
            >
              <Download className="h-5 w-5" />
              Download for desktop
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
                href="https://github.com/masterkoster/next-dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                GitHub
              </a>
              <Link href="/pricing" className="text-xs text-muted-foreground hover:text-foreground">
                Pricing
              </Link>
              <Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground">
                Privacy
              </Link>
              <Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground">
                Terms
              </Link>
              <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground">
                Sign In
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

function BrowserScreenshot({ src, url, label }: { src: string; url: string; label: string }) {
  const [broken, setBroken] = useState(false)

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="flex-1 truncate rounded-full bg-background px-3 py-1 text-center text-[11px] text-muted-foreground">
          {url}
        </div>
      </div>
      <div className="aspect-video relative">
        {!broken ? (
          <img
            src={src}
            alt={label}
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{
              background:
                'radial-gradient(80% 80% at 30% 20%, color-mix(in srgb, var(--primary) 16%, transparent), transparent), ' +
                'radial-gradient(80% 80% at 80% 90%, color-mix(in srgb, var(--primary) 10%, transparent), transparent)',
            }}
          >
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
          </div>
        )}
      </div>
    </div>
  )
}
