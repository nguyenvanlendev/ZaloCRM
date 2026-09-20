// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * Chuẩn hoá shortcut: bỏ "/", lowercase, bỏ dấu tiếng Việt, bỏ khoảng trắng và ký tự đặc biệt
 */
export function normalizeShortcut(sc?: string | null): string | null {
  if (!sc) return null;
  const cleaned = sc
    .trim()
    .replace(/^\/+/, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  return cleaned || null;
}

/**
 * Lấy danh sách mẫu tin nhắn
 */
export async function getTemplates(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const userId = request.user!.id;
    const query = request.query as {
      folderId?: string;
      visibility?: string;
      tags?: string;
      category?: string;
      search?: string;
      includeArchived?: string;
    };

    const where: any = {
      orgId,
      ...(query.includeArchived === 'true' ? {} : { archivedAt: null })
    };

    // Phân quyền hiển thị:
    // User thấy mẫu công khai (public / ownerUserId = null) HOẶC mẫu cá nhân do chính mình tạo
    if (query.visibility === 'public') {
      where.OR = [
        { visibility: 'public' },
        { ownerUserId: null, visibility: { not: 'private' } }
      ];
    } else if (query.visibility === 'private') {
      where.visibility = 'private';
      where.OR = [
        { createdById: userId },
        { ownerUserId: userId }
      ];
    } else {
      where.OR = [
        { visibility: 'public' },
        { ownerUserId: null },
        { createdById: userId },
        { ownerUserId: userId }
      ];
    }

    if (query.folderId) {
      if (query.folderId === 'none' || query.folderId === 'null') {
        where.folderId = null;
      } else {
        where.folderId = query.folderId;
      }
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.tags) {
      const tagList = query.tags.split(',').map(t => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        where.tagIds = { hasSome: tagList };
      }
    }

    if (query.search) {
      const s = query.search.trim();
      const normS = normalizeShortcut(s);
      where.AND = [
        {
          OR: [
            { name: { contains: s, mode: 'insensitive' } },
            { content: { contains: s, mode: 'insensitive' } },
            ...(normS ? [{ shortcut: { contains: normS, mode: 'insensitive' } }] : [])
          ]
        }
      ];
    }

    const templates = await prisma.messageTemplate.findMany({
      where,
      include: {
        folder: { select: { id: true, name: true, visibility: true } },
        createdBy: { select: { id: true, fullName: true } }
      },
      orderBy: [
        { usageCount: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    const mapped = templates.map(t => ({
      ...t,
      isPersonal: t.visibility === 'private' || (t.ownerUserId !== null && t.visibility !== 'public'),
      isMine: t.createdById === userId || t.ownerUserId === userId
    }));

    return reply.send({ templates: mapped });
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi lấy danh sách MessageTemplate');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

/**
 * Lấy chi tiết một mẫu tin nhắn
 */
export async function getTemplateById(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const userId = request.user!.id;
    const { id } = request.params as { id: string };

    const template = await prisma.messageTemplate.findFirst({
      where: {
        id,
        orgId,
        archivedAt: null,
        OR: [
          { visibility: 'public' },
          { ownerUserId: null },
          { createdById: userId },
          { ownerUserId: userId }
        ]
      },
      include: {
        folder: { select: { id: true, name: true, visibility: true } },
        createdBy: { select: { id: true, fullName: true } }
      }
    });

    if (!template) {
      return reply.status(404).send({ error: 'Mẫu tin nhắn không tồn tại' });
    }

    return reply.send({
      ...template,
      isPersonal: template.visibility === 'private' || (template.ownerUserId !== null && template.visibility !== 'public'),
      isMine: template.createdById === userId || template.ownerUserId === userId
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi lấy chi tiết MessageTemplate');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

/**
 * Danh sách biến cá nhân hoá khả dụng
 */
export async function getTemplateVariables(_request: FastifyRequest, reply: FastifyReply) {
  const variables = [
    { code: '{gender}', label: 'Giới tính (Anh/Chị)', icon: 'mdi-human-male-female', group: 'kh', example: 'Anh', cat: 'Tên & xưng hô' },
    { code: '{name}', label: 'Tên khách', icon: 'mdi-account-outline', group: 'kh', example: 'Lộc', cat: 'Tên & xưng hô' },
    { code: '{name_full}', label: 'Tên khách đầy đủ', icon: 'mdi-account', group: 'kh', example: 'Trần Văn Lộc', cat: 'Tên & xưng hô' },
    { code: '{name_first}', label: 'Họ (chữ đầu)', icon: 'mdi-account', group: 'kh', example: 'Trần', cat: 'Tên & xưng hô' },
    { code: '{crm_full}', label: 'Tên gợi nhớ (đầy đủ)', icon: 'mdi-bookmark-outline', group: 'kh', example: 'Lộc Q7', cat: 'pernick' },
    { code: '{crm_first}', label: 'Tên gợi nhớ (chữ đầu)', icon: 'mdi-bookmark', group: 'kh', example: 'Lộc', cat: 'pernick' },
    { code: '{crm_last}', label: 'Tên gợi nhớ (chữ cuối)', icon: 'mdi-bookmark', group: 'kh', example: 'Q7', cat: 'pernick' },
    { code: '{phone}', label: 'SĐT chính', icon: 'mdi-phone', group: 'kh', example: '0908 278 807', cat: 'Liên hệ' },
    { code: '{email}', label: 'Email', icon: 'mdi-email-outline', group: 'kh', example: 'an@gmail.com', cat: 'Liên hệ' },
    { code: '{facebook}', label: 'Link Facebook', icon: 'mdi-facebook', group: 'kh', example: 'fb.com/an', cat: 'Liên hệ' },
    { code: '{tiktok}', label: 'Link TikTok', icon: 'mdi-music-note', group: 'kh', example: '@an', cat: 'Liên hệ' },
    { code: '{sale}', label: 'Tên sale', icon: 'mdi-account-tie', group: 'sale', example: 'Vy', cat: 'Sale' },
    { code: '{sale_full}', label: 'Tên sale đầy đủ', icon: 'mdi-account-tie', group: 'sale', example: 'Nguyễn Tường Vy', cat: 'Sale' }
  ];
  return reply.send({ variables });
}

/**
 * Tạo mẫu tin nhắn mới
 */
export async function createTemplate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const userId = request.user!.id;
    const { name, shortcut, content, contentRich, visibility, folderId, category, tagIds } = request.body as any;

    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'Tên mẫu không được để trống' });
    }

    const plainContent = (content || contentRich?.text || '').trim();
    if (!plainContent) {
      return reply.status(400).send({ error: 'Nội dung mẫu không được để trống' });
    }

    const normSc = normalizeShortcut(shortcut);
    if (normSc) {
      const duplicate = await prisma.messageTemplate.findFirst({
        where: {
          orgId,
          shortcut: normSc,
          archivedAt: null,
          OR: [
            { visibility: 'public' },
            { createdById: userId },
            { ownerUserId: userId }
          ]
        }
      });
      if (duplicate) {
        return reply.status(400).send({ error: `Phím tắt /${normSc} đã được sử dụng bởi mẫu "${duplicate.name}"` });
      }
    }

    const template = await prisma.messageTemplate.create({
      data: {
        orgId,
        createdById: userId,
        ownerUserId: userId,
        name: name.trim(),
        shortcut: normSc,
        content: plainContent,
        contentRich: contentRich || { text: plainContent, styles: [] },
        visibility: visibility === 'public' ? 'public' : 'private',
        folderId: folderId || null,
        category: category || null,
        tagIds: Array.isArray(tagIds) ? tagIds : []
      },
      include: {
        folder: { select: { id: true, name: true, visibility: true } },
        createdBy: { select: { id: true, fullName: true } }
      }
    });

    const result = {
      ...template,
      isPersonal: template.visibility === 'private',
      isMine: true
    };

    return reply.status(201).send(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi tạo MessageTemplate');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

/**
 * Cập nhật mẫu tin nhắn
 */
export async function updateTemplate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const userId = request.user!.id;
    const userRole = request.user!.role;
    const { id } = request.params as { id: string };
    const { name, shortcut, content, contentRich, visibility, folderId, category, tagIds } = request.body as any;

    const existing = await prisma.messageTemplate.findFirst({
      where: { id, orgId, archivedAt: null }
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Mẫu tin nhắn không tồn tại' });
    }

    const isOwner = existing.createdById === userId || existing.ownerUserId === userId;
    const isAdmin = ['admin', 'owner', 'manager'].includes(userRole);
    if (!isOwner && !isAdmin) {
      return reply.status(403).send({ error: 'Bạn không có quyền chỉnh sửa mẫu này' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (shortcut !== undefined) {
      const normSc = normalizeShortcut(shortcut);
      if (normSc) {
        const duplicate = await prisma.messageTemplate.findFirst({
          where: {
            orgId,
            shortcut: normSc,
            id: { not: id },
            archivedAt: null,
            OR: [
              { visibility: 'public' },
              { createdById: userId },
              { ownerUserId: userId }
            ]
          }
        });
        if (duplicate) {
          return reply.status(400).send({ error: `Phím tắt /${normSc} đã được sử dụng bởi mẫu "${duplicate.name}"` });
        }
      }
      updateData.shortcut = normSc;
    }

    if (content !== undefined || contentRich !== undefined) {
      const plainContent = (content ?? contentRich?.text ?? existing.content).trim();
      updateData.content = plainContent;
      updateData.contentRich = contentRich ?? { text: plainContent, styles: [] };
    }

    if (visibility !== undefined) {
      updateData.visibility = visibility === 'public' ? 'public' : 'private';
    }
    if (folderId !== undefined) {
      updateData.folderId = folderId || null;
    }
    if (category !== undefined) {
      updateData.category = category || null;
    }
    if (tagIds !== undefined) {
      updateData.tagIds = Array.isArray(tagIds) ? tagIds : [];
    }

    const updated = await prisma.messageTemplate.update({
      where: { id },
      data: updateData,
      include: {
        folder: { select: { id: true, name: true, visibility: true } },
        createdBy: { select: { id: true, fullName: true } }
      }
    });

    return reply.send({
      ...updated,
      isPersonal: updated.visibility === 'private',
      isMine: updated.createdById === userId || updated.ownerUserId === userId
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi cập nhật MessageTemplate');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

/**
 * Xoá mềm mẫu tin nhắn
 */
export async function deleteTemplate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const userId = request.user!.id;
    const userRole = request.user!.role;
    const { id } = request.params as { id: string };

    const existing = await prisma.messageTemplate.findFirst({
      where: { id, orgId, archivedAt: null }
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Mẫu tin nhắn không tồn tại' });
    }

    const isOwner = existing.createdById === userId || existing.ownerUserId === userId;
    const isAdmin = ['admin', 'owner', 'manager'].includes(userRole);
    if (!isOwner && !isAdmin) {
      return reply.status(403).send({ error: 'Bạn không có quyền xoá mẫu này' });
    }

    await prisma.messageTemplate.update({
      where: { id },
      data: { archivedAt: new Date() }
    });

    return reply.send({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi xoá MessageTemplate');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

/**
 * Ghi nhận lượt sử dụng mẫu tin nhắn
 */
export async function trackTemplateUse(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const { id } = request.params as { id: string };

    await prisma.messageTemplate.updateMany({
      where: { id, orgId },
      data: {
        usageCount: { increment: 1 },
        manualSendCount: { increment: 1 },
        lastUsedAt: new Date(),
        lastManualSentAt: new Date()
      }
    });

    return reply.send({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi ghi nhận sử dụng MessageTemplate');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

/**
 * Lấy danh sách thư mục mẫu tin nhắn
 */
export async function getTemplateFolders(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const userId = request.user!.id;

    const folders = await prisma.messageTemplateFolder.findMany({
      where: {
        orgId,
        OR: [
          { visibility: 'public' },
          { createdById: userId },
          { ownerUserId: userId }
        ]
      },
      include: {
        _count: {
          select: {
            templates: {
              where: { archivedAt: null }
            }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    return reply.send({ folders });
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi lấy danh sách MessageTemplateFolder');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

/**
 * Tạo thư mục mẫu tin nhắn mới
 */
export async function createTemplateFolder(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const userId = request.user!.id;
    const { name, visibility } = request.body as { name: string; visibility?: string };

    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'Tên thư mục không được để trống' });
    }

    const folder = await prisma.messageTemplateFolder.create({
      data: {
        orgId,
        name: name.trim(),
        visibility: visibility === 'private' ? 'private' : 'public',
        createdById: userId,
        ownerUserId: userId
      },
      include: {
        _count: {
          select: {
            templates: {
              where: { archivedAt: null }
            }
          }
        }
      }
    });

    return reply.status(201).send(folder);
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi tạo MessageTemplateFolder');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

/**
 * Cập nhật thư mục mẫu tin nhắn
 */
export async function updateTemplateFolder(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const userId = request.user!.id;
    const userRole = request.user!.role;
    const { id } = request.params as { id: string };
    const { name, visibility } = request.body as { name?: string; visibility?: string };

    const existing = await prisma.messageTemplateFolder.findFirst({
      where: { id, orgId }
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Thư mục không tồn tại' });
    }

    const isOwner = existing.createdById === userId || existing.ownerUserId === userId;
    const isAdmin = ['admin', 'owner', 'manager'].includes(userRole);
    if (!isOwner && !isAdmin) {
      return reply.status(403).send({ error: 'Bạn không có quyền sửa thư mục này' });
    }

    const updated = await prisma.messageTemplateFolder.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(visibility && { visibility: visibility === 'private' ? 'private' : 'public' })
      },
      include: {
        _count: {
          select: {
            templates: {
              where: { archivedAt: null }
            }
          }
        }
      }
    });

    return reply.send(updated);
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi cập nhật MessageTemplateFolder');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}

/**
 * Xoá thư mục mẫu tin nhắn
 */
export async function deleteTemplateFolder(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.user!.orgId;
    const userId = request.user!.id;
    const userRole = request.user!.role;
    const { id } = request.params as { id: string };
    const { force } = request.query as { force?: string };

    const existing = await prisma.messageTemplateFolder.findFirst({
      where: { id, orgId },
      include: {
        _count: {
          select: { templates: { where: { archivedAt: null } } }
        }
      }
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Thư mục không tồn tại' });
    }

    const isOwner = existing.createdById === userId || existing.ownerUserId === userId;
    const isAdmin = ['admin', 'owner', 'manager'].includes(userRole);
    if (!isOwner && !isAdmin) {
      return reply.status(403).send({ error: 'Bạn không có quyền xoá thư mục này' });
    }

    if (existing._count.templates > 0) {
      if (force === 'true') {
        await prisma.messageTemplate.updateMany({
          where: { folderId: id, orgId },
          data: { folderId: null }
        });
      } else {
        return reply.status(400).send({
          error: `Thư mục đang chứa ${existing._count.templates} mẫu tin nhắn. Vui lòng chuyển mẫu sang thư mục khác hoặc dùng tham số force=true để gỡ liên kết.`
        });
      }
    }

    await prisma.messageTemplateFolder.delete({
      where: { id }
    });

    return reply.send({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Lỗi khi xoá MessageTemplateFolder');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}
