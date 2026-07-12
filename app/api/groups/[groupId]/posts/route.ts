import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET posts for a group (members only)
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    const userId = session.user.id;

    // Check membership
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const posts = await prisma.organizationPost.findMany({
      where: { organizationId: groupId },
      include: {
        author: { select: { id: true, name: true, image: true } }
      },
      orderBy: [
        { pinned: 'desc' },
        { createdAt: 'desc' }
      ],
      take: 200
    });

    const formatted = posts.map(p => ({
      id: p.id,
      title: p.title,
      content: p.content,
      pinned: p.pinned,
      author: p.author,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('Error fetching posts:', error);
    return NextResponse.json({ error: 'Failed to fetch posts', details: String(error) }, { status: 500 });
  }
}

// POST create a post (admin/officer only)
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const userId = session.user.id;

    // Check role: ADMIN or OFFICER can post
    const membership = await prisma.organizationMember.findFirst({
      where: {
        organizationId: groupId,
        userId,
        role: { in: ['ADMIN', 'OFFICER'] }
      }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Only admins and officers can create posts' }, { status: 403 });
    }

    const body = await request.json();
    const { title, content, pinned } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const post = await prisma.organizationPost.create({
      data: {
        organizationId: groupId,
        authorId: userId,
        title: title.trim(),
        content,
        pinned: pinned === true
      },
      include: {
        author: { select: { id: true, name: true, image: true } }
      }
    });

    return NextResponse.json({
      id: post.id,
      title: post.title,
      content: post.content,
      pinned: post.pinned,
      author: post.author,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt
    });
  } catch (error) {
    console.error('Error creating post:', error);
    return NextResponse.json({ error: 'Failed to create post', details: String(error) }, { status: 500 });
  }
}
