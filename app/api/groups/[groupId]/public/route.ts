import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET public group info — no auth required
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { groupId } = await params;
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    const group = await prisma.organization.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        logoUrl: true,
        bannerUrl: true,
        aircraft: {
          select: { id: true, nNumber: true, make: true, model: true, nickname: true, status: true }
        },
        posts: {
          where: { pinned: true },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { id: true, title: true, content: true, createdAt: true, author: { select: { name: true } } }
        }
      }
    });

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const memberCount = await prisma.organizationMember.count({
      where: { organizationId: groupId }
    });

    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      type: group.type,
      logoUrl: group.logoUrl,
      bannerUrl: group.bannerUrl,
      memberCount,
      aircraft: group.aircraft,
      recentPosts: group.posts.map(p => ({
        id: p.id,
        title: p.title,
        excerpt: p.content.length > 200 ? p.content.slice(0, 200) + '...' : p.content,
        authorName: p.author.name,
        createdAt: p.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching public group info:', error);
    return NextResponse.json({ error: 'Failed to load group information' }, { status: 500 });
  }
}
