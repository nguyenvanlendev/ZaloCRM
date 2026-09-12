// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * quota-alert-service.ts — Giám sát & Cảnh báo Quota SDK Zalo qua Telegram.
 *
 * 1. Chủ động cảnh báo khi nick chạm 80% (nguy cơ) hoặc 100% (cạn quota).
 * 2. Deduplication qua Redis/Memory: Mỗi ngưỡng (80/100) của mỗi category chỉ báo 1 lần/ngày.
 * 3. Cung cấp báo cáo format trực quan cho lệnh Telegram (/quota, /stats).
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { getRedis } from '../../shared/redis-client.js';
import { sendMessage } from '../integrations/providers/telegram-bridge/telegram-api.js';
import { isTelegramBridgeConfigured, getNickBridgeConfig } from '../../shared/telegram-bridge-config.js';
import { getEffectiveLimit, ALL_CATEGORIES, type CategoryLimit } from './sdk-limit-service.js';
import { zaloRateLimiter } from './zalo-rate-limiter.js';
import type { OpCategory } from '../../shared/zalo-operations.js';
import { config } from '../../config/index.js';

export function getEnvBadge(): string {
  const env = (process.env.APP_ENV || process.env.ENVIRONMENT_NAME || (config.disableZaloConnection ? 'dev' : 'prod')).toLowerCase();
  return env.includes('dev') || env.includes('local')
    ? '🛠️ [DEV / LOCAL]'
    : '🚀 [PROD]';
}

// Cache in-memory chống lặp khi Redis không khả dụng
const memoryAlertedSet = new Set<string>();

const CATEGORY_NAMES: Record<string, string> = {
  message: 'Tin nhắn',
  reaction: 'Thả cảm xúc',
  chat_action: 'Hành động chat',
  group_admin: 'Quản trị nhóm',
  group_read: 'Đọc/Quét nhóm',
  friend_action: 'Thao tác bạn bè',
  friend_read: 'Đọc bạn bè',
  profile: 'Cập nhật Profile',
  query: 'Truy vấn (Query)',
  friend_lookup: 'Tìm SĐT (Lookup)',
  contact_sync: 'Đồng bộ danh bạ',
};

/**
 * Kiểm tra xem đã gửi cảnh báo cho ngưỡng này trong ngày chưa (chống spam).
 */
async function hasAlertedToday(accountId: string, category: string, threshold: 80 | 100): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const key = `quota:alert:${accountId}:${category}:${threshold}:${today}`;

  const redis = await getRedis();
  if (redis) {
    try {
      const exists = await redis.exists(key);
      return exists === 1;
    } catch {
      // Fallback in-memory
    }
  }
  return memoryAlertedSet.has(key);
}

/**
 * Đánh dấu đã gửi cảnh báo cho ngưỡng trong ngày.
 */
async function markAlertedToday(accountId: string, category: string, threshold: 80 | 100): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const key = `quota:alert:${accountId}:${category}:${threshold}:${today}`;

  const redis = await getRedis();
  if (redis) {
    try {
      await redis.set(key, '1', 'EX', 86400 * 2); // Lưu 2 ngày
      return;
    } catch {
      // Fallback in-memory
    }
  }
  memoryAlertedSet.add(key);
  // Dọn dẹp memory set nếu quá lớn
  if (memoryAlertedSet.size > 2000) {
    memoryAlertedSet.clear();
  }
}

/**
 * Hook kiểm tra quota sau khi gọi thao tác SDK thành công.
 * Chạy background fire-and-forget, tuyệt đối không làm chậm luồng gọi chính.
 */
export async function checkAndTriggerQuotaAlert(accountId: string, category: OpCategory): Promise<void> {
  if (!isTelegramBridgeConfigured()) return;

  try {
    const limit = await getEffectiveLimit(accountId, category);
    if (!limit || limit.daily <= 0) return;

    const count = await zaloRateLimiter.getDailyCount(accountId, category);
    const pct = Math.round((count / limit.daily) * 100);

    let threshold: 80 | 100 | null = null;
    if (count >= limit.daily) {
      threshold = 100;
    } else if (pct >= 80) {
      threshold = 80;
    }

    if (!threshold) return;

    // Kiểm tra trùng
    const alreadyAlerted = await hasAlertedToday(accountId, category, threshold);
    if (alreadyAlerted) return;

    // Lấy thông tin tài khoản
    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        displayName: true,
        phone: true,
        orgId: true,
        telegramBridge: { select: { telegramChatId: true, enabled: true } },
      },
    });

    if (!account) return;

    const catName = CATEGORY_NAMES[category] || category;
    const nickName = account.displayName || account.phone || account.id.slice(0, 8);

    const isFull = threshold === 100;
    const icon = isFull ? '🚨' : '⚠️';
    const title = isFull ? 'HẾT QUOTA SDK TRONG NGÀY' : 'CẢNH BÁO TIÊU THỤ QUOTA SDK (≥80%)';
    const advice = isFull
      ? 'Tài khoản đã chạm trần giới hạn hôm nay. Các hành động tiếp theo thuộc nhóm này sẽ bị chặn để chống khóa nick.'
      : 'Tài khoản sắp chạm trần giới hạn hôm nay. Vui lòng giảm tần suất thao tác để bảo vệ an toàn nick.';

    const envBadge = getEnvBadge();
    const message = [
      `${icon} <b>[ZaloCRM - ${envBadge}] ${title}</b>`,
      '',
      `📱 <b>Nick:</b> ${nickName}`,
      `📌 <b>Nhóm chức năng:</b> <code>${catName}</code> (${category})`,
      `📊 <b>Tiến độ:</b> <b>${count}/${limit.daily}</b> (<b>${pct}%</b>)`,
      '',
      `💡 <i>${advice}</i>`,
      `🕐 <i>${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</i>`,
    ].join('\n');

    // Xác định chat Telegram nhận thông báo:
    // 1. Group Telegram riêng của nick (nếu có cấu hình bridge)
    // 2. Integration Telegram của org (nếu có)
    const targetChatIds = new Set<string>();
    if (account.telegramBridge?.enabled && account.telegramBridge.telegramChatId) {
      targetChatIds.add(account.telegramBridge.telegramChatId);
    }

    // Tìm thêm chat nhận cảnh báo hệ thống của Org trong bảng Integration
    const integration = await prisma.integration.findFirst({
      where: { orgId: account.orgId, type: 'telegram', enabled: true },
      select: { config: true },
    });
    const intCfg = integration?.config as { chatId?: string } | null;
    if (intCfg?.chatId) {
      targetChatIds.add(intCfg.chatId);
    }

    // Nếu không có chat riêng, thử tìm chat từ bất kỳ nick nào khác trong cùng org đã connect bridge
    if (targetChatIds.size === 0) {
      const anyNickBridge = await prisma.telegramBridgeConfig.findFirst({
        where: { orgId: account.orgId, enabled: true, telegramChatId: { not: null } },
        select: { telegramChatId: true },
      });
      if (anyNickBridge?.telegramChatId) {
        targetChatIds.add(anyNickBridge.telegramChatId);
      }
    }

    if (targetChatIds.size > 0) {
      for (const chatId of targetChatIds) {
        await sendMessage(chatId, message);
      }
      await markAlertedToday(accountId, category, threshold);
      logger.info(`[quota-alert] Sent ${threshold}% alert for account ${accountId} (${category}: ${count}/${limit.daily})`);
    }
  } catch (err) {
    logger.warn(`[quota-alert] Error checking alert for account ${accountId}:`, err);
  }
}

/**
 * Format báo cáo quota tổng hợp cho 1 nick hoặc toàn bộ nick của org (dùng cho lệnh /quota, /stats).
 */
export async function formatQuotaReport(
  orgId: string,
  targetAccountId?: string | null
): Promise<string> {
  const accounts = await prisma.zaloAccount.findMany({
    where: {
      orgId,
      archivedAt: null,
      ...(targetAccountId ? { id: targetAccountId } : {}),
    },
    select: {
      id: true,
      displayName: true,
      phone: true,
      status: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (accounts.length === 0) {
    return 'ℹ️ Không tìm thấy tài khoản Zalo nào trong hệ thống.';
  }

  const envBadge = getEnvBadge();
  const lines: string[] = [
    `📊 <b>BÁO CÁO TIÊU THỤ QUOTA SDK HÔM NAY</b> ${envBadge}`,
    `🕐 <i>${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</i>`,
    '────────────────────',
  ];

  // Các category quan trọng nhất cần theo dõi
  const TRACKED_CATEGORIES: OpCategory[] = [
    'message',
    'friend_lookup',
    'group_read',
    'contact_sync',
    'query',
    'friend_action',
  ];

  for (const acc of accounts) {
    const nickName = acc.displayName || acc.phone || acc.id.slice(0, 8);
    const statusIcon = acc.status === 'connected' ? '🟢' : '⚪️';
    lines.push(`\n${statusIcon} <b>${nickName}</b>`);

    let hasAnyUsage = false;
    for (const cat of TRACKED_CATEGORIES) {
      const limit = await getEffectiveLimit(acc.id, cat);
      const count = await zaloRateLimiter.getDailyCount(acc.id, cat);
      if (count > 0 || cat === 'message' || cat === 'group_read') {
        const catName = CATEGORY_NAMES[cat] || cat;
        const pct = limit.daily > 0 ? Math.round((count / limit.daily) * 100) : 0;
        let pIcon = '🟢';
        if (pct >= 100) pIcon = '🔴';
        else if (pct >= 80) pIcon = '🟡';

        lines.push(`  • ${catName}: <b>${count}/${limit.daily}</b> (${pct}%) ${pIcon}`);
        hasAnyUsage = true;
      }
    }
    if (!hasAnyUsage) {
      lines.push('  • <i>Chưa có phát sinh quota hôm nay</i>');
    }
  }

  lines.push('\n────────────────────');
  lines.push('💡 <i>Gõ <code>/quota</code> để cập nhật lại số liệu mới nhất.</i>');
  return lines.join('\n');
}
