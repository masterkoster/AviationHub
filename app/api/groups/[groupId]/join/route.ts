import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    
    const { groupId } = await params;
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }
    if (!/^[0-9a-f]{64}$/i.test(token)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    // Find the invite using raw SQL
    const invites = await prisma.$queryRaw`
      SELECT * FROM Invite
      WHERE token = ${token} AND groupId = ${groupId} AND expiresAt > GETDATE()
    ` as any[];

    if (!invites || invites.length === 0) {
      // Check if invite exists but expired
      const anyInvites = await prisma.$queryRaw`
        SELECT * FROM Invite WHERE token = ${token}
      ` as any[];

      if (anyInvites && anyInvites.length > 0) {
        const inv = anyInvites[0];
        if (new Date(inv.expiresAt) <= new Date()) {
          return NextResponse.json({ error: 'Invite has expired. Please ask for a new one.' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Invalid invite link for this group' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
    }

    const invite = invites[0];

    // VIEWER role can join without account - just return success
    if (invite.role === 'VIEWER' && !session?.user?.email) {
      // For viewer invites without login, just return success info
      const groups = await prisma.$queryRaw`
        SELECT id, name, description FROM FlyingGroup WHERE id = ${groupId}
      ` as any[];
      
      return NextResponse.json({ 
        success: true, 
        role: 'VIEWER',
        group: groups[0],
        message: 'You can view this group as a viewer'
      });
    }

    // For MEMBER/ADMIN roles, require login
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Please log in to join as a member' }, { status: 401 });
    }

    // Get user by email using raw SQL
    const users = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: '[User] not found' }, { status: 404 });
    }

    const userId = users[0].id;

    // Check if already a member using raw SQL
    const existingMembers = await prisma.$queryRaw`
      SELECT * FROM GroupMember WHERE userId = ${userId} AND groupId = ${groupId}
    ` as any[];

    if (existingMembers && existingMembers.length > 0) {
      return NextResponse.json({ error: 'Already a member of this group' }, { status: 400 });
    }

    // Add user as member using raw SQL
    const memberId = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO GroupMember (id, userId, groupId, role, joinedAt)
      VALUES (${memberId}, ${userId}, ${groupId}, ${invite.role}, GETDATE())
    `;

    // Delete the used invite
    await prisma.$executeRaw`DELETE FROM Invite WHERE id = ${invite.id}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error joining group:', error);
    return NextResponse.json({ error: 'Failed to join group' }, { status: 500 });
  }
}
