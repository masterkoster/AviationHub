"use client"

import { useState } from "react"
import Image from "next/image"
import { ArrowRight, Fuel, Calculator, Users, GraduationCap, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuthModal } from "@/app/components/AuthModalContext"

const tools = [
  { icon: Fuel, label: "Fuel Prices", value: "fuel" },
  { icon: Calculator, label: "E6B Calc", value: "e6b" },
  { icon: Users, label: "Club Mgmt", value: "club" },
  { icon: GraduationCap, label: "Training", value: "training" },
]

const demoOutputs: Record<string, { title: string; lines: string[] }> = {
  fuel: {
    title: "KJFK - 100LL Prices",
    lines: ["Atlantic Aviation . . . $6.45/gal", "Sheltair . . . . . . . $6.89/gal", "Signature FBO . . . . $7.12/gal"],
  },
  e6b: {
    title: "Wind Correction",
    lines: ["True Course . . . . . 270\u00B0", "Wind . . . . . . . . 310\u00B0/18kt", "Heading . . . . . . . 262\u00B0", "Ground Speed . . . . 138kt"],
  },
  club: {
    title: "N732SP Schedule",
    lines: ["Today 09:00 . . . . . J. Wright", "Today 14:00 . . . . . Available", "Tomorrow 08:00 . . . S. Mitchell"],
  },
  training: {
    title: "PPL Progress",
    lines: ["Solo XC . . . . . . . Done", "Night Hours . . . . . 2.4 / 3.0", "Instrument . . . . . 1.8 / 3.0", "Checkride . . . . . . Scheduled"],
  },
}

export function HeroSection() {
  const [active, setActive] = useState("fuel")
  const demo = demoOutputs[active]
  const { openSignupModal } = useAuthModal()

  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <Image
          src="/images/platform-hero.jpg"
          alt=""
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/70 to-background" />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center gap-16 px-4 pt-28 pb-24 lg:flex-row lg:items-center lg:gap-20 lg:px-8 lg:pt-0 lg:pb-0">
        {/* Left: Copy */}
        <div className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Beta -- Free to try, no credit card
          </div>

          <h1 className="mt-7 max-w-xl text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl text-balance">
            The pilot toolkit
            <span className="text-primary"> you actually use.</span>
          </h1>

          <p className="mt-6 max-w-lg text-base text-muted-foreground leading-relaxed text-pretty lg:text-lg">
            Fuel prices, flight planning, club scheduling, training tracking, and an E6B
            that doesn{"'"}t suck. Quick tools for real pilots.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="h-12 gap-2 rounded-xl bg-primary px-8 text-primary-foreground hover:bg-primary/90"
              onClick={() => openSignupModal()}
            >
              Create Free Account
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-12 rounded-xl border-border px-8 text-foreground hover:bg-secondary"
              asChild
            >
              <a href="#pricing">See Pricing</a>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Trusted by <span className="font-semibold text-foreground">2,400+</span> pilots across the US
          </p>
        </div>

        {/* Right: Interactive Terminal */}
        <div className="w-full max-w-md lg:max-w-lg">
          <div className="overflow-hidden rounded-2xl border border-border bg-card/80 shadow-2xl shadow-primary/5 backdrop-blur-xl">
            {/* Terminal Header */}
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <span className="h-3 w-3 rounded-full bg-destructive/60" />
              <span className="h-3 w-3 rounded-full bg-chart-4/60" />
              <span className="h-3 w-3 rounded-full bg-primary/60" />
              <span className="ml-3 font-mono text-xs text-muted-foreground">aviationhub --demo</span>
            </div>

            {/* Tool Tabs */}
            <div className="flex gap-1 border-b border-border px-4 py-2.5">
              {tools.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setActive(t.value)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                    active === t.value
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              ))}
            </div>

            {/* Terminal Output */}
            <div className="px-5 py-5">
              <div className="flex items-center gap-2 text-xs text-primary">
                <Search className="h-3 w-3" />
                <span className="font-mono">{demo.title}</span>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                {demo.lines.map((line, i) => (
                  <div
                    key={`${active}-${i}`}
                    className="font-mono text-sm text-foreground/80 animate-in fade-in slide-in-from-left-2"
                    style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
                  >
                    <span className="text-muted-foreground mr-2 select-none">{'>'}</span>
                    {line}
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                <span className="animate-pulse text-primary">_</span>
                Click a tool above to preview
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
