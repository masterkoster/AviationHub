import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ groupId: string; docId: string }>;
}

// GET download a document (members only)
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId, docId } = await params;
    const userId = session.user.id;

    // Check membership
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const doc = await prisma.organizationDocument.findFirst({
      where: { id: docId, organizationId: groupId }
    });

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Return file with proper headers
    return new NextResponse(new Uint8Array(doc.fileData), {
      headers: {
        'Content-Type': doc.mimeType,
        'Content-Disposition': `attachment; filename="${doc.name}"`,
        'Content-Length': String(doc.fileSize)
      }
    });
  } catch (error) {
    console.error('Error downloading document:', error);
    return NextResponse.json({ error: 'Failed to download document', details: String(error) }, { status: 500 });
  }
}

// DELETE a document (admin/officer/uploader only)
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId, docId } = await params;
    const userId = session.user.id;

    const doc = await prisma.organizationDocument.findFirst({
      where: { id: docId, organizationId: groupId }
    });

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Allow if uploader, admin, or officer
    if (doc.uploadedById !== userId) {
      const membership = await prisma.organizationMember.findFirst({
        where: {
          organizationId: groupId,
          userId,
          role: { in: ['ADMIN', 'OFFICER'] }
        }
      });

      if (!membership) {
        return NextResponse.json({ error: 'Not authorized to delete this document' }, { status: 403 });
      }
    }

    await prisma.organizationDocument.delete({ where: { id: docId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json({ error: 'Failed to delete document', details: String(error) }, { status: 500 });
  }
}
