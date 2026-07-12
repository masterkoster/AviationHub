import { Connection, Request } from 'tedious';

const config = {
  server: 'aviation-server-dk.database.windows.net',
  authentication: { type: 'default', options: { userName: 'CloudSA183a5780', password: 'Password123' } },
  options: { database: 'aviation_db', encrypt: true, trustServerCertificate: false, port: 1433 },
};

const STATEMENTS = [
  `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='User' AND COLUMN_NAME='username')
   ALTER TABLE [User] ADD username NVARCHAR(50) NULL`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_User_username' AND object_id=OBJECT_ID('[User]'))
   CREATE UNIQUE INDEX [IX_User_username] ON [User] (username) WHERE username IS NOT NULL`,

  `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='UserKey')
   CREATE TABLE [UserKey] (
     [id]            NVARCHAR(36)  NOT NULL DEFAULT NEWID(),
     [userId]        NVARCHAR(36)  NOT NULL,
     [encryptionKey] NVARCHAR(MAX) NOT NULL,
     [createdAt]     DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
     CONSTRAINT [PK_UserKey] PRIMARY KEY ([id]),
     CONSTRAINT [FK_UserKey_User] FOREIGN KEY ([userId]) REFERENCES [User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
   )`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_UserKey_userId' AND object_id=OBJECT_ID('[UserKey]'))
   CREATE INDEX [IX_UserKey_userId] ON [UserKey] ([userId])`,
];

const conn = new Connection(config);

conn.on('connect', (err) => {
  if (err) { console.error('Connection failed:', err.message); process.exit(1); }
  console.log('Connected to Azure SQL\n');
  runNext(0);
});

function runNext(i) {
  if (i >= STATEMENTS.length) {
    console.log('\nMigration complete.');
    conn.close();
    return;
  }
  const req = new Request(STATEMENTS[i], (err) => {
    if (err) console.error(`[${i + 1}/${STATEMENTS.length}] ERROR: ${err.message}`);
    else console.log(`[${i + 1}/${STATEMENTS.length}] OK`);
    runNext(i + 1);
  });
  conn.execSql(req);
}

conn.connect();
