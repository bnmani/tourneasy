/**
 * Makes an existing account an owner (D78). The first owner can't be made from the website,
 * so this runs on the server or against the database:
 *
 *   pnpm --filter @tourneasy/db owner:grant someone@example.com
 *
 * Further owners are granted by an owner on the users page. Logged like any role change.
 */
import { PrismaClient } from '@prisma/client';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Usage: owner:grant <email of an existing account>');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null, anonymisedAt: null },
    select: { id: true, name: true, totpEnabledAt: true },
  });
  if (!user) {
    console.error(`No account with ${email}.`);
    process.exit(1);
  }
  const created = await prisma.userRole.createMany({
    data: [{ userId: user.id, role: 'OWNER' }],
    skipDuplicates: true,
  });
  if (created.count) {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        action: 'user.role.grant',
        entityType: 'User',
        entityId: user.id,
        after: { role: 'OWNER', via: 'owner:grant' },
      },
    });
    console.log(`${user.name} <${email}> is now an owner.`);
  } else {
    console.log(`${user.name} <${email}> was already an owner.`);
  }
  if (!user.totpEnabledAt)
    console.log('Next login: set up two-step login first (Account → Beveiliging).');
} finally {
  await prisma.$disconnect();
}
