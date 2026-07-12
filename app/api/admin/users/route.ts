import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';

// POST /api/admin/users - Create a new user
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionRole = (session.user as any)?.role;
    if (sessionRole !== 'admin' && sessionRole !== 'owner') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { username, email, password, name, role, tier } = body;

    // Validate required fields
    if (!username || !email || !password) {
      return NextResponse.json({ error: 'Username, email, and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // Validate email format (basic)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Validate username format (alphanumeric + underscores, 3-50 chars)
    if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
      return NextResponse.json({ error: 'Username must be 3-50 characters (letters, numbers, underscores)' }, { status: 400 });
    }

    // Check for existing user with same email or username
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true, email: true, username: true },
    });

    if (existing) {
      const field = existing.email === email ? 'Email' : 'Username';
      return NextResponse.json({ error: `${field} already in use` }, { status: 409 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        name: name || null,
        role: role || 'user',
        tier: tier || 'free',
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        tier: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

// GET /api/admin/users - List users with search and pagination
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionRole = (session.user as any)?.role;
    if (sessionRole !== 'admin' && sessionRole !== 'owner') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const search = url.searchParams.get('search') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const tier = url.searchParams.get('tier'); // free, pro, or all
    const role = url.searchParams.get('role'); // user, admin, owner
    const offset = (page - 1) * limit;

    const where: any = {};

    if (search) {
      const term = search.trim();
      if (term) {
        where.OR = [
          { email: { contains: term } },
          { name: { contains: term } },
          { username: { contains: term } },
        ];
      }
    }
    if (tier && tier !== 'all') {
      where.tier = tier;
    }
    if (role) {
      where.role = role;
    }

    const [total, users] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
          select: {
            id: true,
            email: true,
            name: true,
            username: true,
            tier: true,
            role: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { organizationMembers: true } },
          },
        }),
    ]);

    const userIds = users.map((u: any) => u.id);
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: { in: userIds } },
      include: { organization: { select: { name: true } } },
    });

    const groupNameByUser = new Map<string, string>();
    memberships.forEach((m: any) => {
      if (!groupNameByUser.has(m.userId)) {
        groupNameByUser.set(m.userId, m.organization?.name || '');
      }
    });

    const pilotProfiles = await prisma.pilotProfile.findMany({
      where: { userId: { in: userIds } },
      select: { id: true, userId: true },
    });
    const pilotProfileIds = pilotProfiles.map((p) => p.id);
    const userByPilotProfile = new Map(pilotProfiles.map((p) => [p.id, p.userId]));

    const logbookHours = await prisma.logbookEntry.groupBy({
      by: ['pilotProfileId'],
      _sum: { totalTime: true },
      where: { pilotProfileId: { in: pilotProfileIds } },
    });
    const hoursMap = new Map(
      logbookHours.map((h) => [userByPilotProfile.get(h.pilotProfileId ?? '') ?? '', h._sum.totalTime || 0])
    );

    return NextResponse.json({
       users: users.map((u: any) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        username: u.username,
        tier: u.tier,
        role: u.role,
        createdAt: u.createdAt?.toISOString(),
        updatedAt: u.updatedAt?.toISOString(),
        flightPlanCount: 0, // User has no flightPlans relation
        clubCount: Number(u._count?.organizationMembers || 0),
        status: 'active',
        hours: Number(hoursMap.get(u.id) || 0),
        club: groupNameByUser.get(u.id) || '—',
        joined: u.createdAt?.toISOString()?.split('T')[0],
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
