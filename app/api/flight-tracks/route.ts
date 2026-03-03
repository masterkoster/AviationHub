import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface TrackPoint {
  lat: number;
  lng: number;
  alt?: number;
  speed?: number;
  timestamp: string;
}

// Helper to get pilotProfileId from user session
async function getPilotProfileId(userId: string) {
  const pilotProfile = await prisma.pilotProfile.findUnique({
    where: { userId },
  });
  return pilotProfile?.id || null;
}

// GET - Fetch user's flight tracks (list or single track with full data)
export async function GET(request: Request) {
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);
    const trackId = searchParams.get('id');
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user has Pro+ tier
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tier: true }
    });

    if (user?.tier !== 'proplus') {
      return NextResponse.json({ 
        error: 'Pro+ subscription required',
        code: 'PROPLUS_REQUIRED'
      }, { status: 403 });
    }

    const pilotProfileId = await getPilotProfileId(session.user.id);
    if (!pilotProfileId) {
      return NextResponse.json({ tracks: [] });
    }

    // If requesting a specific track, return full data
    if (trackId) {
      const track = await prisma.flightTrack.findFirst({
        where: { id: trackId, pilotProfileId },
      });

      if (!track) {
        return NextResponse.json({ error: 'Track not found' }, { status: 404 });
      }

      return NextResponse.json({ track });
    }

    // Otherwise return list of tracks
    const tracks = await prisma.flightTrack.findMany({
      where: { pilotProfileId },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        name: true,
        date: true,
        aircraft: true,
        totalDistance: true,
        maxAltitude: true,
        maxSpeed: true,
        duration: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ tracks });
  } catch (error) {
    console.error('Error fetching flight tracks:', error);
    return NextResponse.json({ error: 'Failed to fetch tracks' }, { status: 500 });
  }
}

// POST - Save a new flight track
export async function POST(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user has Pro+ tier
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tier: true, emailVerified: true }
    });

    if (!user?.emailVerified) {
      return NextResponse.json({ 
        error: 'Please verify your email first',
        code: 'EMAIL_NOT_VERIFIED'
      }, { status: 403 });
    }

    if (user?.tier !== 'proplus') {
      return NextResponse.json({ 
        error: 'Pro+ subscription required',
        code: 'PROPLUS_REQUIRED'
      }, { status: 403 });
    }

    // Get or create pilot profile
    const pilotProfile = await prisma.pilotProfile.upsert({
      where: { userId: session.user.id },
      update: {},
      create: { userId: session.user.id },
    });

    const body = await request.json();
    
    const { name, date, aircraft, trackData } = body;

    if (!trackData || !Array.isArray(trackData) || trackData.length < 2) {
      return NextResponse.json({ error: 'Valid track data required (at least 2 points)' }, { status: 400 });
    }

    // Calculate statistics from track data
    let totalDistance = 0;
    let maxAltitude = 0;
    let maxSpeed = 0;

    for (let i = 1; i < trackData.length; i++) {
      const prev = trackData[i - 1];
      const curr = trackData[i];
      
      // Calculate distance using Haversine formula (in nautical miles)
      const R = 3440.065; // Earth radius in NM
      const dLat = (curr.lat - prev.lat) * Math.PI / 180;
      const dLng = (curr.lng - prev.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(prev.lat * Math.PI / 180) * Math.cos(curr.lat * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      totalDistance += R * c;

      // Track max altitude
      if (curr.alt && curr.alt > maxAltitude) {
        maxAltitude = curr.alt;
      }

      // Track max speed
      if (curr.speed && curr.speed > maxSpeed) {
        maxSpeed = curr.speed;
      }
    }

    // Calculate duration in minutes
    let duration = 0;
    if (trackData.length > 1) {
      const firstTime = new Date(trackData[0].timestamp).getTime();
      const lastTime = new Date(trackData[trackData.length - 1].timestamp).getTime();
      duration = (lastTime - firstTime) / 60000; // Convert ms to minutes
    }

    const track = await prisma.flightTrack.create({
      data: {
        pilotProfileId: pilotProfile.id,
        name: name || 'Flight Track',
        date: date ? new Date(date) : new Date(),
        aircraft: aircraft || 'Unknown',
        trackData: JSON.stringify(trackData),
        totalDistance: Math.round(totalDistance * 10) / 10,
        maxAltitude: Math.round(maxAltitude),
        maxSpeed: Math.round(maxSpeed),
        duration: Math.round(duration),
      },
    });

    return NextResponse.json({ track, message: 'Track saved' });
  } catch (error) {
    console.error('Error saving flight track:', error);
    return NextResponse.json({ error: 'Failed to save track' }, { status: 500 });
  }
}

// DELETE - Delete a flight track
export async function DELETE(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Track ID required' }, { status: 400 });
    }

    const pilotProfileId = await getPilotProfileId(session.user.id);
    if (!pilotProfileId) {
      return NextResponse.json({ error: 'Pilot profile not found' }, { status: 404 });
    }

    await prisma.flightTrack.deleteMany({
      where: { id, pilotProfileId },
    });

    return NextResponse.json({ message: 'Track deleted' });
  } catch (error) {
    console.error('Error deleting flight track:', error);
    return NextResponse.json({ error: 'Failed to delete track' }, { status: 500 });
  }
}
