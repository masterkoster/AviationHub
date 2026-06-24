"use client"

import { useState } from "react"
import Link from "next/link"
import { Plane, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuthModal } from "@/app/components/AuthModalContext"

const navLinks = [
  { label: "Modules", href: "#modules" },
  { label: "Pricing", href: "#pricing" },
  { label: "Privacy", href: "#privacy" },
  { label: "Marketplace", href: "/modules/marketplace" },
]

export function LandingNavbar() {
  const [open, setOpen] = useState(false)
  const { openLoginModal, openSignupModal } = useAuthModal()

  return (
    <header className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/60 backdrop-blur-2xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Plane className="h-4.5 w-4.5" />
          </div>
          <span className="text-base font-bold tracking-tight text-foreground">
            AviationHub
          </span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => openLoginModal()}
          >
            Log in
          </Button>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => openSignupModal()}
          >
            Start Free
          </Button>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          onClick={() => setOpen(!open)}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground md:hidden"
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile Menu */}
      {open && (
        <div className="border-t border-border bg-background/95 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-1 px-4 py-4">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              <Button
                variant="ghost"
                size="sm"
                className="justify-start text-muted-foreground"
                onClick={() => {
                  setOpen(false)
                  openLoginModal()
                }}
              >
                Log in
              </Button>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground"
                onClick={() => {
                  setOpen(false)
                  openSignupModal()
                }}
              >
                Start Free
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
