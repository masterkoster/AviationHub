import { prisma } from '@/lib/prisma'

export async function getOrCreatePilotProfile(userId: string) {
  return prisma.pilotProfile.upsert({
    where: { userId },
    update: {},
    create: { userId },
  })
}
