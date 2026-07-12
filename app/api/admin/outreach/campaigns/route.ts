import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionRole = (session.user as any)?.role;
    if (sessionRole !== 'admin' && sessionRole !== 'owner') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const campaigns = await prisma.outreachCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        _count: {
          select: { emails: true },
        },
      },
    });

    return NextResponse.json({ campaigns });

  } catch (error: any) {
    console.error('[Outreach Campaigns API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const campaign = await prisma.outreachCampaign.create({
      data: {
        name: body.name,
        description: body.description,
        subject: body.subject,
        bodyHtml: body.bodyHtml,
        bodyText: body.bodyText,
        status: 'draft',
      },
    });

    return NextResponse.json({ campaign });

  } catch (error: any) {
    console.error('[Outreach Campaigns API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
