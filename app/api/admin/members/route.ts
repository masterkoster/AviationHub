import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin or owner
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (user?.role !== 'admin' && user?.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get URL params for groupId if needed
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');

    if (!groupId) {
      return NextResponse.json({ error: 'Group ID required' }, { status: 400 });
    }

    // Fetch all members in the group
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: groupId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
            bfrExpiry: true,
            medicalExpiry: true,
            medicalClass: true,
          }
        }
      },
      orderBy: { joinedAt: 'desc' }
    });

    // Get flight hours for each member
    const membersWithStats = await Promise.all(members.map(async (member) => {
      const flightLogs = await prisma.flightLog.findMany({
        where: { userId: member.userId },
        select: { hobbsTime: true }
      });

      const totalHours = flightLogs.reduce((sum, log) => sum + (log.hobbsTime?.toNumber() || 0), 0);

      return {
        id: member.user.id,
        name: member.user.name || 'Unknown',
        email: member.user.email,
        role: member.role,
        status: 'Active', // TODO: Add status logic
        hours: totalHours,
        balance: 0, // TODO: Calculate balance from billing
        joined: member.joinedAt?.toISOString().split('T')[0] || 'N/A',
        medical: member.user.medicalExpiry?.toISOString().split('T')[0] || '—',
        image: member.user.image,
      };
    }));

    return NextResponse.json({ members: membersWithStats });
  } catch (error) {
    console.error('Error fetching members:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { groupId, email, role } = body;

    if (!groupId || !email || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if already a member
    const existing = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: groupId,
          userId: user.id,
        }
      }
    });

    if (existing) {
      return NextResponse.json({ error: 'User is already a member' }, { status: 400 });
    }

    // Add member
    const member = await prisma.organizationMember.create({
      data: {
        userId: user.id,
        organizationId: groupId,
        role,
      }
    });

    return NextResponse.json({ success: true, member });
  } catch (error) {
    console.error('Error adding member:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
