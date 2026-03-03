'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Printer } from 'lucide-react'

export default function PrintPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Print View</h1>
            <p className="text-sm text-muted-foreground">Print-friendly logbook format</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Print Format
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Print view with FAA/EASA formatted output. This feature is coming soon.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
