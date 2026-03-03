import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/training/financials - Get user's training financials
export async function GET() {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get pilot profile for the user
    const pilotProfile = await prisma.pilotProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })

    if (!pilotProfile) {
      return NextResponse.json({
        aircraftRate: 0,
        instructorRate: 0,
        checkrideFee: 0,
        examFees: 0,
        medicalFee: 0,
        monthlyDues: 0,
        equipmentCost: 0,
        flightsPerMonth: 0,
        avgFlightHours: 0,
      })
    }

    const financials = await prisma.trainingFinancials.findUnique({
      where: { pilotProfileId: pilotProfile.id }
    })
    
    return NextResponse.json(financials || {
      aircraftRate: 0,
      instructorRate: 0,
      checkrideFee: 0,
      examFees: 0,
      medicalFee: 0,
      monthlyDues: 0,
      equipmentCost: 0,
      flightsPerMonth: 0,
      avgFlightHours: 0,
    })
  } catch (error) {
    console.error('Error fetching financials:', error)
    return NextResponse.json({ error: 'Failed to fetch financials' }, { status: 500 })
  }
}

// POST /api/training/financials - Update training financials
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get or create pilot profile
    const pilotProfile = await prisma.pilotProfile.upsert({
      where: { userId: session.user.id },
      update: {},
      create: { userId: session.user.id },
    })

    const body = await request.json()
    const { 
      aircraftRate, 
      instructorRate, 
      checkrideFee, 
      examFees, 
      medicalFee, 
      monthlyDues,
      equipmentCost,
      flightsPerMonth,
      avgFlightHours 
    } = body
    
    const financials = await prisma.trainingFinancials.upsert({
      where: { pilotProfileId: pilotProfile.id },
      update: {
        aircraftRate: aircraftRate ? parseFloat(aircraftRate) : 0,
        instructorRate: instructorRate ? parseFloat(instructorRate) : 0,
        checkrideFee: checkrideFee ? parseFloat(checkrideFee) : 0,
        examFees: examFees ? parseFloat(examFees) : 0,
        medicalFee: medicalFee ? parseFloat(medicalFee) : 0,
        monthlyDues: monthlyDues ? parseFloat(monthlyDues) : 0,
        equipmentCost: equipmentCost ? parseFloat(equipmentCost) : 0,
        flightsPerMonth: flightsPerMonth ? parseInt(flightsPerMonth) : 0,
        avgFlightHours: avgFlightHours ? parseFloat(avgFlightHours) : 0,
      },
      create: {
        pilotProfileId: pilotProfile.id,
        aircraftRate: aircraftRate ? parseFloat(aircraftRate) : 0,
        instructorRate: instructorRate ? parseFloat(instructorRate) : 0,
        checkrideFee: checkrideFee ? parseFloat(checkrideFee) : 0,
        examFees: examFees ? parseFloat(examFees) : 0,
        medicalFee: medicalFee ? parseFloat(medicalFee) : 0,
        monthlyDues: monthlyDues ? parseFloat(monthlyDues) : 0,
        equipmentCost: equipmentCost ? parseFloat(equipmentCost) : 0,
        flightsPerMonth: flightsPerMonth ? parseInt(flightsPerMonth) : 0,
        avgFlightHours: avgFlightHours ? parseFloat(avgFlightHours) : 0,
      }
    })
    
    return NextResponse.json(financials)
  } catch (error) {
    console.error('Error updating financials:', error)
    return NextResponse.json({ error: 'Failed to update financials' }, { status: 500 })
  }
}
