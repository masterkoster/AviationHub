'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock } from 'lucide-react'

export default function StartingTotalsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Starting Totals</h1>
            <p className="text-sm text-muted-foreground">Set baseline hours before logged flights</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Baseline Totals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Set your starting totals if you're migrating from another logbook.
              This feature is coming soon.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
