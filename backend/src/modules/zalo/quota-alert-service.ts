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
 * Vẽ thanh tiến độ ASCII đẹp mắt cho Telegram (ví dụ: [████░░░░] 50%).
 */
export function renderProgressBar(current: number, max: number, len = 8): string {
  if (max <= 0) return '░'.repeat(len);
  const ratio = Math.min(Math.max(current / max, 0), 1);
  const filled = Math.round(ratio * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}

/**
 * Tính thời gian còn lại đến 00:00 (giờ reset quota hàng ngày của Zalo/CRM).
 */
export function getRemainingResetTime(): string {
  const now = new Date();
  const vnTimeStr = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  const [h, m] = vnTimeStr.split(':').map((s) => parseInt(s, 10));
  const currentMinutes = (h || 0) * 60 + (m || 0);
  const totalMinutes = 24 * 60;
  const diff = totalMinutes - currentMinutes;
  const hoursLeft = Math.floor(diff / 60);
  const minsLeft = diff % 60;
  return `${hoursLeft}h ${minsLeft}m`;
}

/**
 * Chia nhỏ danh sách báo cáo quota thành nhiều chunk ≤ 3800 ký tự (an toàn với trần 4096 của Telegram).
 * Mỗi chunk có tiêu đề riêng, tự động đánh số [1/N], [2/N] nếu bị chia nhỏ.
 */
function splitTelegramChunks(
  envBadge: string,
  timeStr: string,
  accountBlocks: string[],
  summaryLine?: string,
): string[] {
  if (accountBlocks.length === 0) {
    return ['ℹ️ Không tìm thấy tài khoản Zalo nào trong hệ thống.'];
  }

  const MAX_CHARS = 3800;
  const resetLeft = getRemainingResetTime();
  const footer = [
    '────────────────────',
    `⏳ <i>Reset quota ngày sau: <b>${resetLeft}</b> (lúc 00:00)</i>`,
    '💡 <i>Gõ <code>/quota all</code> để xem toàn bộ danh mục | <code>/health</code> xem máy chủ.</i>',
  ].join('\n');

  const baseHeader = `📊 <b>BÁO CÁO TIÊU THỤ QUOTA SDK HÔM NAY</b> ${envBadge}`;
  const headerTime = `🕐 <i>${timeStr}</i>\n${summaryLine ? summaryLine + '\n' : ''}────────────────────`;

  const chunkGroups: string[][] = [];
  let currentGroup: string[] = [];
  let currentLen = baseHeader.length + headerTime.length + footer.length + 50;

  for (const block of accountBlocks) {
    const addedLen = block.length + 2;
    if (currentGroup.length > 0 && currentLen + addedLen > MAX_CHARS) {
      chunkGroups.push(currentGroup);
      currentGroup = [block];
      currentLen = baseHeader.length + headerTime.length + footer.length + 50 + addedLen;
    } else {
      currentGroup.push(block);
      currentLen += addedLen;
    }
  }
  if (currentGroup.length > 0) {
    chunkGroups.push(currentGroup);
  }

  const total = chunkGroups.length;
  if (total <= 1) {
    return [
      [
        `${baseHeader}\n${headerTime}`,
        chunkGroups[0]!.join('\n\n'),
        footer,
      ].join('\n\n'),
    ];
  }

  return chunkGroups.map((group, idx) => {
    const isLast = idx === total - 1;
    const chunkBadge = ` <b>[${idx + 1}/${total}]</b>`;
    const chunkHeader = `${baseHeader}${chunkBadge}\n${headerTime}`;

    const parts = [chunkHeader, group.join('\n\n')];
    if (isLast) {
      parts.push(footer);
    }
    return parts.join('\n\n');
  });
}

/**
 * Format báo cáo quota tổng hợp cho 1 nick hoặc toàn bộ nick của org (dùng cho lệnh /quota, /stats).
 * Trả về danh sách chuỗi tin nhắn (mỗi tin nhắn ≤ 4000 ký tự) để gửi Telegram an toàn.
 * Hiển thị ĐẦY ĐỦ 11/11 danh mục theo dõi với thanh tiến độ trực quan.
 */
export async function formatQuotaReport(
  orgId: string,
  targetAccountId?: string | null,
  options?: { showAll?: boolean },
): Promise<string[]> {
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
      zaloUid: true,
      status: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (accounts.length === 0) {
    return ['ℹ️ Không tìm thấy tài khoản Zalo nào trong hệ thống.'];
  }

  // 1. Chuẩn bị danh sách query song song cho toàn bộ 11 category
  const pairs: Array<{ accountId: string; category: OpCategory }> = [];
  for (const acc of accounts) {
    for (const cat of ALL_CATEGORIES) {
      pairs.push({ accountId: acc.id, category: cat });
    }
  }

  // 2. Batch query Redis bằng Pipeline gom 1 roundtrip + song song resolve EffectiveLimits
  const [counts, limits] = await Promise.all([
    zaloRateLimiter.getBatchDailyCounts(pairs),
    Promise.all(pairs.map((p) => getEffectiveLimit(p.accountId, p.category))),
  ]);

  // 3. Render từng account block
  let pairIdx = 0;
  const accountBlocks: string[] = [];
  let totalOrgMsgs = 0;
  let totalOrgLookups = 0;
  let warningCountTotal = 0;

  for (const acc of accounts) {
    const nickName = acc.displayName || acc.phone || acc.id.slice(0, 8);
    const statusIcon = acc.status === 'connected' ? '🟢' : '⚪️';
    const statusText = acc.status === 'connected' ? 'Connected' : 'Disconnected';
    const lines: string[] = [
      `${statusIcon} <b>${nickName}</b> <i>(${statusText}${acc.phone ? ' • ' + acc.phone : ''})</i>`,
    ];

    let hasAnyUsage = false;
    let nickWarningCount = 0;
    let nickFullCount = 0;

    for (const cat of ALL_CATEGORIES) {
      const count = counts[pairIdx] ?? 0;
      const limit = limits[pairIdx] ?? { daily: 0, burst: 0, burstWindowMs: 0 };
      pairIdx++;

      if (cat === 'message') totalOrgMsgs += count;
      if (cat === 'friend_lookup') totalOrgLookups += count;

      const pct = limit.daily > 0 ? Math.round((count / limit.daily) * 100) : 0;
      if (pct >= 100) {
        nickFullCount++;
        warningCountTotal++;
      } else if (pct >= 80) {
        nickWarningCount++;
        warningCountTotal++;
      }

      // Luôn hiển thị các category cốt lõi HOẶC category đang có phát sinh quota HOẶC khi yêu cầu showAll
      const isCoreCategory = cat === 'message' || cat === 'chat_action' || cat === 'friend_lookup' || cat === 'friend_action';
      if (count > 0 || isCoreCategory || options?.showAll) {
        const catName = CATEGORY_NAMES[cat] || cat;
        const bar = renderProgressBar(count, limit.daily);
        let badge = '🟢';
        if (pct >= 100) badge = '🔴 <b>HẾT QUOTA</b>';
        else if (pct >= 80) badge = '🟡 <b>CẢNH BÁO</b>';

        lines.push(`  • ${catName}: <code>[${bar}]</code> <b>${count}/${limit.daily}</b> (${pct}%) ${badge}`);
        if (count > 0) hasAnyUsage = true;
      }
    }

    if (!hasAnyUsage) {
      lines.push('  • <i>Chưa phát sinh lượt gọi hôm nay</i>');
    }
    if (nickFullCount > 0) {
      lines.push(`  🚨 <b>Chú ý:</b> Đã có <b>${nickFullCount}</b> chức năng cạn trần trong ngày!`);
    } else if (nickWarningCount > 0) {
      lines.push(`  ⚠️ <b>Chú ý:</b> Có <b>${nickWarningCount}</b> chức năng đang đạt trên 80% trần.`);
    }

    accountBlocks.push(lines.join('\n'));
  }

  const envBadge = getEnvBadge();
  const timeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const summaryLine = `📈 <b>Tổng quan hôm nay:</b> ✉️ <b>${totalOrgMsgs}</b> tin nhắn gửi | 🔍 <b>${totalOrgLookups}</b> tìm SĐT${warningCountTotal > 0 ? ` | ⚠️ <b>${warningCountTotal}</b> cảnh báo quota` : ''}`;

  return splitTelegramChunks(envBadge, timeStr, accountBlocks, summaryLine);
}

/**
 * Gửi Báo cáo Metric định kỳ 1 giờ tự động bắn về Telegram.
 * Được gọi bởi Cron Job (0 * * * *) hoặc trigger thủ công từ API.
 */
export async function sendHourlyMetricReport(
  targetOrgId?: string
): Promise<{ success: boolean; sentCount: number; targetChatCount: number; error?: string }> {
  try {
    const envBadge = getEnvBadge();
    const timeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    // 1. Thu thập đích đến nhận tin nhắn Telegram
    const targetChatIds = new Set<string>();

    // a. Đọc từ biến môi trường nếu có
    if (process.env.TELEGRAM_REPORT_CHAT_ID) {
      targetChatIds.add(process.env.TELEGRAM_REPORT_CHAT_ID.trim());
    }
    if (process.env.TELEGRAM_ADMIN_CHAT_ID) {
      targetChatIds.add(process.env.TELEGRAM_ADMIN_CHAT_ID.trim());
    }

    // b. Đọc từ các nhóm TelegramBridgeConfig đã kích hoạt
    const bridges = await prisma.telegramBridgeConfig.findMany({
      where: {
        enabled: true,
        telegramChatId: { not: null },
        ...(targetOrgId ? { orgId: targetOrgId } : {}),
      },
      select: { telegramChatId: true },
      take: 10,
    });
    for (const b of bridges) {
      if (b.telegramChatId) targetChatIds.add(b.telegramChatId);
    }

    // c. Đọc từ cấu hình Integration Telegram của Org
    const integrations = await prisma.integration.findMany({
      where: {
        type: 'telegram',
        enabled: true,
        ...(targetOrgId ? { orgId: targetOrgId } : {}),
      },
      select: { config: true },
    });
    for (const int of integrations) {
      const cfg = int.config as { chatId?: string } | null;
      if (cfg?.chatId) targetChatIds.add(cfg.chatId);
    }

    // d. Nếu vẫn chưa có chat, fallback đến các user đã /link với bot
    if (targetChatIds.size === 0) {
      const linkedUsers = await prisma.telegramUserLink.findMany({
        where: targetOrgId ? { orgId: targetOrgId } : {},
        select: { telegramUserId: true },
        take: 5,
      });
      for (const lu of linkedUsers) {
        if (lu.telegramUserId) targetChatIds.add(lu.telegramUserId);
      }
    }

    if (targetChatIds.size === 0) {
      logger.warn('[metric-cron] Không tìm thấy ChatId Telegram nào để bắn báo cáo định kỳ 1 giờ.');
      return { success: false, sentCount: 0, targetChatCount: 0, error: 'Chưa cấu hình ChatId Telegram nhận báo cáo' };
    }

    // 2. Lấy danh sách orgId để tạo báo cáo
    const orgs = targetOrgId
      ? [{ id: targetOrgId }]
      : await prisma.organization.findMany({ select: { id: true }, take: 5 });

    let sentTotal = 0;
    for (const org of orgs) {
      const reportChunks = await formatQuotaReport(org.id);
      for (const chatId of targetChatIds) {
        for (let i = 0; i < reportChunks.length; i++) {
          if (i > 0) await new Promise((r) => setTimeout(r, 250));
          const ok = await sendMessage(chatId, reportChunks[i]!);
          if (ok) sentTotal++;
        }
      }
    }

    logger.info(`[metric-cron] Đã gửi báo cáo metric 1h tới ${targetChatIds.size} kênh Telegram (tổng ${sentTotal} tin nhắn gửi thành công).`);
    return { success: true, sentCount: sentTotal, targetChatCount: targetChatIds.size };
  } catch (err: any) {
    logger.error('[metric-cron] Lỗi khi gửi báo cáo định kỳ 1h qua Telegram:', err);
    return { success: false, sentCount: 0, targetChatCount: 0, error: err?.message || String(err) };
  }
}

