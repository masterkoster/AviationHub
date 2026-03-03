'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, FileText, Table, Loader2 } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function DownloadPage() {
  const { data, isLoading } = useSWR('/api/logbook?limit=5000&includeVoided=true', fetcher)
  const [exporting, setExporting] = useState(false)

  const entries = data?.entries || []

  const exportToCSV = () => {
    if (entries.length === 0) return
    
    setExporting(true)
    
    // Define CSV columns
    const headers = [
      'Date', 'Aircraft', 'Route', 'Total Time', 'PIC Time', 'SIC Time', 'Solo Time',
      'Dual Received', 'Dual Given', 'Night Time', 'Instrument Time', 
      'Simulated Instrument', 'Cross Country', 'Day Landings', 'Night Landings',
      'Approaches', 'Holds', 'Intercepts', 'Instructor', 'Remarks', 'Authority', 
      'Is Pending', 'Is Voided', 'Void Reason'
    ]

    const rows = entries.map((e: any) => [
      new Date(e.date).toLocaleDateString(),
      e.aircraft || '',
      `${e.routeFrom || ''} → ${e.routeTo || ''}`,
      e.totalTime || 0,
      e.picTime || 0,
      e.sicTime || 0,
      e.soloTime || 0,
      e.dualReceived || 0,
      e.dualGiven || 0,
      e.nightTime || 0,
      e.instrumentTime || 0,
      e.simulatedInstrumentTime || 0,
      e.crossCountryTime || 0,
      e.dayLandings || 0,
      e.nightLandings || 0,
      e.approaches || 0,
      e.holds || 0,
      e.intercepts || 0,
      e.instructor || '',
      e.remarks || '',
      e.authority || 'FAA',
      e.isPending ? 'Yes' : 'No',
      e.isVoided ? 'Yes' : 'No',
      e.voidReason || ''
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `logbook_export_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    
    setExporting(false)
  }

  const formatHours = (entries: any[]) => {
    return entries.reduce((acc, e) => acc + (parseFloat(e.totalTime) || 0), 0).toFixed(1)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Download</h1>
            <p className="text-sm text-muted-foreground">Export your logbook data</p>
          </div>
        </div>
      </div>
      
      <div className="px-6 py-6 space-y-6">
        {isLoading ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Loading flight data...
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Export Options */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  Export Options
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-secondary/30 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">
                        <Table className="w-4 h-4" />
                        CSV Export
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Export all {entries.length} flights ({formatHours(entries)} total hours)
                      </p>
                    </div>
                    <Button 
                      onClick={exportToCSV} 
                      disabled={entries.length === 0 || exporting}
                    >
                      {exporting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          Download CSV
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="bg-secondary/30 rounded-lg p-4 opacity-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        PDF Export
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Generate a printable PDF of your logbook
                      </p>
                    </div>
                    <Button variant="outline" disabled>
                      Coming Soon
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Export Preview */}
            {entries.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Export Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium">Date</th>
                          <th className="text-left py-2 px-3 font-medium">Aircraft</th>
                          <th className="text-left py-2 px-3 font-medium">Route</th>
                          <th className="text-right py-2 px-3 font-medium">Time</th>
                          <th className="text-left py-2 px-3 font-medium">PIC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.slice(0, 5).map((e: any) => (
                          <tr key={e.id} className="border-b border-secondary">
                            <td className="py-2 px-3">{new Date(e.date).toLocaleDateString()}</td>
                            <td className="py-2 px-3">{e.aircraft}</td>
                            <td className="py-2 px-3">{e.routeFrom} → {e.routeTo}</td>
                            <td className="py-2 px-3 text-right">{parseFloat(e.totalTime || 0).toFixed(1)}</td>
                            <td className="py-2 px-3">{parseFloat(e.picTime || 0).toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {entries.length > 5 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        ...and {entries.length - 5} more entries
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
