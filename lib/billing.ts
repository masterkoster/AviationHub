import { prisma } from '@/lib/prisma';


export interface BillingResult {
  userId: string;
  email: string;
  name: string;
  success: boolean;
  amount: number;
  invoiceId?: string;
  error?: string;
}

function hoursForFlight(flight: { hobbsStart: unknown; hobbsEnd: unknown; hobbsTime: unknown; tachTime: unknown }): number {
  const toNum = (v: unknown) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && v !== null && 'toNumber' in v && typeof (v as { toNumber: unknown }).toNumber === 'function') {
      return (v as { toNumber: () => number }).toNumber();
    }
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };
  const start = toNum(flight.hobbsStart);
  const end = toNum(flight.hobbsEnd);
  if (start !== null && end !== null) return Math.max(0, end - start);
  const hobbsTime = toNum(flight.hobbsTime);
  if (hobbsTime !== null) return hobbsTime;
  const tach = toNum(flight.tachTime);
  return tach ?? 0;
}

/**
 * Bills every pilot who has flown a club aircraft since the last billing run,
 * creating a BillingRun + Invoice/InvoiceItem rows (status 'pending').
 * Collection is member-initiated: Stripe Checkout direct charges on the
 * club's connected account — the platform never charges members itself.
 */
export async function runBillingCycle(groupId: string): Promise<BillingResult[]> {
  const results: BillingResult[] = [];

  const lastRun = await prisma.billingRun.findFirst({
    where: { organizationId: groupId },
    orderBy: { startedAt: 'desc' },
  });

  const lastRunDate = lastRun?.startedAt ?? new Date(0);

  const flightLogs = await prisma.flightLog.findMany({
    where: {
      organizationId: groupId,
      createdAt: { gt: lastRunDate },
    },
    include: {
      clubAircraft: { select: { id: true, nNumber: true, hourlyRate: true } },
      pilotProfile: { include: { user: { select: { id: true, name: true, email: true, credits: true, stripeCustomerId: true } } } },
    },
    orderBy: { date: 'asc' },
  });

  const billable = flightLogs.filter(fl => fl.pilotProfileId && fl.pilotProfile?.user);

  if (billable.length === 0) {
    return results;
  }

  // Group flights by pilot (FlightLog has no direct userId column — pilot
  // identity flows through pilotProfileId -> PilotProfile.userId).
  const flightsByPilot = new Map<string, typeof billable>();
  for (const flight of billable) {
    const key = flight.pilotProfileId as string;
    const list = flightsByPilot.get(key) ?? [];
    list.push(flight);
    flightsByPilot.set(key, list);
  }

  const billingRun = await prisma.billingRun.create({
    data: {
      organizationId: groupId,
      startedAt: new Date(),
      status: 'running',
    },
  });

  for (const [pilotProfileId, flights] of flightsByPilot) {
    const user = flights[0].pilotProfile!.user!;
    const email = user.email;
    const name = user.name || 'Member';

    let total = 0;
    const invoiceItems: { flightLogId: string; clubAircraftId: string | null; hobbsHours: number; hourlyRate: number; amount: number }[] = [];

    for (const flight of flights) {
      const hobbs = hoursForFlight(flight);
      const rate = flight.clubAircraft?.hourlyRate ? Number(flight.clubAircraft.hourlyRate) : 0;
      const amount = hobbs * rate;
      total += amount;

      invoiceItems.push({
        flightLogId: flight.id,
        clubAircraftId: flight.clubAircraftId,
        hobbsHours: hobbs,
        hourlyRate: rate,
        amount,
      });
    }

    // Apply account credits
    let creditApplied = 0;
    if (user.credits && user.credits > 0) {
      creditApplied = Math.min(user.credits, total);
      total = total - creditApplied;
      await prisma.user.update({
        where: { id: user.id },
        data: { credits: { decrement: creditApplied } },
      });
    }

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: groupId,
        pilotProfileId,
        billingRunId: billingRun.id,
        totalAmount: total,
        status: 'pending',
      },
    });

    for (const item of invoiceItems) {
      await prisma.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          flightLogId: item.flightLogId,
          clubAircraftId: item.clubAircraftId,
          hobbsHours: item.hobbsHours,
          hourlyRate: item.hourlyRate,
          amount: item.amount,
        },
      });
    }

    // Money model: the platform NEVER charges members directly. Invoices are
    // generated as 'pending' and members self-pay via Stripe Checkout as a
    // direct charge on the club's connected account (/api/invoices/[id]/pay).
    // Zero-total invoices are auto-settled since there is nothing to collect.
    let success = true;
    let error: string | undefined;

    if (total === 0) {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'paid' } });
    }

    results.push({
      userId: user.id,
      email,
      name,
      success,
      amount: total,
      invoiceId: invoice.id,
      error,
    });
  }

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  const totalAmount = results.reduce((sum, r) => sum + r.amount, 0);

  await prisma.billingRun.update({
    where: { id: billingRun.id },
    data: {
      status: 'completed',
      completedAt: new Date(),
      totalAmount,
      successCount,
      failureCount,
      details: JSON.stringify(results),
    },
  });

  return results;
}
