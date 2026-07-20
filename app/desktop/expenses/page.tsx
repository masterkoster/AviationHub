'use client'

import { Receipt } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FuelLogTab } from './_components/fuel-log-tab'
import { AircraftCostsTab } from './_components/aircraft-costs-tab'

export default function DesktopExpensesPage() {
  const { status } = useDesktopAuth()

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Expenses</h1>
        </div>
        <p className="text-sm text-muted-foreground">Track your flying costs — log fuel and estimate aircraft cost of ownership.</p>
      </div>

      {status === 'authenticated' && (
        <Tabs defaultValue="fuel">
          <TabsList className="mb-6">
            <TabsTrigger value="fuel">Fuel log</TabsTrigger>
            <TabsTrigger value="aircraft-costs">Aircraft costs</TabsTrigger>
          </TabsList>
          <TabsContent value="fuel">
            <FuelLogTab />
          </TabsContent>
          <TabsContent value="aircraft-costs">
            <AircraftCostsTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
