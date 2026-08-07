import type { Job } from 'bullmq';
import type { AutomationJobData } from './automation-queue.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloOps } from '../../shared/zalo-operations.js';

export async function processAutomationJob(job: Job<AutomationJobData>): Promise<void> {
  const { campaignId, stepId } = job.data;

  // 1. Tìm Campaign
  const campaign = await prisma.automationCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign || campaign.state !== 'active') {
    logger.warn(`[automation-processor] Bỏ qua job do Campaign ${campaignId} không hợp lệ hoặc đã dừng.`);
    return;
  }

  // 2. Tìm SequenceStep
  const step = await prisma.sequenceStep.findUnique({
    where: { id: stepId },
    include: { block: true }
  });

  if (!step) {
    logger.error(`[automation-processor] Bỏ qua job do không tìm thấy SequenceStep ${stepId}`);
    return;
  }

  // 3. Tìm Sequence
  const sequence = await prisma.automationSequence.findUnique({
    where: { id: campaign.sequenceId! }
  });

  if (!sequence || !sequence.enabled) {
    logger.warn(`[automation-processor] Bỏ qua job do Sequence đã bị tắt.`);
    return;
  }

  // 4. Lấy thông tin Friend từ snapshot
  const snapshot = campaign.segmentSnapshot as any;
  if (!snapshot?.friendId) {
    logger.error(`[automation-processor] Không tìm thấy friendId trong campaign snapshot`);
    return;
  }

  const friend = await prisma.friend.findUnique({
    where: { id: snapshot.friendId }
  });

  if (!friend) {
    logger.error(`[automation-processor] Không tìm thấy Friend ${snapshot.friendId}`);
    return;
  }

  // 5. Chuẩn bị nội dung gửi (Đọc từ Block)
  let rawContent = `Xin chào! Đây là tin nhắn tự động từ kịch bản: ${sequence.name}`;
  if (step.block && step.block.content) {
    const blockContent = step.block.content as any;
    const variants = blockContent.textVariants || blockContent.greetingVariants || [];
    if (Array.isArray(variants) && variants.length > 0) {
      // Pick ngẫu nhiên 1 biến thể
      rawContent = variants[Math.floor(Math.random() * variants.length)];
    } else if (typeof blockContent.text === 'string') {
      rawContent = blockContent.text;
    }
  }

  // Thay thế các biến cá nhân hóa
  const friendName = friend.zaloDisplayName || friend.aliasInNick || 'Quý khách';
  const formattedContent = rawContent
    .replace(/\{name\}/g, friendName)
    .replace(/\{gender\}/g, 'Anh/Chị')
    .replace(/\{sale\}/g, 'Tư vấn viên');

  // 6. Gửi tin nhắn qua zaloOps
  try {
    await zaloOps.sendMessage(
      friend.zaloAccountId,
      friend.zaloUidInNick,
      0, // threadType = 0 (tin nhắn cá nhân)
      { msg: formattedContent }
    );
    logger.info(`[automation-processor] Đã gửi step ${step.stepOrder} cho friend ${friend.zaloUidInNick} từ nick ${friend.zaloAccountId}`);

    // Log sự kiện
    await prisma.automationEventLog.create({
      data: {
        orgId: campaign.orgId,
        triggerId: campaign.triggerId || null,
        contactId: friend.contactId,
        nickId: friend.zaloAccountId,
        eventType: 'sequence_step_sent',
        detail: `Đã gửi bước ${step.stepOrder + 1} của kịch bản ${sequence.name}`,
        metadata: { campaignId, stepId: step.id, blockId: step.blockId }
      }
    });

    // 7. Kiểm tra và enqueue bước tiếp theo
    const nextStep = await prisma.sequenceStep.findFirst({
      where: {
        sequenceId: sequence.id,
        stepOrder: { gt: step.stepOrder }
      },
      orderBy: { stepOrder: 'asc' }
    });

    if (nextStep) {
      const delayMs = Math.max(3000, (nextStep.delayMinutes || 0) * 60_000);
      const { enqueueSequenceStep } = await import('./automation-queue.js');
      await enqueueSequenceStep(campaign.id, nextStep.id, delayMs);
      logger.info(`[automation-processor] Đã hẹn giờ cho step tiếp theo (stepOrder: ${nextStep.stepOrder}) sau ${delayMs}ms`);
    } else {
      // Đã hết bước -> Hoàn thành campaign
      await prisma.automationCampaign.update({
        where: { id: campaignId },
        data: { state: 'completed', completedAt: new Date() }
      });
      await prisma.automationSequence.update({
        where: { id: sequence.id },
        data: { completedCount: { increment: 1 } }
      });
      logger.info(`[automation-processor] Campaign ${campaignId} đã hoàn thành toàn bộ các bước trong Sequence`);
    }
  } catch (error: any) {
    logger.error({ err: error }, `[automation-processor] Lỗi gửi tin zaloOps`);
    
    await prisma.automationEventLog.create({
      data: {
        orgId: campaign.orgId,
        contactId: friend.contactId,
        nickId: friend.zaloAccountId,
        eventType: 'sequence_step_failed',
        detail: `Gửi bước ${step.stepOrder + 1} thất bại: ${error.message}`,
        metadata: { campaignId, stepId: step.id }
      }
    });
    
    throw error; // BullMQ tự retry theo cấu hình
  }
}
