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

    const results: string[] = [];

    // Create UserPresence table if it doesn't exist
    try {
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
      results.push('UserPresence table created');
    } catch (e: any) {
      results.push(`UserPresence: ${e.message}`);
    }

    // Add image column to User if it doesn't exist
    try {
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH('[User]', 'image') IS NULL
          ALTER TABLE [User] ADD image NVARCHAR(500) NULL;
      `);
      results.push('User.image column added');
    } catch (e: any) {
      results.push(`User.image: ${e.message}`);
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Migration failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
