const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const email = 'testpilot99@test.com';
  const user = await prisma.user.update({
    where: { email },
    data: { role: 'admin' },
  });
  console.log('Updated role to admin for:', user.email, '(', user.id, ')');
}

main().catch(console.error).finally(() => process.exit());