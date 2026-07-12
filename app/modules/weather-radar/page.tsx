'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'
import { CloudSun, Radio, MapPin, TriangleAlert, Layers } from 'lucide-react'

const WeatherRadarMap = dynamic(() => import('./WeatherRadarMap'), { ssr: false })

export default function WeatherRadarPage() {
  const { data: session, status } = useSession()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(false)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Loading Aviation Weather...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-3">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20">
                <CloudSun className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Aviation Weather</h1>
                <p className="text-xs text-slate-400">Real-time radar, METAR stations, and hazards</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
                <Radio className="h-3 w-3 text-emerald-400" />
                <span>Radar</span>
                <MapPin className="h-3 w-3 text-blue-400 ml-2" />
                <span>METAR</span>
                <TriangleAlert className="h-3 w-3 text-amber-400 ml-2" />
                <span>Hazards</span>
              </div>
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">
                Live Data
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="h-[calc(100vh-60px)] overflow-hidden">
        <WeatherRadarMap />
      </div>
    </div>
  )
}
