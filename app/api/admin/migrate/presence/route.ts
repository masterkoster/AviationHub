import { NextResponse } from 'next/server';
import { auth, prisma } from '@/lib/auth';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Only admins/owners can run migrations
    if (session.user.role !== 'admin' && session.user.role !== 'owner') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    // Create UserPresence table if it doesn't exist
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UserPresence')
      BEGIN
        CREATE TABLE [UserPresence] (
          [id] NVARCHAR(36) NOT NULL PRIMARY KEY,
          [userId] NVARCHAR(36) NOT NULL UNIQUE,
          [isOnline] BIT NOT NULL DEFAULT 0,
          [lastSeenAt] DATETIME NOT NULL DEFAULT GETDATE(),
          [updatedAt] DATETIME NOT NULL DEFAULT GETDATE()
        );
        CREATE NONCLUSTERED INDEX [IX_UserPresence_isOnline] ON [UserPresence]([isOnline]);
      END
    `);

    return NextResponse.json({ success: true, message: 'UserPresence table ready' });
  } catch (error) {
    console.error('Migration failed', error);
    return NextResponse.json({ error: 'Migration failed' }, { status: 500 });
  }
}
