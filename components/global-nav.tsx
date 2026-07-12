'use client'

import { useState, useRef, useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"
import {
  Plane,
  ChevronDown,
  Bell,
  Search,
  Settings,
  User,
  LogOut,
  ShieldCheck,
  HelpCircle,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"

// GlobalNav height constants (h-11 = 44px top bar)
export const NAV_HEIGHT = 44

type NavItem = {
  label: string
  href?: string
  children?: { label: string; href: string; description?: string }[]
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
  },
  {
    label: "Logbook",
    children: [
      { label: "Add Flight", href: "/logbook?tab=add", description: "Create a new logbook entry" },
      { label: "Search", href: "/logbook?tab=search", description: "Find flights quickly" },
      { label: "Totals", href: "/logbook?tab=totals", description: "View totals and summaries" },
      { label: "Currency", href: "/logbook?tab=currency", description: "FAA/EASA currency status" },
      { label: "Analysis", href: "/logbook?tab=analysis", description: "Charts and trends" },
      { label: "Import/Export", href: "/logbook?tab=import", description: "Import or export logbook data" },
      { label: "Check Flights", href: "/logbook?tab=check-flights", description: "Validate entries" },
      { label: "Pending", href: "/logbook?tab=pending", description: "Awaiting instructor approval" },
    ],
  },
  {
    label: "Plan Flight",
    children: [
      { label: "Fuel Saver", href: "/fuel-saver", description: "Optimise routes and reduce fuel costs" },
      { label: "Airports", href: "/airports", description: "Find airports and FBO info" },
      { label: "Weather Radar", href: "/modules/weather-radar", description: "Live precipitation radar" },
      { label: "E6B Calculator", href: "/modules/e6b", description: "Wind correction, fuel, speed" },
    ],
  },
  {
    label: "Training",
    children: [
      { label: "Training Tracker", href: "/modules/training", description: "Track your progress toward certification" },
      { label: "Endorsements", href: "/training/endorsements", description: "FAA/EASA endorsements" },
      { label: "Engine Health", href: "/modules/engine-health", description: "Monitor engine data and detect anomalies" },
    ],
  },
  {
    label: "Club",
    children: [
      { label: "Dashboard", href: "/flying-club", description: "Club overview" },
      { label: "Active Flights", href: "/flying-club/active", description: "Today's flights and schedules" },
      { label: "Members & Fleet", href: "/flying-club/admin", description: "Manage club members and aircraft" },
      { label: "Maintenance", href: "/flying-club/maintenance-requests", description: "Club maintenance queue" },
      { label: "Currency", href: "/flying-club/currency", description: "Member currency status" },
      { label: "Billing", href: "/flying-club/billing", description: "Hobbs billing" },
      { label: "Squawks", href: "/flying-club/squawks", description: "Report aircraft issues" },
    ],
  },
  {
    label: "Tools",
    children: [
      { label: "Marketplace", href: "/marketplace", description: "Buy/sell aircraft and parts" },
      { label: "Find Mechanic", href: "/mechanics", description: "Search mechanics" },
    ],
  },
]

type SubNavConfig = {
  [key: string]: { label: string; href: string }[]
}

const SUB_NAV: SubNavConfig = {
  "/marketplace": [
    { label: "Browse", href: "/marketplace?tab=browse" },
    { label: "Sell", href: "/marketplace?tab=sell" },
    { label: "Saved", href: "/marketplace?tab=saved" },
    { label: "My Listings", href: "/marketplace?tab=my-listings" },
  ],
  "/fuel-saver": [
    { label: "Route Planner", href: "/fuel-saver?tab=route" },
    { label: "Saved Plans", href: "/fuel-saver?tab=saved" },
    { label: "Trip Finder", href: "/fuel-saver?tab=trip" },
    { label: "Weather", href: "/fuel-saver?tab=weather" },
  ],
}

export function GlobalNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const userName = session?.user?.name || session?.user?.username || "User"
  const userEmail = session?.user?.email || ""
  const userInitials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
  const isAdmin = session?.user?.role === "admin" || session?.user?.role === "owner"

  const subNavKey = Object.keys(SUB_NAV).find(key => pathname.startsWith(key)) ?? "/"
  const subNavItems = SUB_NAV[subNavKey] ?? []

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex flex-col">
      {/* Top bar */}
      <div className="flex h-11 items-center gap-0 border-b border-white/10 bg-[oklch(0.14_0_0)] px-4">
        <Link href="/" className="mr-6 flex items-center gap-2 shrink-0">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
            <Plane className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold text-white">AviationHub</span>
        </Link>

        <nav ref={menuRef} className="flex h-full items-stretch">
          {NAV_ITEMS.map((item) => {
            const active = item.href ? isActive(item.href) : item.children?.some(c => isActive(c.href))
            return (
              <div key={item.label} className="relative flex items-stretch">
                {item.children ? (
                  <button
                    onClick={() => setOpenMenu(openMenu === item.label ? null : item.label)}
                    className={cn(
                      "flex h-full items-center gap-1 px-3 text-xs font-medium transition-colors",
                      active
                        ? "border-b-2 border-primary text-white"
                        : "text-white/60 hover:text-white/90"
                    )}
                  >
                    {item.label}
                    <ChevronDown className={cn("h-3 w-3 transition-transform", openMenu === item.label && "rotate-180")} />
                  </button>
                ) : (
                  <Link
                    href={item.href!}
                    className={cn(
                      "flex h-full items-center px-3 text-xs font-medium transition-colors",
                      active
                        ? "border-b-2 border-primary text-white"
                        : "text-white/60 hover:text-white/90"
                    )}
                  >
                    {item.label}
                  </Link>
                )}

                {item.children && openMenu === item.label && (
                  <div className="absolute left-0 top-full z-50 mt-px w-56 rounded-b-lg border border-white/10 bg-[oklch(0.16_0_0)] py-1 shadow-xl">
                    {item.children.map((child) => (
                      <Link
                        key={child.href + child.label}
                        href={child.href}
                        onClick={() => setOpenMenu(null)}
                        className="flex flex-col gap-0.5 px-4 py-2.5 hover:bg-white/5"
                      >
                        <span className="text-xs font-medium text-white">{child.label}</span>
                        {child.description && (
                          <span className="text-[11px] text-white/40">{child.description}</span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />

          {searchOpen ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="search"
                placeholder="Search..."
                className="h-7 w-48 rounded border border-white/20 bg-white/10 px-2 text-xs text-white placeholder:text-white/40 outline-none focus:border-primary"
              />
              <button onClick={() => setSearchOpen(false)} className="text-white/50 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="flex h-7 w-7 items-center justify-center rounded text-white/50 hover:bg-white/10 hover:text-white"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          )}

          <Link href="/messages" className="relative flex h-7 w-7 items-center justify-center rounded text-white/50 hover:bg-white/10 hover:text-white">
            <Bell className="h-3.5 w-3.5" />
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-destructive" />
          </Link>

          <Link href="/support" className="flex h-7 w-7 items-center justify-center rounded text-white/50 hover:bg-white/10 hover:text-white">
            <HelpCircle className="h-3.5 w-3.5" />
          </Link>

          {status === "loading" ? (
            <div className="h-7 w-7 rounded-full bg-primary/20 animate-pulse" />
          ) : session ? (
            <div ref={userMenuRef} className="relative ml-1">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary hover:bg-primary/30 transition-colors"
              >
                {userInitials}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-white/10 bg-[oklch(0.16_0_0)] py-1 shadow-xl">
                  <div className="border-b border-white/10 px-4 py-2.5">
                    <p className="text-xs font-semibold text-white">{userName}</p>
                    <p className="text-[11px] text-white/40">{userEmail}</p>
                  </div>
                  <Link href="/profile" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white">
                    <User className="h-3.5 w-3.5" /> Profile
                  </Link>
                  <Link href="/settings" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white">
                    <Settings className="h-3.5 w-3.5" /> Settings
                  </Link>
                  {isAdmin && (
                    <Link href="/admin" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white">
                      <ShieldCheck className="h-3.5 w-3.5" /> Admin Dashboard
                    </Link>
                  )}
                  <div className="border-t border-white/10 mt-1">
                    <button
                      onClick={() => signOut({ callbackUrl: '/login' })}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-xs text-destructive hover:bg-white/5 cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login" className="flex h-7 items-center gap-1 rounded bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              Sign In
            </Link>
          )}
        </div>
      </div>

      {/* Secondary tab bar */}
      {subNavItems.length > 0 && (
        <div className="flex h-10 items-stretch gap-0 border-b border-border bg-card px-4">
          <div className="flex items-stretch overflow-x-auto">
            {subNavItems.map((item) => {
              const itemUrl = new URL(item.href, window.location.origin)
              const itemTab = itemUrl.searchParams.get('tab')
              const currentTab = searchParams.get('tab')
              const isActiveSubItem = itemTab ? currentTab === itemTab : pathname === itemUrl.pathname
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex h-full shrink-0 items-center px-4 text-xs font-medium transition-colors border-b-2",
                    isActiveSubItem
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
