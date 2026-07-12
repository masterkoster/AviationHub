import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';
import { randomUUID } from 'crypto';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET document list for a group
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const userId = session.user.id;

    // Check membership
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const documents = await prisma.organizationDocument.findMany({
      where: { organizationId: groupId },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
        uploadedBy: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    return NextResponse.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json({ error: 'Failed to fetch documents', details: String(error) }, { status: 500 });
  }
}

// POST upload a document (admin/officer only)
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const userId = session.user.id;

    // Check role
    const membership = await prisma.organizationMember.findFirst({
      where: {
        organizationId: groupId,
        userId,
        role: { in: ['ADMIN', 'OFFICER'] }
      }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Only admins and officers can upload documents' }, { status: 403 });
    }

    const contentType = request.headers.get('content-type') || '';

    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Multipart form data required' }, { status: 400 });
    }

    // Parse multipart form
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const name = formData.get('name') as string | null;
    const description = formData.get('description') as string | null;
    const category = formData.get('category') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const docName = name || file.name;
    const docCategory = category || 'general';

    // Read file as buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileData = Buffer.from(arrayBuffer);

    const document = await prisma.organizationDocument.create({
      data: {
        organizationId: groupId,
        name: docName,
        description: description || null,
        category: docCategory,
        mimeType: file.type || 'application/octet-stream',
        fileSize: fileData.length,
        fileData,
        uploadedById: userId
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
        uploadedBy: { select: { id: true, name: true } }
      }
    });

    return NextResponse.json(document);
  } catch (error) {
    console.error('Error uploading document:', error);
    return NextResponse.json({ error: 'Failed to upload document', details: String(error) }, { status: 500 });
  }
}
