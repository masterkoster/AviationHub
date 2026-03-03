import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

function generateDisplayId() {
  return `LOG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}

export async function getOrCreatePilotProfile(userId: string) {
  return prisma.pilotProfile.upsert({
    where: { userId },
    update: {},
    create: { userId, displayId: generateDisplayId() },
  })
}
