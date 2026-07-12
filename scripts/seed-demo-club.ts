/**
 * Seeds a realistic demo flying club ("Oakland County Flyers") owned by
 * dkoster@oakland.edu so the Flying Club UI can be reviewed fully populated.
 *
 * Idempotent: if the org already exists for this user, it exits without
 * writing anything. Only ever INSERTs new rows; never touches existing data.
 *
 * Run with: npx tsx scripts/seed-demo-club.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

// NOTE: ClubAircraft, Maintenance, FuelExpense, Booking, and FlightLog declare
// `@default("newid()")` in schema.prisma as a *literal string* default (not
// dbgenerated), so Prisma Client would send the literal text "newid()" as the
// id for every row if we don't supply one ourselves. We generate UUIDs
// explicitly for those models to match how the rest of the app already does it.
function uuid() {
  return crypto.randomUUID();
}

const prisma = new PrismaClient();

const CLUB_NAME = "Oakland County Flyers";
const OWNER_EMAIL = "dkoster@oakland.edu";

function daysFromNow(days: number, hour = 9, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  console.log(`Looking up user ${OWNER_EMAIL}...`);
  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });

  if (!owner) {
    console.error(`ERROR: No user found with email ${OWNER_EMAIL}.`);
    const similar = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: "oakland" } },
          { email: { contains: "koster" } },
        ],
      },
      select: { id: true, email: true, username: true },
      take: 20,
    });
    if (similar.length) {
      console.error("Similar emails found:");
      for (const u of similar) console.error(`  - ${u.email} (username: ${u.username}, id: ${u.id})`);
    } else {
      console.error("No similar emails found (searched for '%oakland%' and '%koster%').");
    }
    process.exit(1);
  }

  console.log(`Found user: ${owner.email} (id: ${owner.id})`);

  const existingOrg = await prisma.organization.findFirst({
    where: { name: CLUB_NAME, ownerId: owner.id },
  });
  if (existingOrg) {
    console.log(`already seeded (Organization id: ${existingOrg.id})`);
    process.exit(0);
  }

  // Ensure a PilotProfile exists for the owner (required by Booking/FlightLog/Maintenance relations)
  let pilotProfile = await prisma.pilotProfile.findUnique({ where: { userId: owner.id } });
  let createdPilotProfile = false;
  if (!pilotProfile) {
    pilotProfile = await prisma.pilotProfile.create({
      data: {
        userId: owner.id,
        homeAirport: "KPTK",
        homeAirportName: "Oakland County International Airport",
        hours: 420,
        bio: "Club founder and check pilot.",
      },
    });
    createdPilotProfile = true;
  }
  const pilotProfileId = pilotProfile.id;

  const now = new Date();

  const summary = {
    organization: 0,
    organizationMember: 0,
    pilotProfileCreated: createdPilotProfile,
    aircraft: 0,
    maintenance: 0,
    flightLogs: 0,
    bookings: 0,
    blockOuts: 0,
    posts: 0,
    invites: 0,
    fuelExpenses: 0,
  };

  const result = await prisma.$transaction(async (tx) => {
    // ─── Organization ───
    const org = await tx.organization.create({
      data: {
        name: CLUB_NAME,
        type: "club",
        ownerId: owner.id,
        description:
          "Oakland County Flyers is a friendly, member-owned flying club based at KPTK " +
          "(Oakland County International Airport) in Waterford, Michigan. We maintain a " +
          "small fleet of well-cared-for trainers and cross-country aircraft, run a " +
          "no-nonsense scheduling system, and pride ourselves on keeping maintenance " +
          "squawks addressed quickly. Whether you're working on your private certificate, " +
          "knocking out a flight review, or just want an easy way to rent a clean 172 for " +
          "the weekend, there's a seat for you at OCF.",
      },
    });
    summary.organization = 1;

    const member = await tx.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: owner.id,
        role: "ADMIN",
        pilotProfileId,
      },
    });
    summary.organizationMember = 1;

    // ─── Aircraft ───
    const c172 = await tx.clubAircraft.create({
      data: {
        id: uuid(),
        organizationId: org.id,
        nNumber: "N735CX",
        make: "Cessna",
        model: "172N",
        year: 1977,
        hourlyRate: "145.00",
        totalHobbsHours: "4200.30",
        totalTachHours: "4180.10",
        status: "Available",
        bookingWindowDays: 30,
        maxPassengers: 3,
        aircraftNotes: "Club trainer. G5 primary flight display, GPS 430W. Great for BFRs and pattern work.",
      },
    });
    const archer = await tx.clubAircraft.create({
      data: {
        id: uuid(),
        organizationId: org.id,
        nNumber: "N2814P",
        make: "Piper",
        model: "PA-28-181 Archer II",
        year: 1979,
        hourlyRate: "155.00",
        totalHobbsHours: "6800.60",
        totalTachHours: "6772.40",
        status: "Available",
        bookingWindowDays: 30,
        maxPassengers: 3,
        aircraftNotes: "Solid cross-country hauler. Autopilot (STEC 30), long-range tanks.",
      },
    });
    const c182 = await tx.clubAircraft.create({
      data: {
        id: uuid(),
        organizationId: org.id,
        nNumber: "N9142T",
        make: "Cessna",
        model: "182T",
        year: 2005,
        hourlyRate: "210.00",
        totalHobbsHours: "2300.10",
        totalTachHours: "2286.90",
        status: "Available",
        bookingWindowDays: 30,
        maxPassengers: 4,
        aircraftNotes: "G1000 glass panel, turbo-normalized. Great load hauler for family trips.",
      },
    });
    summary.aircraft = 3;

    // ─── Maintenance / squawks ───
    await tx.maintenance.create({
      data: {
        id: uuid(),
        organizationId: org.id,
        clubAircraftId: c172.id,
        reportedByPilotId: pilotProfileId,
        description: "Right brake spongy on runup",
        status: "NEEDED",
        maintenanceType: "CLUB",
        category: "Airframe",
        severity: "MEDIUM",
        isGrounded: false,
        reportedDate: daysFromNow(-3),
      },
    });
    await tx.maintenance.create({
      data: {
        id: uuid(),
        organizationId: org.id,
        clubAircraftId: c172.id,
        reportedByPilotId: pilotProfileId,
        description: "EGT gauge intermittent",
        status: "NEEDED",
        maintenanceType: "CLUB",
        category: "Avionics",
        severity: "LOW",
        isGrounded: false,
        reportedDate: daysFromNow(-8),
      },
    });
    await tx.maintenance.create({
      data: {
        id: uuid(),
        organizationId: org.id,
        clubAircraftId: c182.id,
        reportedByPilotId: pilotProfileId,
        description: "Nose strut leaking hydraulic fluid — do not fly",
        status: "NEEDED",
        maintenanceType: "CLUB",
        category: "Airframe",
        severity: "HIGH",
        isGrounded: true,
        reportedDate: daysFromNow(-1),
      },
    });
    await tx.maintenance.create({
      data: {
        id: uuid(),
        organizationId: org.id,
        clubAircraftId: archer.id,
        reportedByPilotId: pilotProfileId,
        description: "Routine oil change and filter",
        status: "COMPLETED",
        maintenanceType: "CLUB",
        category: "Oil",
        severity: "LOW",
        isGrounded: false,
        reportedDate: daysFromNow(-75),
        resolvedDate: daysFromNow(-74),
        cost: "240.00",
      },
    });
    await tx.maintenance.create({
      data: {
        id: uuid(),
        organizationId: org.id,
        clubAircraftId: c172.id,
        reportedByPilotId: pilotProfileId,
        description: "Left magneto replacement after intermittent mag drop",
        status: "COMPLETED",
        maintenanceType: "CLUB",
        category: "Engine",
        severity: "HIGH",
        isGrounded: false,
        reportedDate: daysFromNow(-50),
        resolvedDate: daysFromNow(-46),
        cost: "1850.00",
      },
    });
    await tx.maintenance.create({
      data: {
        id: uuid(),
        organizationId: org.id,
        clubAircraftId: c182.id,
        reportedByPilotId: pilotProfileId,
        description: "Nose tire worn beyond limits, replaced",
        status: "COMPLETED",
        maintenanceType: "CLUB",
        category: "Airframe",
        severity: "LOW",
        isGrounded: false,
        reportedDate: daysFromNow(-20),
        resolvedDate: daysFromNow(-19),
        cost: "95.00",
      },
    });
    summary.maintenance = 6;

    // ─── Flight logs (~10 across 60 days) ───
    type FlightSpec = {
      aircraft: typeof c172;
      rate: number;
      hobbsStart: number;
      hours: number;
      daysAgo: number;
    };
    const flightSpecs: FlightSpec[] = [
      { aircraft: c172, rate: 145, hobbsStart: 4180.0, hours: 1.4, daysAgo: 58 },
      { aircraft: c172, rate: 145, hobbsStart: 4181.4, hours: 1.1, daysAgo: 49 },
      { aircraft: c172, rate: 145, hobbsStart: 4182.5, hours: 2.0, daysAgo: 40 },
      { aircraft: c172, rate: 145, hobbsStart: 4184.5, hours: 1.3, daysAgo: 25 },
      { aircraft: c172, rate: 145, hobbsStart: 4185.8, hours: 1.5, daysAgo: 9 },
      { aircraft: archer, rate: 155, hobbsStart: 6788.0, hours: 3.2, daysAgo: 55 },
      { aircraft: archer, rate: 155, hobbsStart: 6791.2, hours: 2.1, daysAgo: 33 },
      { aircraft: archer, rate: 155, hobbsStart: 6793.3, hours: 1.8, daysAgo: 14 },
      { aircraft: c182, rate: 210, hobbsStart: 2294.0, hours: 2.5, daysAgo: 44 },
      { aircraft: c182, rate: 210, hobbsStart: 2296.5, hours: 1.6, daysAgo: 6 },
    ];
    for (const f of flightSpecs) {
      const hobbsEnd = Math.round((f.hobbsStart + f.hours) * 10) / 10;
      const tachTime = Math.round((f.hours * 0.97) * 10) / 10;
      const cost = Math.round(f.hours * f.rate * 100) / 100;
      await tx.flightLog.create({
        data: {
          id: uuid(),
          organizationId: org.id,
          clubAircraftId: f.aircraft.id,
          pilotProfileId,
          date: daysFromNow(-f.daysAgo, 14, 30),
          hobbsStart: f.hobbsStart.toFixed(1),
          hobbsEnd: hobbsEnd.toFixed(1),
          hobbsTime: f.hours.toFixed(1),
          tachTime: tachTime.toFixed(1),
          calculatedCost: cost.toFixed(2),
          notes: "Demo flight log entry.",
        },
      });
    }
    summary.flightLogs = flightSpecs.length;

    // ─── Bookings: 3 upcoming + 2 past ───
    const bookingSpecs = [
      {
        aircraft: c172,
        start: daysFromNow(2, 9, 0),
        hours: 2,
        purpose: "Local VFR practice",
      },
      {
        aircraft: c172,
        start: daysFromNow(4, 13, 0),
        hours: 2,
        purpose: "BFR with CFI",
      },
      {
        aircraft: archer,
        start: daysFromNow(8, 8, 0),
        hours: 2,
        purpose: "Cross-country KPTK→KTVC",
      },
      {
        aircraft: c172,
        start: daysFromNow(-10, 10, 0),
        hours: 2,
        purpose: "Local VFR practice",
      },
      {
        aircraft: archer,
        start: daysFromNow(-20, 9, 0),
        hours: 2,
        purpose: "Cross-country KPTK→KTVC",
      },
    ];
    for (const b of bookingSpecs) {
      const end = new Date(b.start.getTime() + b.hours * 60 * 60 * 1000);
      await tx.booking.create({
        data: {
          id: uuid(),
          organizationId: org.id,
          clubAircraftId: b.aircraft.id,
          pilotProfileId,
          startTime: b.start,
          endTime: end,
          purpose: b.purpose,
        },
      });
    }
    summary.bookings = bookingSpecs.length;

    // ─── BlockOuts ───
    const annualStart = daysFromNow(5, 0, 0);
    const annualEnd = daysFromNow(8, 0, 0);
    await tx.blockOut.create({
      data: {
        organizationId: org.id,
        clubAircraftId: archer.id,
        title: "Annual inspection",
        startTime: annualStart,
        endTime: annualEnd,
      },
    });
    const closureStart = daysFromNow(14, 0, 0);
    const closureEnd = daysFromNow(15, 0, 0);
    await tx.blockOut.create({
      data: {
        organizationId: org.id,
        clubAircraftId: null,
        title: "Field closed — Airport pavement work",
        startTime: closureStart,
        endTime: closureEnd,
      },
    });
    summary.blockOuts = 2;

    // ─── Organization posts ───
    await tx.organizationPost.create({
      data: {
        organizationId: org.id,
        authorId: owner.id,
        title: "Welcome to Oakland County Flyers!",
        content:
          "Welcome to the club! Take a look through the aircraft tab to see our fleet, " +
          "and reach out if you have any questions about scheduling, checkouts, or " +
          "billing. Blue skies!",
        pinned: true,
      },
    });
    await tx.organizationPost.create({
      data: {
        organizationId: org.id,
        authorId: owner.id,
        title: "Fuel prices updated at the field",
        content: "100LL is now $6.45/gal at the self-serve pump. Please log fuel purchases in the app.",
        pinned: false,
      },
    });
    await tx.organizationPost.create({
      data: {
        organizationId: org.id,
        authorId: owner.id,
        title: "182 grounded — strut repair scheduled",
        content:
          "N9142T is grounded for a leaking nose strut. Maintenance has been scheduled; " +
          "we'll update here once it's back in service.",
        pinned: false,
      },
    });
    summary.posts = 3;

    // ─── Invite ───
    await tx.invite.create({
      data: {
        groupId: org.id,
        token: crypto.randomBytes(24).toString("hex"),
        email: "demo-invitee@example.com",
        role: "pilot",
        createdBy: owner.id,
        expiresAt: daysFromNow(14),
      },
    });
    summary.invites = 1;

    // ─── Fuel expenses (tied to past flight logs) ───
    const pastLogs = await tx.flightLog.findMany({
      where: { organizationId: org.id },
      orderBy: { date: "asc" },
      take: 2,
    });
    if (pastLogs[0]) {
      await tx.fuelExpense.create({
        data: {
          id: uuid(),
          organizationId: org.id,
          clubAircraftId: pastLogs[0].clubAircraftId,
          pilotProfileId,
          flightLogId: pastLogs[0].id,
          gallons: "12.50",
          pricePerGallon: "6.45",
          totalCost: (12.5 * 6.45).toFixed(2),
          status: "PENDING",
        },
      });
    }
    if (pastLogs[1]) {
      await tx.fuelExpense.create({
        data: {
          id: uuid(),
          organizationId: org.id,
          clubAircraftId: pastLogs[1].clubAircraftId,
          pilotProfileId,
          flightLogId: pastLogs[1].id,
          gallons: "15.00",
          pricePerGallon: "6.30",
          totalCost: (15 * 6.3).toFixed(2),
          status: "APPROVED",
          approvedBy: owner.id,
          approvedAt: now,
        },
      });
    }
    summary.fuelExpenses = pastLogs.length;

    return { orgId: org.id, memberId: member.id };
  }, { timeout: 60000, maxWait: 20000 });

  console.log("\n=== Demo club seeded successfully ===");
  console.log(`Organization: ${CLUB_NAME}`);
  console.log(`Organization id: ${result.orgId}`);
  console.log(`Owner: ${owner.email} (id: ${owner.id})`);
  console.log(`Pilot profile: ${pilotProfileId}${createdPilotProfile ? " (newly created)" : " (existing)"}`);
  console.log("\nCounts:");
  console.log(`  Organization:        ${summary.organization}`);
  console.log(`  OrganizationMember:  ${summary.organizationMember}`);
  console.log(`  ClubAircraft:        ${summary.aircraft}`);
  console.log(`  Maintenance:         ${summary.maintenance}`);
  console.log(`  FlightLog:           ${summary.flightLogs}`);
  console.log(`  Booking:             ${summary.bookings}`);
  console.log(`  BlockOut:            ${summary.blockOuts}`);
  console.log(`  OrganizationPost:    ${summary.posts}`);
  console.log(`  Invite:              ${summary.invites}`);
  console.log(`  FuelExpense:         ${summary.fuelExpenses}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
