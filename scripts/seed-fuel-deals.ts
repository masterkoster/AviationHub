/**
 * Seed a few clearly-labeled SAMPLE fuel deals so the Deals strip has something
 * to render before real deals exist. These use NO real brand names — inventing a
 * real company's promotion would be fabricating their offer. Replace with real,
 * sourced deals (set brand, isSample=0) once a partner/data source exists.
 *
 * Idempotent: wipes existing sample rows (isSample=1) and re-inserts.
 * Run:  npx tsx scripts/seed-fuel-deals.ts
 */
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type Deal = {
  title: string
  dealType: 'AVGAS' | 'CAR_GAS' | 'OTHER'
  icao: string | null
  region: string | null
  description: string | null
  discountText: string | null
  url: string | null
  endsInDays: number | null
}

const SAMPLES: Deal[] = [
  {
    title: '[Sample] Avgas loyalty discount',
    dealType: 'AVGAS', icao: null, region: null,
    description: 'Example placeholder deal — replace with a real, sourced offer.',
    discountText: '$0.35/gal off 100LL', url: null, endsInDays: null,
  },
  {
    title: '[Sample] Weekend self-serve special',
    dealType: 'AVGAS', icao: 'KPAO', region: null,
    description: 'Example airport-specific deal — shown when browsing this airport.',
    discountText: '$0.50/gal off self-serve 100LL', url: null, endsInDays: 30,
  },
  {
    title: '[Sample] Fuel rewards at the pump',
    dealType: 'CAR_GAS', icao: null, region: null,
    description: 'Example car-gas deal — brand rewards program placeholder.',
    discountText: '10¢/gal off car gas', url: null, endsInDays: 60,
  },
]

async function main() {
  await prisma.$executeRaw`DELETE FROM [FuelDeal] WHERE [isSample] = 1`
  for (const d of SAMPLES) {
    const id = randomUUID()
    const endsAt = d.endsInDays != null ? new Date(Date.now() + d.endsInDays * 86400000) : null
    await prisma.$executeRaw`
      INSERT INTO [FuelDeal]
        ([id],[title],[brand],[dealType],[icao],[region],[description],[discountText],[url],[startsAt],[endsAt],[isActive],[isSample],[createdAt])
      VALUES
        (${id}, ${d.title}, NULL, ${d.dealType}, ${d.icao}, ${d.region}, ${d.description}, ${d.discountText}, ${d.url}, NULL, ${endsAt}, 1, 1, GETDATE())`
  }
  const n = await prisma.$queryRaw<Array<{ c: number }>>`SELECT COUNT(*) AS c FROM [FuelDeal]`
  console.log(`Seeded ${SAMPLES.length} sample deals. Total FuelDeal rows: ${Number(n[0].c)}`)
}

main().catch((e) => { console.error('SEED FAIL:', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
