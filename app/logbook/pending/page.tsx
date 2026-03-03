'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plane } from 'lucide-react'

export default function PendingPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pending Flights</h1>
            <p className="text-sm text-muted-foreground">Flights awaiting approval</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plane className="w-5 h-5" />
              Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              View and approve pending flight entries. This feature is coming soon.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
