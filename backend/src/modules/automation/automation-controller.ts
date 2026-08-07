import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export async function getSequences(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;

    const sequences = await prisma.automationSequence.findMany({
      where: { orgId },
      include: {
        sequenceSteps: {
          orderBy: { stepOrder: 'asc' },
          include: { block: true }
        },
        _count: {
          select: { sequenceSteps: true, campaigns: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send(sequences);
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi lấy danh sách AutomationSequence');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

export async function getSequenceDetail(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const { id } = request.params as { id: string };

    const sequence = await prisma.automationSequence.findFirst({
      where: { id, orgId },
      include: {
        sequenceSteps: {
          orderBy: { stepOrder: 'asc' },
          include: { block: true }
        }
      }
    });

    if (!sequence) {
      return reply.status(404).send({ error: 'Kịch bản không tồn tại' });
    }

    return reply.send(sequence);
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi lấy chi tiết AutomationSequence');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

export async function createSequence(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const { name, description, steps } = request.body as {
      name: string;
      description?: string;
      steps?: Array<{ blockId: string; delayMinutes: number }>;
    };

    if (!name) {
      return reply.status(400).send({ error: 'Tên kịch bản không được để trống' });
    }

    const newSeq = await prisma.automationSequence.create({
      data: {
        orgId,
        name,
        description,
        enabled: true,
        createdById: request.user!.id,
        ...(steps && steps.length > 0 && {
          sequenceSteps: {
            create: steps.map((step, idx) => ({
              blockId: step.blockId,
              stepOrder: idx,
              delayMinutes: step.delayMinutes || 0
            }))
          }
        })
      },
      include: {
        sequenceSteps: {
          orderBy: { stepOrder: 'asc' },
          include: { block: true }
        }
      }
    });

    return reply.status(201).send(newSeq);
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi tạo AutomationSequence');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

export async function updateSequence(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const { id } = request.params as { id: string };
    const { name, description, enabled } = request.body as any;

    const existing = await prisma.automationSequence.findFirst({
      where: { id, orgId }
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Kịch bản không tồn tại' });
    }

    const updated = await prisma.automationSequence.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(enabled !== undefined && { enabled })
      }
    });

    return reply.send(updated);
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi cập nhật AutomationSequence');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

export async function addSequenceStep(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const { id: sequenceId } = request.params as { id: string };
    const { blockId, delayMinutes } = request.body as { blockId: string; delayMinutes?: number };

    const sequence = await prisma.automationSequence.findFirst({
      where: { id: sequenceId, orgId },
      include: { sequenceSteps: true }
    });

    if (!sequence) {
      return reply.status(404).send({ error: 'Kịch bản không tồn tại' });
    }

    const nextOrder = sequence.sequenceSteps.length;

    const step = await prisma.sequenceStep.create({
      data: {
        sequenceId,
        blockId: blockId || null,
        stepOrder: nextOrder,
        delayMinutes: delayMinutes || 0
      },
      include: { block: true }
    });

    return reply.status(201).send(step);
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi thêm bước vào Kịch bản');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

export async function deleteSequenceStep(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const { id: sequenceId, stepId } = request.params as { id: string; stepId: string };

    const step = await prisma.sequenceStep.findFirst({
      where: { id: stepId, sequenceId, sequence: { orgId } }
    });

    if (!step) {
      return reply.status(404).send({ error: 'Bước kịch bản không tồn tại' });
    }

    await prisma.sequenceStep.delete({ where: { id: stepId } });

    // Re-order remaining steps
    const remaining = await prisma.sequenceStep.findMany({
      where: { sequenceId },
      orderBy: { stepOrder: 'asc' }
    });

    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].stepOrder !== i) {
        await prisma.sequenceStep.update({
          where: { id: remaining[i].id },
          data: { stepOrder: i }
        });
      }
    }

    return reply.send({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi xóa bước khỏi Kịch bản');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

export async function enrollContact(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const { id: sequenceId } = request.params as { id: string };
    const { contactId, friendId } = request.body as { contactId?: string; friendId?: string };

    if (!contactId && !friendId) {
      return reply.status(400).send({ error: 'Thiếu contactId hoặc friendId' });
    }

    const sequence = await prisma.automationSequence.findFirst({
      where: { id: sequenceId, orgId },
      include: {
        sequenceSteps: {
          orderBy: { stepOrder: 'asc' }
        }
      }
    });

    if (!sequence || !sequence.enabled) {
      return reply.status(400).send({ error: 'Kịch bản không tồn tại hoặc đã bị tắt' });
    }

    if (!sequence.sequenceSteps || sequence.sequenceSteps.length === 0) {
      return reply.status(400).send({ error: 'Kịch bản chưa có bước (step) nào' });
    }

    const targetFriendId = friendId || 'TEST_FRIEND_ID';

    const campaign = await prisma.automationCampaign.create({
      data: {
        orgId,
        sequenceId,
        executionKind: 'sequence',
        state: 'active',
        segmentSnapshot: { friendId: targetFriendId, contactId },
        rulesSnapshot: {}
      }
    });

    const firstStep = sequence.sequenceSteps[0];
    const delayMs = Math.max(3000, (firstStep.delayMinutes || 0) * 60_000);

    const { enqueueSequenceStep } = await import('./automation-queue.js');
    await enqueueSequenceStep(campaign.id, firstStep.id, delayMs);

    // Update enrolled count
    await prisma.automationSequence.update({
      where: { id: sequenceId },
      data: { enrolledCount: { increment: 1 } }
    });

    return reply.status(200).send({ success: true, campaignId: campaign.id, stepId: firstStep.id });
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi kích hoạt kịch bản');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}
