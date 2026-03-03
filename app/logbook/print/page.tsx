'use client'

import useSWR from 'swr'
import { Button } from '@/components/ui/button'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function PrintPage() {
  const { data, isLoading } = useSWR('/api/logbook?limit=2000&includeVoided=true', fetcher)
  const entries = data?.entries || []

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5 print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Print View</h1>
            <p className="text-sm text-muted-foreground">Print-friendly logbook format</p>
          </div>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      <div className="px-6 py-6">
        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-border">
              <thead>
                <tr className="bg-secondary/40">
                  <th className="p-2 border">Date</th>
                  <th className="p-2 border">Aircraft</th>
                  <th className="p-2 border">Route</th>
                  <th className="p-2 border">Total</th>
                  <th className="p-2 border">PIC</th>
                  <th className="p-2 border">SIC</th>
                  <th className="p-2 border">Night</th>
                  <th className="p-2 border">Instr</th>
                  <th className="p-2 border">XC</th>
                  <th className="p-2 border">Day Ldg</th>
                  <th className="p-2 border">Night Ldg</th>
                  <th className="p-2 border">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e: any) => (
                  <tr key={e.id}>
                    <td className="p-2 border">{new Date(e.date).toLocaleDateString()}</td>
                    <td className="p-2 border">{e.aircraft}</td>
                    <td className="p-2 border">{e.routeFrom}→{e.routeTo}</td>
                    <td className="p-2 border text-right">{Number(e.totalTime || 0).toFixed(1)}</td>
                    <td className="p-2 border text-right">{Number(e.picTime || 0).toFixed(1)}</td>
                    <td className="p-2 border text-right">{Number(e.sicTime || 0).toFixed(1)}</td>
                    <td className="p-2 border text-right">{Number(e.nightTime || 0).toFixed(1)}</td>
                    <td className="p-2 border text-right">{Number(e.instrumentTime || 0).toFixed(1)}</td>
                    <td className="p-2 border text-right">{Number(e.crossCountryTime || 0).toFixed(1)}</td>
                    <td className="p-2 border text-right">{e.dayLandings || 0}</td>
                    <td className="p-2 border text-right">{e.nightLandings || 0}</td>
                    <td className="p-2 border">{e.remarks || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
