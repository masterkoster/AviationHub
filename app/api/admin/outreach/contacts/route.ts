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

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const state = searchParams.get('state');
    const search = searchParams.get('search');

    const where: any = {};

    if (type) {
      where.organizationType = type;
    }

    if (state) {
      where.state = state;
    }

    if (search) {
      where.OR = [
        { organizationName: { contains: search } },
        { contactName: { contains: search } },
        { contactEmail: { contains: search } },
        { city: { contains: search } },
      ];
    }

    const contacts = await prisma.outreachContact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const stats = await prisma.outreachContact.groupBy({
      by: ['organizationType'],
      _count: true,
    });

    return NextResponse.json({ contacts, stats });

  } catch (error: any) {
    console.error('[Outreach Contacts API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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

    const contact = await prisma.outreachContact.create({
      data: {
        organizationType: body.organizationType,
        organizationName: body.organizationName,
        airportIcao: body.airportIcao,
        airportName: body.airportName,
        city: body.city,
        state: body.state,
        contactName: body.contactName,
        contactTitle: body.contactTitle,
        contactEmail: body.contactEmail,
        contactPhone: body.contactPhone,
        alternateEmail: body.alternateEmail,
        alternatePhone: body.alternatePhone,
        website: body.website,
        notes: body.notes,
        sourceType: 'manual',
      },
    });

    return NextResponse.json({ contact });

  } catch (error: any) {
    console.error('[Outreach Contacts API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
