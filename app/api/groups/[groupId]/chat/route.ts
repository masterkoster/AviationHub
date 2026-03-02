import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;

    // Get user by email
    const userEmail = session.user.email;
    const users = await prisma.$queryRaw`SELECT id, name FROM [User] WHERE email = ${userEmail}` as any[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = users[0].id;

    // Check membership using Prisma
    const membership = await prisma.organizationMember.findFirst({
      where: { userId, organizationId: groupId }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
    }

    // Fetch messages with user info using raw SQL
    const messages = await prisma.$queryRawUnsafe(`
      SELECT 
        gcm.id,
        gcm.organizationId,
        gcm.senderId,
        gcm.message,
        gcm.createdAt,
        u.name as userName
      FROM GroupChatMessage gcm
      LEFT JOIN [User] u ON gcm.senderId = u.id
      WHERE gcm.organizationId = '${groupId}'
      ORDER BY gcm.createdAt ASC
      OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY
    `) as any[];

    // Transform messages
    const colors = ['bg-primary', 'bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500'];
    
    const transformedMessages = (messages || []).map((msg: any) => {
      const userName = msg.userName || 'Unknown';
      const initials = userName 
        ? userName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
        : '??';
      
      const colorIndex = msg.senderId.charCodeAt(0) % colors.length;
      
      return {
        id: msg.id,
        groupId: msg.organizationId,
        userId: msg.senderId,
        user: {
          name: userName,
          initials,
          color: colors[colorIndex]
        },
        message: msg.message,
        timestamp: msg.createdAt
      };
    });

    return NextResponse.json(transformedMessages);
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const body = await request.json();
    const { message } = body;

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Get user by email
    const userEmail = session.user.email;
    const users = await prisma.$queryRaw`SELECT id, name FROM [User] WHERE email = ${userEmail}` as any[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = users[0].id;
    const userName = users[0].name;

    // Check membership using Prisma
    const membership = await prisma.organizationMember.findFirst({
      where: { userId, organizationId: groupId }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
    }

    // Create message using Prisma
    const newMessage = await prisma.groupChatMessage.create({
      data: {
        organizationId: groupId,
        senderId: userId,
        message: message.trim()
      }
    });

    // Generate response
    const initials = userName 
      ? userName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
      : '??';
    
    const colors = ['bg-primary', 'bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500'];
    const colorIndex = userId.charCodeAt(0) % colors.length;

    const response = {
      id: newMessage.id,
      groupId: newMessage.organizationId,
      userId: newMessage.senderId,
      user: {
        name: userName || 'Unknown',
        initials,
        color: colors[colorIndex]
      },
      message: newMessage.message,
      timestamp: newMessage.createdAt
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error sending chat message:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
