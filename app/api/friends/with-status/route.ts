import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get accepted friend requests
    const friendRequests = await prisma.friendRequest.findMany({
      where: {
        status: 'accepted',
        OR: [
          { requesterId: userId },
          { recipientId: userId },
        ],
      },
      include: {
        requester: {
          select: { id: true, name: true, username: true, image: true },
        },
        recipient: {
          select: { id: true, name: true, username: true, image: true },
        },
      },
    });

    // Transform to get friend user objects
    const friendUsers = friendRequests.map(f => 
      f.requesterId === userId ? f.recipient : f.requester
    );

    // Get online status for all friends
    const friendIds = friendUsers.map(u => u.id);
    
    let onlineStatusMap: Record<string, { isOnline: boolean; lastSeenAt: Date | null }> = {};
    
    try {
      // First get pilot profiles for friends
      const pilotProfiles = await prisma.pilotProfile.findMany({
        where: { userId: { in: friendIds } },
        select: {
          id: true,
          userId: true,
        },
      });

      const pilotProfileIds = pilotProfiles.map(p => p.id);
      const userIdByPilotProfile = new Map(pilotProfiles.map(p => [p.id, p.userId]));

      // Get all presences for friends using pilotProfileId
      const allPresences = await prisma.userPresence.findMany({
        where: { pilotProfileId: { in: pilotProfileIds } },
        select: {
          pilotProfileId: true,
          isOnline: true,
          lastSeenAt: true,
        },
      });

      for (const p of allPresences) {
        const friendUserId = userIdByPilotProfile.get(p.pilotProfileId || '');
        if (friendUserId) {
          onlineStatusMap[friendUserId] = {
            isOnline: p.isOnline,
            lastSeenAt: p.lastSeenAt,
          };
        }
      }
    } catch (e) {
      // Table doesn't exist yet
      console.warn('UserPresence table not ready');
    }

    // Get pilot profiles for friends (home airport info)
    const profiles = await prisma.pilotProfile.findMany({
      where: { userId: { in: friendIds } },
      select: {
        userId: true,
        homeAirport: true,
      },
    });

    const profileMap: Record<string, { homeAirport: string | null }> = {};
    for (const p of profiles) {
      profileMap[p.userId] = { homeAirport: p.homeAirport };
    }

    // Build response
    const friendsWithStatus = friendUsers.map(user => {
      const status = onlineStatusMap[user.id] || { isOnline: false, lastSeenAt: null };
      const profile = profileMap[user.id] || { homeAirport: null };
      
      return {
        id: user.id,
        name: user.name,
        username: user.username,
        image: user.image,
        homeAirport: profile.homeAirport,
        isOnline: status.isOnline,
        lastSeenAt: status.lastSeenAt,
      };
    });

    // Sort: online first, then by name
    friendsWithStatus.sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return (a.name || a.username || '').localeCompare(b.name || b.username || '');
    });

    return NextResponse.json({ friends: friendsWithStatus });
  } catch (error) {
    console.error('Friends with presence GET failed', error);
    return NextResponse.json({ error: 'Failed to load friends' }, { status: 500 });
  }
}
