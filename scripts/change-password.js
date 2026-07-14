const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const email = 'crunchyforwatch@gmail.com';
  const hash = await bcrypt.hash('Password123!', 10);
  const user = await prisma.user.update({
    where: { email },
    data: { password: hash },
  });
  console.log('Updated password for:', user.email, '(', user.id, ')');
}

main().catch(console.error).finally(() => process.exit());