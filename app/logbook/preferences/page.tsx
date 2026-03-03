'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Settings } from 'lucide-react'

export default function PreferencesPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Preferences</h1>
            <p className="text-sm text-muted-foreground">Logbook settings and preferences</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Logbook Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Configure time display formats, units, and other logbook preferences.
              This feature is coming soon.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
