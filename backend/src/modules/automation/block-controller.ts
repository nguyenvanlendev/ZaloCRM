import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export async function getBlocks(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const { folderId, actionType } = request.query as { folderId?: string; actionType?: string };

    const whereClause: any = {
      orgId,
      archivedAt: null
    };

    if (folderId) whereClause.folderId = folderId;
    if (actionType) whereClause.actionType = actionType;

    const blocks = await prisma.block.findMany({
      where: whereClause,
      include: {
        folder: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send(blocks);
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi lấy danh sách Block');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

export async function createBlock(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const { name, actionType, content, folderId, tagIds } = request.body as {
      name: string;
      actionType?: string; // 'send_message' | 'request_friend'
      content?: any;
      folderId?: string;
      tagIds?: string[];
    };

    if (!name) {
      return reply.status(400).send({ error: 'Tên khối không được để trống' });
    }

    const block = await prisma.block.create({
      data: {
        orgId,
        name,
        actionType: actionType || 'send_message',
        content: content || { textVariants: [''] },
        folderId: folderId || null,
        tagIds: tagIds || [],
        createdById: request.user!.id
      }
    });

    return reply.status(201).send(block);
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi tạo Block');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

export async function updateBlock(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const { id } = request.params as { id: string };
    const { name, actionType, content, folderId, tagIds } = request.body as any;

    const existing = await prisma.block.findFirst({
      where: { id, orgId, archivedAt: null }
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Khối nội dung không tồn tại' });
    }

    const updated = await prisma.block.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(actionType && { actionType }),
        ...(content && { content }),
        ...(folderId !== undefined && { folderId }),
        ...(tagIds && { tagIds })
      }
    });

    return reply.send(updated);
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi cập nhật Block');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

export async function deleteBlock(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const { id } = request.params as { id: string };

    const existing = await prisma.block.findFirst({
      where: { id, orgId, archivedAt: null }
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Khối nội dung không tồn tại' });
    }

    await prisma.block.update({
      where: { id },
      data: { archivedAt: new Date() }
    });

    return reply.send({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi xoá Block');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}
