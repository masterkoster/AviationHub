import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string; postId: string }>;
}

// PATCH update a post — pin/unpin, edit title/content (admin or officer only)
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId, postId } = await params;
    const userId = session.user.id;

    const post = await prisma.organizationPost.findUnique({
      where: { id: postId }
    });

    if (!post || post.organizationId !== groupId) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Only admins/officers can pin/edit posts
    const membership = await prisma.organizationMember.findFirst({
      where: {
        organizationId: groupId,
        userId,
        role: { in: ['ADMIN', 'OFFICER'] }
      }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Only admins and officers can update posts' }, { status: 403 });
    }

    const body = await request.json();
    const { pinned, title, content } = body;

    const updateData: Record<string, unknown> = {};
    if (typeof pinned === 'boolean') updateData.pinned = pinned;
    if (typeof title === 'string' && title.trim()) updateData.title = title.trim();
    if (typeof content === 'string' && content.trim()) updateData.content = content;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await prisma.organizationPost.update({
      where: { id: postId },
      data: updateData,
      include: {
        author: { select: { id: true, name: true, image: true } }
      }
    });

    return NextResponse.json({
      id: updated.id,
      title: updated.title,
      content: updated.content,
      pinned: updated.pinned,
      author: updated.author,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    });
  } catch (error) {
    console.error('Error updating post:', error);
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
  }
}

// DELETE a post (author, admin, or officer)
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId, postId } = await params;
    const userId = session.user.id;

    const post = await prisma.organizationPost.findUnique({
      where: { id: postId }
    });

    if (!post || post.organizationId !== groupId) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Allow if author, or admin/officer of the group
    if (post.authorId !== userId) {
      const membership = await prisma.organizationMember.findFirst({
        where: {
          organizationId: groupId,
          userId,
          role: { in: ['ADMIN', 'OFFICER'] }
        }
      });

      if (!membership) {
        return NextResponse.json({ error: 'Not authorized to delete this post' }, { status: 403 });
      }
    }

    await prisma.organizationPost.delete({ where: { id: postId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting post:', error);
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  }
}
