import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'

type SharedRouteWaypoint = { icao: string; name: string; latitude: number; longitude: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const minDist = parseFloat(searchParams.get('minDist') ?? '0') || 0
    const maxDist = parseFloat(searchParams.get('maxDist') ?? '9999') || 9999
    const category = searchParams.get('category') ?? ''
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50)
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))

    const where: Record<string, unknown> = {
      isPublic: true,
      totalDistanceNm: { gte: minDist, lte: maxDist },
    }
    if (category && category !== 'All') where.aircraftCategory = category

    const routes = await db.sharedRoute.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    })
    const total = await db.sharedRoute.count({ where })

    // Resolve pilot display names via two-step join
    const profileIds: string[] = [...new Set<string>(routes.map((r: { pilotProfileId: string }) => r.pilotProfileId))]
    const profiles = profileIds.length
      ? await prisma.pilotProfile.findMany({
          where: { id: { in: profileIds } },
          select: { id: true, userId: true },
        })
      : []
    const userIds = profiles.map((p) => p.userId)
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : []

    const userMap = new Map(users.map((u) => [u.id, u.name]))
    const profileMap = new Map(profiles.map((p) => [p.id, p.userId]))

    return NextResponse.json({
      routes: routes.map((r: {
        id: string; name: string; description: string | null
        waypointsJson: string; totalDistanceNm: number
        aircraftCategory: string; downloadsCount: number
        createdAt: Date; pilotProfileId: string
      }) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        waypoints: JSON.parse(r.waypointsJson) as SharedRouteWaypoint[],
        totalDistanceNm: r.totalDistanceNm,
        aircraftCategory: r.aircraftCategory,
        downloadsCount: r.downloadsCount,
        createdAt: r.createdAt,
        sharedBy: userMap.get(profileMap.get(r.pilotProfileId) ?? '') ?? 'Pilot',
      })),
      total,
      offset,
      limit,
    })
  } catch (error) {
    console.error('GET /api/discover/routes error:', error)
    return NextResponse.json({ error: 'Failed to load routes' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json() as {
      name?: string
      description?: string
      waypoints?: SharedRouteWaypoint[]
      totalDistanceNm?: number
      aircraftCategory?: string
    }
    const { name, description, waypoints, totalDistanceNm, aircraftCategory } = body

    if (!name || !Array.isArray(waypoints) || waypoints.length < 2) {
      return NextResponse.json(
        { error: 'name and at least 2 waypoints are required' },
        { status: 400 }
      )
    }

    const profile = await getOrCreatePilotProfile(session.user.id)

    const route = await db.sharedRoute.create({
      data: {
        pilotProfileId: profile.id,
        name: String(name).slice(0, 200),
        description: description ? String(description).slice(0, 2000) : null,
        waypointsJson: JSON.stringify(waypoints),
        totalDistanceNm: typeof totalDistanceNm === 'number' ? totalDistanceNm : 0,
        aircraftCategory: ['SE', 'ME', 'SEA'].includes(String(aircraftCategory))
          ? String(aircraftCategory)
          : 'SE',
        isPublic: true,
      },
    })

    return NextResponse.json({ id: route.id }, { status: 201 })
  } catch (error) {
    console.error('POST /api/discover/routes error:', error)
    return NextResponse.json({ error: 'Failed to share route' }, { status: 500 })
  }
}
