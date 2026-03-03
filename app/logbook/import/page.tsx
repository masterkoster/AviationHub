'use client'

import { useState, useRef } from 'react'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Upload, FileText, AlertCircle, CheckCircle2, Table, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function ImportPage() {
  const { data, isLoading, mutate } = useSWR('/api/logbook/imports', fetcher)
  const [importing, setImporting] = useState(false)
  const [parseResult, setParseResult] = useState<{ success: boolean; flights: any[]; error?: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const imports = data?.imports || []

  const parseCSV = async (file: File) => {
    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())
    if (lines.length < 2) {
      setParseResult({ success: false, flights: [], error: 'File appears to be empty or has no data rows' })
      return
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
    
    // Map common column names
    const columnMap: Record<string, string> = {}
    const possibleMappings: Record<string, string[]> = {
      date: ['date', 'flight date', 'flightdate'],
      aircraft: ['aircraft', 'aircraft type', 'aircrafttype', 'n-number', 'nnumber', 'registration', 'tail'],
      routeFrom: ['from', 'departure', 'from airport', 'fromairport', 'route from', 'dep'],
      routeTo: ['to', 'arrival', 'to airport', 'toairport', 'route to', 'arr'],
      totalTime: ['total time', 'totaltime', 'flight time', 'flighttime', 'time', 'duration'],
      picTime: ['pic', 'pic time', 'pictime', 'pilot in command', 'pilotincommand'],
      nightTime: ['night', 'night time', 'nighttime'],
      instrumentTime: ['instrument', 'instrument time', 'instrumenttime', 'imc'],
      dayLandings: ['day landings', 'daylandings', 'day ldg', 'landings'],
      nightLandings: ['night landings', 'nightlandings', 'night ldg'],
    }

    Object.entries(possibleMappings).forEach(([standard, possible]) => {
      const found = headers.findIndex(h => possible.some(p => h.includes(p)))
      if (found >= 0) columnMap[standard] = found.toString()
    })

    const flights: any[] = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
      if (values.length < 3) continue

      const flight: any = {}
      
      // Parse date
      if (columnMap.date) {
        const dateVal = values[parseInt(columnMap.date)]
        if (dateVal) {
          const parsed = new Date(dateVal)
          if (!isNaN(parsed.getTime())) {
            flight.date = parsed.toISOString()
          }
        }
      }
      
      if (columnMap.aircraft) flight.aircraft = values[parseInt(columnMap.aircraft)]
      if (columnMap.routeFrom) flight.routeFrom = values[parseInt(columnMap.routeFrom)]
      if (columnMap.routeTo) flight.routeTo = values[parseInt(columnMap.routeTo)]
      if (columnMap.totalTime) flight.totalTime = parseFloat(values[parseInt(columnMap.totalTime)]) || 0
      if (columnMap.picTime) flight.picTime = parseFloat(values[parseInt(columnMap.picTime)]) || 0
      if (columnMap.nightTime) flight.nightTime = parseFloat(values[parseInt(columnMap.nightTime)]) || 0
      if (columnMap.instrumentTime) flight.instrumentTime = parseFloat(values[parseInt(columnMap.instrumentTime)]) || 0
      if (columnMap.dayLandings) flight.dayLandings = parseInt(values[parseInt(columnMap.dayLandings)]) || 0
      if (columnMap.nightLandings) flight.nightLandings = parseInt(values[parseInt(columnMap.nightLandings)]) || 0

      if (flight.aircraft || flight.routeFrom) {
        flights.push(flight)
      }
    }

    if (flights.length === 0) {
      setParseResult({ success: false, flights: [], error: 'No valid flights found in file' })
    } else {
      setParseResult({ success: true, flights })
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await parseCSV(file)
    }
  }

  const importFlights = async () => {
    if (!parseResult?.flights?.length) return
    
    setImporting(true)
    let imported = 0
    let failed = 0

    for (const flight of parseResult.flights) {
      try {
        const res = await fetch('/api/logbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(flight)
        })
        if (res.ok) imported++
        else failed++
      } catch {
        failed++
      }
    }

    // Record the import
    await fetch('/api/logbook/imports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'CSV',
        summaryJson: JSON.stringify({ imported, failed, total: parseResult.flights.length })
      })
    })

    mutate()
    setImporting(false)
    setParseResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Import</h1>
            <p className="text-sm text-muted-foreground">Import flights from CSV files</p>
          </div>
        </div>
      </div>
      
      <div className="px-6 py-6 space-y-6">
        {/* Import Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Import from CSV
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">Click to upload CSV file</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supported columns: Date, Aircraft, From, To, Total Time, PIC Time, Night Time, Instrument Time, Day Landings, Night Landings
                </p>
              </label>
            </div>

            {parseResult && (
              <div className={`rounded-lg p-4 ${parseResult.success ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {parseResult.success ? (
                  <>
                    <div className="flex items-center gap-2 text-green-600 mb-2">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-medium">Found {parseResult.flights.length} flights</span>
                    </div>
                    <div className="text-sm text-muted-foreground mb-3">
                      Preview of first 3 flights:
                    </div>
                    <div className="space-y-2 mb-4">
                      {parseResult.flights.slice(0, 3).map((f, i) => (
                        <div key={i} className="text-sm bg-background rounded p-2">
                          {f.date ? new Date(f.date).toLocaleDateString() : 'No date'}: {f.aircraft} {f.routeFrom} → {f.routeTo} ({f.totalTime}h)
                        </div>
                      ))}
                    </div>
                    <Button onClick={importFlights} disabled={importing}>
                      {importing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        'Import Flights'
                      )}
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="w-5 h-5" />
                    <span>{parseResult.error}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Previous Imports */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Import History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : imports.length === 0 ? (
              <p className="text-muted-foreground">No previous imports</p>
            ) : (
              <div className="space-y-3">
                {imports.map((imp: any) => {
                  const summary = imp.summaryJson ? JSON.parse(imp.summaryJson) : null
                  return (
                    <div key={imp.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{imp.source}</span>
                          <Badge variant="outline">{new Date(imp.createdAt).toLocaleDateString()}</Badge>
                        </div>
                        {summary && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {summary.imported} imported, {summary.failed} failed
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
