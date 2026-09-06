// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Chat helpers — shared utilities cho 11 writer site của Message.
 *
 * 2026-06-03 — Anh báo bug optimistic "Sale CRM · Staff":
 * Khi sale gõ tin trên CRM, BE insert Message rồi socket emit. Trước fix
 * Message thiếu metadata.sender.name + repliedBy relation → FE render
 * badge "Sale CRM · Staff" (fallback hardcoded). Sau reload mới đúng.
 *
 * Fix: 11 writer site (chat-routes + chat-operations + chat-attachment)
 * dùng helper này để build sender metadata + lookup userFullName 1 lần
 * per request.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';

const userNameCache = new Map<string, { name: string; ts: number }>();
const CACHE_TTL_MS = 5 * 60_000; // 5 phút

// Cache for msgIds that received a 'delivered' webhook BEFORE they were inserted into the DB.
const earlyDeliveredCache = new Set<string>();

export function markEarlyDelivered(msgId: string) {
  if (!msgId) return;
  earlyDeliveredCache.add(msgId);
  // Remove after 10 seconds to avoid memory leak
  setTimeout(() => earlyDeliveredCache.delete(msgId), 10000);
}

export function popEarlyDelivered(msgId: string): boolean {
  if (!msgId) return false;
  const exists = earlyDeliveredCache.has(msgId);
  if (exists) earlyDeliveredCache.delete(msgId);
  return exists;
}

/**
 * Lookup User.fullName với cache 5 phút. Giảm 1 DB roundtrip mỗi tin gửi
 * (sale gõ liên tục → cùng userId → cache hit).
 */
export async function getUserFullName(userId: string): Promise<string> {
  const cached = userNameCache.get(userId);
  const now = Date.now();
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.name;

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true, email: true },
  });
  const name = u?.fullName?.trim() || u?.email?.split('@')[0] || 'Sale';
  userNameCache.set(userId, { name, ts: now });
  return name;
}

/**
 * Build M11 metadata.sender cho tin sale gõ qua CRM.
 * Đảm bảo FE MessageSourceBadge render badge "Sale CRM · {tên}" ngay
 * optimistic, không đợi reload.
 */
export function buildSaleCrmSenderMeta(userFullName: string) {
  return {
    sender: { kind: 'user_crm' as const, name: userFullName },
  };
}

/**
 * createMediaMessage — Phase Media Library 2026-06-11 (eng review E4 / DRY).
 *
 * Gộp 4 block prisma.message.create LẶP trong chat-attachment-routes
 * (image batch / video-success / video-fallback / file) thành 1 helper.
 * Trước: 4 chỗ copy cùng base (id/zaloMsgId/senderType/senderUid/...) chỉ khác
 * content+contentType → sửa privacy/field 1 chỗ phải nhớ 4 chỗ. Giờ 1 nguồn.
 *
 * Caller chỉ truyền phần KHÁC NHAU: contentType + content (đã JSON.stringify)
 * + tùy chọn sentVia/metadata. Phần chung (sender self, senderName Staff,
 * sentAt, repliedByUserId) helper tự điền.
 */
export interface CreateMediaMessageInput {
  conversationId: string;
  zaloAccount: { zaloUid: string | null };
  repliedByUserId: string;
  zaloMsgId: string; // '' nếu chưa có
  contentType: 'image' | 'video' | 'file';
  content: string; // đã JSON.stringify
  /** M11 sender metadata (badge "Sale CRM · {tên}"). image/video truyền; file legacy có thể bỏ. */
  metadata?: Record<string, unknown>;
  /** 'user' cho image/video (đường gửi mới). file legacy để mặc định (undefined). */
  sentVia?: string;
}

export async function createMediaMessage(input: CreateMediaMessageInput) {
  const { zaloMsgId } = input;
  return prisma.message.create({
    data: {
      id: randomUUID(),
      conversationId: input.conversationId,
      zaloMsgId: zaloMsgId || null,
      zaloMsgIdNum: zaloMsgId && /^\d+$/.test(zaloMsgId) ? BigInt(zaloMsgId) : null,
      senderType: 'self',
      senderUid: input.zaloAccount.zaloUid || '',
      senderName: 'Staff',
      sentVia: input.sentVia,
      metadata: input.metadata,
      content: input.content,
      contentType: input.contentType,
      sentAt: new Date(),
      deliveredAt: (zaloMsgId && popEarlyDelivered(zaloMsgId)) ? new Date() : null,
      repliedByUserId: input.repliedByUserId,
    },
  });
}
