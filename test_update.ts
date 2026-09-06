import { prisma } from './backend/src/shared/database/prisma-client.js';
async function run() {
  const deliveryOnlyIds = ["8232029880205"];
  const count = await prisma.message.count({
    where: {
      zaloMsgId: { in: deliveryOnlyIds },
      senderType: 'self',
      deliveredAt: null,
      seenAt: null,
    }
  });
  console.log('Count matches:', count);
}
run();
