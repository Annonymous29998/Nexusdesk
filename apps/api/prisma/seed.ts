import { PrismaClient, UserRole } from '@prisma/client';
import { hashPassword } from '@nexusdesk/utils';
import { DEFAULT_ORGANIZATION_SETTINGS } from '@nexusdesk/shared';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@nexusdesk.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const orgName = process.env.SEED_ORG_NAME ?? 'NexusDesk';
  const orgSlug = (process.env.SEED_ORG_SLUG ?? 'nexusdesk').toLowerCase();
  const displayName = process.env.SEED_ADMIN_NAME ?? 'Administrator';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists — nothing to do.`);
    return;
  }

  const hashed = hashPassword(password);

  // Reuse an org with this slug if one already exists, otherwise create it.
  let org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: orgName,
        slug: orgSlug,
        settings: { ...DEFAULT_ORGANIZATION_SETTINGS },
        plan: 'business',
        maxDevices: 100,
        maxSeats: 50,
      },
    });
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      displayName,
      role: UserRole.owner,
      organizationId: org.id,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });

  await prisma.organization.update({
    where: { id: org.id },
    data: { ownerUserId: user.id },
  });

  await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: user.id, role: UserRole.owner },
  });

  console.log('Seeded admin owner:');
  console.log(`  email: ${email}`);
  console.log(`  org slug: ${orgSlug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
