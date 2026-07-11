import { NextResponse } from 'next/server';
import { auth, prisma } from '@/lib/auth';

async function ensureInquiryTable() {
  try {
    await prisma.$executeRaw`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AircraftInquiry')
      BEGIN
        CREATE TABLE [AircraftInquiry] (
          [id] NVARCHAR(36) NOT NULL PRIMARY KEY DEFAULT NEWID(),
          [listingId] NVARCHAR(36) NOT NULL,
          [buyerId] NVARCHAR(36) NOT NULL,
          [message] NVARCHAR(MAX) NOT NULL,
          [offerAmount] INT NULL,
          [status] NVARCHAR(20) NOT NULL DEFAULT 'unread',
          [createdAt] DATETIME NOT NULL DEFAULT GETDATE(),
          [updatedAt] DATETIME NOT NULL DEFAULT GETDATE()
        );
        CREATE NONCLUSTERED INDEX [IX_AircraftInquiry_listingId] ON [AircraftInquiry]([listingId]);
        CREATE NONCLUSTERED INDEX [IX_AircraftInquiry_buyerId] ON [AircraftInquiry]([buyerId]);
        CREATE NONCLUSTERED INDEX [IX_AircraftInquiry_status] ON [AircraftInquiry]([status]);
      END
    `;
  } catch (error) {
    console.error('Failed to ensure AircraftInquiry table:', error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureInquiryTable();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { listingId, message, offerAmount } = body;

    if (!listingId) {
      return NextResponse.json({ error: 'Listing ID is required' }, { status: 400 });
    }

    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      return NextResponse.json({ error: 'Message must be at least 10 characters' }, { status: 400 });
    }

    // Get the listing to find the seller
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      select: { id: true, userId: true, title: true },
    });

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    // Can't inquire about your own listing
    if (listing.userId === session.user.id) {
      return NextResponse.json({ error: 'Cannot inquire about your own listing' }, { status: 400 });
    }

    // Create the inquiry
    const inquiry = await prisma.aircraftInquiry.create({
      data: {
        listingId,
        buyerId: session.user.id,
        message: message.trim().slice(0, 5000),
        offerAmount: offerAmount ? Math.round(Number(offerAmount)) : null,
        status: 'unread',
      },
    });

    return NextResponse.json({ success: true, inquiry });
  } catch (error) {
    console.error('Inquiry POST failed', error);
    return NextResponse.json({ error: 'Failed to send inquiry' }, { status: 500 });
  }
}

// GET - fetch inquiries for the current user (as buyer or seller)
export async function GET(request: Request) {
  try {
    await ensureInquiryTable();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const url = new URL(request.url);
    const role = url.searchParams.get('role'); // 'buyer' or 'seller'
    const status = url.searchParams.get('status');

    // Get listings owned by user (to find inquiries as seller)
    const userListings = await prisma.marketplaceListing.findMany({
      where: { userId: session.user.id },
      select: { id: true },
    });
    const listingIds = userListings.map(l => l.id);

    const where: any = {};

    if (role === 'buyer') {
      // As buyer - inquiries I sent
      where.buyerId = session.user.id;
    } else if (role === 'seller') {
      // As seller - inquiries on my listings
      where.listingId = { in: listingIds };
    } else {
      // Default - either I'm the buyer OR the listing is mine
      where.OR = [
        { buyerId: session.user.id },
        { listingId: { in: listingIds } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const inquiries = await prisma.aircraftInquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            nNumber: true,
            make: true,
            model: true,
            price: true,
            images: true,
          },
        },
        buyer: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    });

    return NextResponse.json({ inquiries });
  } catch (error) {
    console.error('Inquiry GET failed', error);
    return NextResponse.json({ error: 'Failed to load inquiries' }, { status: 500 });
  }
}
