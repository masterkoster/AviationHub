import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, notes } = body; // action: 'approve' | 'deny'

    // Get the fuel expense
    const expense = await prisma.fuelExpense.findUnique({
      where: { id }
    });

    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    // Get the aircraft's group
    const aircraft = await prisma.clubAircraft.findUnique({
      where: { id: expense.clubAircraftId ?? undefined },
      select: { organizationId: true }
    });

    if (!aircraft) {
      return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 });
    }

    // Check admin access
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        organizationId: aircraft.organizationId,
        role: { in: ['ADMIN', 'OWNER'] }
      }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Update expense based on action
    let updateData: any = {
      updatedAt: new Date(),
      approvedBy: session.user.id,
      approvedAt: new Date()
    };

    if (action === 'approve') {
      updateData.status = 'APPROVED';
    } else if (action === 'deny') {
      updateData.status = 'DENIED';
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (notes) {
      updateData.notes = (expense.notes || '') + '\n[Admin note] ' + notes;
    }

    const updated = await prisma.fuelExpense.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({ success: true, expense: updated });
  } catch (error) {
    console.error('Error updating fuel expense:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
