import { prisma } from './backend/src/shared/database/prisma-client.js';
prisma.message.findMany({
  where: { contentType: 'video' },
  orderBy: { createdAt: 'desc' },
  take: 1
}).then(console.log).finally(() => prisma.$disconnect());
