import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/admin/billing/transactions - List billing transactions (invoices)
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    if (role !== 'admin' && role !== 'owner') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const take = parseInt(searchParams.get('take') || '50');
    if (!Number.isInteger(take) || take < 1 || take > 1000) {
      return NextResponse.json({ error: 'Invalid take' }, { status: 400 });
    }

    const invoices = await prisma.$queryRaw`
      SELECT TOP (${take})
        i.id, i.totalAmount, i.status, i.createdAt,
        u.name as userName, u.email as userEmail
      FROM Invoice i
      JOIN [User] u ON i.userId = u.id
      ORDER BY i.createdAt DESC
    ` as any[];

    return NextResponse.json({
      transactions: invoices.map(i => ({
        id: i.id,
        user: i.userName || i.userEmail || 'Unknown',
        plan: 'Flight',
        amount: i.totalAmount ? Number(i.totalAmount) : 0,
        date: i.createdAt ? new Date(i.createdAt).toISOString().split('T')[0] : null,
        status: i.status || 'pending',
      }))
    });
  } catch (error) {
    console.error('Error fetching billing transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}
