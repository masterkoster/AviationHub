import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type ModuleKey = 'logbook' | 'training' | 'currency' | 'plan' | 'marketplace' | 'mechanic' | 'club' | 'totals'

const stageOrder = ['ingestion', 'validation', 'storage', 'analytics', 'outputs'] as const

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as any)?.role
  if (role !== 'admin' && role !== 'owner') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const moduleKey = (searchParams.get('module') as ModuleKey) || 'totals'

  const [
    logbookEntries,
    logbookAttachments,
    currencyStatuses,
    endorsements,
    trainingProgress,
    flightPlans,
    marketplaceListings,
    mechanicRequests,
    clubGroups,
  ] = await Promise.all([
    prisma.logbookEntry.count(),
    prisma.logbookAttachment.count(),
    prisma.currencyStatus.count(),
    prisma.endorsement.count(),
    prisma.trainingProgress.count(),
    prisma.flightPlan.count(),
    prisma.marketplaceListing.count(),
    prisma.maintenanceRequest.count(),
    prisma.organization.count(),
  ])

  const data = {
    logbookEntries,
    logbookAttachments,
    currencyStatuses,
    endorsements,
    trainingProgress,
    flightPlans,
    marketplaceListings,
    mechanicRequests,
    clubGroups,
  }

  const modules = {
    logbook: {
      ingestion: data.logbookEntries,
      validation: data.currencyStatuses,
      storage: data.logbookAttachments + data.logbookEntries,
      analytics: data.currencyStatuses,
      outputs: data.logbookEntries,
      usedBy: ['currency', 'training', 'exports'],
    },
    training: {
      ingestion: data.endorsements,
      validation: data.trainingProgress,
      storage: data.trainingProgress,
      analytics: data.trainingProgress,
      outputs: data.endorsements,
      usedBy: ['readiness', 'exports'],
    },
    currency: {
      ingestion: data.logbookEntries,
      validation: data.currencyStatuses,
      storage: data.currencyStatuses,
      analytics: data.currencyStatuses,
      outputs: data.currencyStatuses,
      usedBy: ['dashboard', 'alerts'],
    },
    plan: {
      ingestion: data.flightPlans,
      validation: data.flightPlans,
      storage: data.flightPlans,
      analytics: data.flightPlans,
      outputs: data.flightPlans,
      usedBy: ['logbook', 'fuel-saver'],
    },
    marketplace: {
      ingestion: data.marketplaceListings,
      validation: data.marketplaceListings,
      storage: data.marketplaceListings,
      analytics: data.marketplaceListings,
      outputs: data.marketplaceListings,
      usedBy: ['reports', 'exports'],
    },
    mechanic: {
      ingestion: data.mechanicRequests,
      validation: data.mechanicRequests,
      storage: data.mechanicRequests,
      analytics: data.mechanicRequests,
      outputs: data.mechanicRequests,
      usedBy: ['club', 'logbook'],
    },
    club: {
      ingestion: data.clubGroups,
      validation: data.clubGroups,
      storage: data.clubGroups,
      analytics: data.clubGroups,
      outputs: data.clubGroups,
      usedBy: ['admin', 'maintenance'],
    },
  }

  if (moduleKey === 'totals') {
    const totals = stageOrder.map((stage) => {
      const breakdown = Object.entries(modules).reduce((acc, [key, value]) => {
        acc[key] = (value as any)[stage]
        return acc
      }, {} as Record<string, number>)

      const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0)
      return { stage, total, breakdown }
    })

    // Return all modules summary for table view
    const modulesSummary = Object.entries(modules).map(([key, value]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      key,
      ingestion: (value as any).ingestion,
      validation: (value as any).validation,
      storage: (value as any).storage,
      analytics: (value as any).analytics,
      outputs: (value as any).outputs,
    }))

    return NextResponse.json({ module: moduleKey, stages: totals, modules: modulesSummary })
  }

  const selected = modules[moduleKey]
  const stages = stageOrder.map((stage) => ({
    stage,
    value: (selected as any)[stage],
  }))

  // Return all modules summary for table view
  const modulesSummary = Object.entries(modules).map(([key, value]) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    key,
    ingestion: (value as any).ingestion,
    validation: (value as any).validation,
    storage: (value as any).storage,
    analytics: (value as any).analytics,
    outputs: (value as any).outputs,
  }))

  return NextResponse.json({ 
    module: moduleKey, 
    stages, 
    usedBy: selected.usedBy,
    modules: modulesSummary 
  })
}
