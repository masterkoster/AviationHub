import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ token: string }>;
}

// GET look up invite by token (public — no auth required)
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { token } = await params;

    if (!token || token.length < 10) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const invite = await prisma.invite.findUnique({
      where: { token },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            description: true,
            type: true,
            logoUrl: true,
            bannerUrl: true,
            aircraft: {
              select: { id: true, nNumber: true, make: true, model: true, nickname: true, status: true }
            }
          }
        }
      }
    });

    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return NextResponse.json({ error: 'This invite has expired' }, { status: 410 });
    }

    const memberCount = await prisma.organizationMember.count({
      where: { organizationId: invite.groupId }
    });

    // Get recent public posts
    const recentPosts = await prisma.organizationPost.findMany({
      where: { organizationId: invite.groupId },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 3,
      select: { id: true, title: true, content: true, createdAt: true, author: { select: { name: true } } }
    });

    return NextResponse.json({
      valid: true,
      role: invite.role,
      email: invite.email,
      expiresAt: invite.expiresAt,
      group: {
        id: invite.organization.id,
        name: invite.organization.name,
        description: invite.organization.description,
        type: invite.organization.type,
        logoUrl: invite.organization.logoUrl,
        bannerUrl: invite.organization.bannerUrl,
        memberCount,
        aircraft: invite.organization.aircraft,
        recentPosts: recentPosts.map(p => ({
          id: p.id,
          title: p.title,
          excerpt: p.content.length > 200 ? p.content.slice(0, 200) + '...' : p.content,
          authorName: p.author.name,
          createdAt: p.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Error looking up invite:', error);
    return NextResponse.json({ error: 'Failed to look up invite', details: String(error) }, { status: 500 });
  }
}
