'use client'

import { useState, useEffect } from 'react'
import {
  Calculator, Wind, Fuel, Gauge, ArrowRightLeft, Sun, Compass,
  Scale, Navigation, Cloud, Clock, RotateCw, History, Gauge as GaugeIcon,
  ShieldCheck, Plane,
  type LucideIcon,
} from 'lucide-react'
import { ensureE6bSchema } from '@/desktop/lib/e6b-store'

// Standalone tool components
import WeightBalanceTool from './weight-balance-tool'
import WindTriangleTool from './wind-triangle-tool'
import PressureAltitudeTool from './pressure-altitude-tool'
import CloudBaseTool from './cloud-base-tool'
import TSDTool from './tsd-tool'
import StandardRateTool from './standard-rate-tool'
import HoldingPatternTool from './holding-pattern-tool'
import HistoryTool from './history-tool'

// Enhanced rewrites of the original 6 quick-calc tools
import WindCorrectionTool from './wind-correction-tool'
import CrosswindToolNew from './crosswind-tool'
import FuelBurnTool from './fuel-burn-tool'
import TASDensityTool from './tas-density-tool'
import SunriseSunsetTool from './sunrise-sunset-tool'
import RouteWeatherTool from './route-weather-tool'
import UnitConverterTool from './unit-converter-tool'

type Tool =
  | 'wind'
  | 'crosswind'
  | 'fuel'
  | 'tas'
  | 'convert'
  | 'sun'
  | 'route-weather'
  // Flight planning tools
  | 'weight-balance'
  | 'wind-triangle'
  | 'pressure-altitude'
  | 'cloud-base'
  | 'tsd'
  | 'standard-rate'
  | 'holding-pattern'
  | 'history'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DesktopToolsPage() {
  const [active, setActive] = useState<Tool>('weight-balance')

  // Ensure local SQLite schema for history + aircraft presets is initialized
  useEffect(() => {
    ensureE6bSchema().catch(() => {
      /* silent — Tauri/sql may be unavailable in web-only mode */
    })
  }, [])

  // Group tools under section headings in the sidebar
  const navGroups: { label: string; items: { id: Tool; label: string; icon: LucideIcon }[] }[] = [
    {
      label: 'Flight Planning',
      items: [
        { id: 'weight-balance', label: 'Weight & Balance', icon: Scale },
        { id: 'wind-triangle', label: 'Wind Triangle', icon: Navigation },
        { id: 'holding-pattern', label: 'Holding Pattern', icon: Plane },
        { id: 'tsd', label: 'Time-Speed-Distance', icon: Clock },
        { id: 'fuel', label: 'Fuel Burn', icon: Fuel },
        { id: 'route-weather', label: 'Route Weather', icon: ShieldCheck },
        { id: 'sun', label: 'Sunrise / Sunset', icon: Sun },
      ],
    },
    {
      label: 'Performance',
      items: [
        { id: 'pressure-altitude', label: 'Pressure Altitude', icon: GaugeIcon },
        { id: 'cloud-base', label: 'Cloud Base', icon: Cloud },
        { id: 'tas', label: 'TAS & Density', icon: Gauge },
        { id: 'standard-rate', label: 'Standard-Rate Turn', icon: RotateCw },
      ],
    },
    {
      label: 'Quick Calc',
      items: [
        { id: 'wind', label: 'Wind Correction', icon: Wind },
        { id: 'crosswind', label: 'Crosswind', icon: Compass },
        { id: 'convert', label: 'Unit Converter', icon: ArrowRightLeft },
      ],
    },
    {
      label: 'Data',
      items: [
        { id: 'history', label: 'History', icon: History },
      ],
    },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar nav */}
      <aside className="w-56 shrink-0 border-r border-border bg-card flex flex-col py-4 overflow-y-auto">
        <div className="px-4 mb-4 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm">E6B &amp; Tools</span>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {navGroups.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? 'mt-3' : ''}>
              <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left w-full ${
                    active === item.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </button>
              ))}
              {gi < navGroups.length - 1 && (
                <div className="mx-3 mt-3 border-t border-border/60" />
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* Tool area — scrollable within its own container, never the page */}
      <main className="flex-1 min-w-0 h-full overflow-hidden p-6">
        {/* Flight planning tools */}
        {active === 'weight-balance' && <WeightBalanceTool />}
        {active === 'wind-triangle' && <WindTriangleTool />}
        {active === 'pressure-altitude' && <PressureAltitudeTool />}
        {active === 'cloud-base' && <CloudBaseTool />}
        {active === 'tsd' && <TSDTool />}
        {active === 'standard-rate' && <StandardRateTool />}
        {active === 'holding-pattern' && <HoldingPatternTool />}
        {active === 'history' && <HistoryTool />}
        {/* Enhanced quick calc tools */}
        {active === 'wind' && <WindCorrectionTool />}
        {active === 'crosswind' && <CrosswindToolNew />}
        {active === 'fuel' && <FuelBurnTool />}
        {active === 'tas' && <TASDensityTool />}
        {active === 'convert' && <UnitConverterTool />}
        {active === 'sun' && <SunriseSunsetTool />}
        {active === 'route-weather' && <RouteWeatherTool />}
      </main>
    </div>
  )
}
