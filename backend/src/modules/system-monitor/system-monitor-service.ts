// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * system-monitor-service.ts — Thu thập số liệu & Format báo cáo giám sát hệ thống qua Telegram.
 *
 * Cung cấp:
 *  1. /health  — Sức khỏe hệ thống tổng quan (Uptime, RAM, DB, Redis, Nick count, Cron count, Queue count).
 *  2. /crons   — Báo cáo chi tiết từng cron job (tần suất, lần chạy cuối, ms, trạng thái, lỗi).
 *  3. /nicks   — Chi tiết trạng thái kết nối & phiên làm việc của từng Nick Zalo trong tổ chức.
 *  4. Cảnh báo lỗi chủ động (sendCronFailureAlert) gửi vào Telegram admin chat khi cron job gặp lỗi.
 */
import os from 'os';
import { prisma } from '../../shared/database/prisma-client.js';
import { getRedis } from '../../shared/redis-client.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { getEnvBadge } from '../zalo/quota-alert-service.js';
import { cronTracker, type CronEntry } from './cron-tracker.js';
import { getGroupScanQueueStats } from '../zalo/group-scan-queue.js';
import { getLabelQueueStats } from '../tags/zalo-label-queue.js';
import { getAutomationQueue } from '../automation/automation-queue.js';
import { sendMessage } from '../integrations/providers/telegram-bridge/telegram-api.js';
import { logger } from '../../shared/utils/logger.js';
import { runSystemQuery } from '../../shared/tenant/tenant-context.js';

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatTimeAgo(date: Date | null): string {
  if (!date) return 'Chưa chạy lần nào';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'Vừa xong';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec} giây trước`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} ngày trước`;
}

function formatQueueLine(name: string, stats: { waiting: number; active: number; failed: number }): string {
  if (stats.failed > 0) {
    return `  • ${name}: 🔴 <b>${stats.failed} lỗi</b> (${stats.waiting} waiting, ${stats.active} active)`;
  }
  if (stats.waiting > 0 || stats.active > 0) {
    return `  • ${name}: 🟡 Đang xử lý (${stats.waiting} waiting, ${stats.active} active)`;
  }
  return `  • ${name}: 🟢 Trống (0 waiting, 0 active, 0 failed)`;
}

/**
 * Tạo báo cáo sức khỏe hệ thống (/health).
 */
export async function formatHealthReport(orgId?: string | null): Promise<string> {
  const envBadge = getEnvBadge();
  const nowStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  // 1. Uptime & Memory
  const uptimeSec = Math.floor(process.uptime());
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const mins = Math.floor((uptimeSec % 3600) / 60);
  const uptimeParts: string[] = [];
  if (days > 0) uptimeParts.push(`${days} ngày`);
  if (hours > 0) uptimeParts.push(`${hours} giờ`);
  uptimeParts.push(`${mins} phút`);
  const uptimeStr = uptimeParts.join(', ');

  const mem = process.memoryUsage();
  const rssMb = Math.round(mem.rss / 1024 / 1024);
  const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);

  // 2. Database Ping
  let dbLatencyStr = '🔴 Không kết nối';
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - t0;
    dbLatencyStr = `🟢 Kết nối (${latency}ms)`;
  } catch (err) {
    dbLatencyStr = `🔴 Lỗi: ${err instanceof Error ? err.message : String(err)}`;
  }

  // 3. Redis Ping
  let redisLatencyStr = '⚪️ Không cấu hình';
  try {
    const redis = await getRedis();
    if (redis) {
      const t0 = Date.now();
      await redis.ping();
      const latency = Date.now() - t0;
      redisLatencyStr = `🟢 Kết nối (${latency}ms)`;
    }
  } catch (err) {
    redisLatencyStr = `🔴 Lỗi: ${err instanceof Error ? err.message : String(err)}`;
  }

  // 4. Nick Zalo
  const whereFilter = orgId ? { orgId, archivedAt: null } : { archivedAt: null };
  const accounts = await runSystemQuery(() =>
    prisma.zaloAccount.findMany({
      where: whereFilter,
      select: { id: true },
    })
  );

  let connectedNicks = 0;
  let problematicNicks = 0;
  for (const acc of accounts) {
    const status = zaloPool.getStatus(acc.id);
    if (status === 'connected') {
      connectedNicks++;
    } else {
      problematicNicks++;
    }
  }

  // 5. Cron Jobs
  const cronSummary = cronTracker.getSummary();

  // 6. BullMQ Queues
  let groupScanStats = { waiting: 0, active: 0, failed: 0 };
  let labelQueueStats = { waiting: 0, active: 0, failed: 0 };
  let automationStats = { waiting: 0, active: 0, failed: 0 };

  try {
    groupScanStats = await getGroupScanQueueStats();
  } catch {}

  try {
    labelQueueStats = await getLabelQueueStats();
  } catch {}

  try {
    const autoQ = getAutomationQueue();
    const c = await autoQ.getJobCounts('waiting', 'active', 'failed');
    automationStats = {
      waiting: c.waiting ?? 0,
      active: c.active ?? 0,
      failed: c.failed ?? 0,
    };
  } catch {}

  const lines = [
    `🩺 <b>BÁO CÁO SỨC KHỎE HỆ THỐNG</b> ${envBadge}`,
    `🕐 <i>${nowStr}</i>`,
    '────────────────────',
    '🖥️ <b>Tài nguyên Máy chủ:</b>',
    `  • Uptime: <b>${uptimeStr}</b>`,
    `  • RAM Process: <b>${rssMb} MB</b> (Heap: ${heapUsedMb}/${heapTotalMb} MB)`,
    `  • Database (Postgres): ${dbLatencyStr}`,
    `  • Redis Cache: ${redisLatencyStr}`,
    '',
    `📱 <b>Tài khoản Zalo (${accounts.length} nick):</b>`,
    `  • 🟢 Đang kết nối: <b>${connectedNicks}/${accounts.length}</b> nick`,
    `  • ${problematicNicks > 0 ? '🔴' : '⚪️'} Mất kết nối / Khác: <b>${problematicNicks}</b> nick`,
    '',
    `⏰ <b>Tiến trình nền (Cron Jobs - ${cronSummary.total} jobs):</b>`,
    `  • 🟢 Hoạt động tốt: <b>${cronSummary.healthy}/${cronSummary.total}</b>`,
    `  • ${cronSummary.failing > 0 ? '🔴' : '⚪️'} Có lỗi: <b>${cronSummary.failing}</b>`,
    '',
    '📥 <b>Hàng đợi công việc (BullMQ):</b>',
    formatQueueLine('Quét nhóm (Group Scan)', groupScanStats),
    formatQueueLine('Tự động hóa (Automation)', automationStats),
    formatQueueLine('Đồng bộ nhãn (Zalo Label)', labelQueueStats),
    '────────────────────',
    '💡 <i>Gõ <code>/crons</code> để xem chi tiết từng tác vụ hoặc <code>/nicks</code> để xem danh sách nick.</i>',
  ];

  return lines.join('\n');
}

/**
 * Tạo danh sách chi tiết các Cron Job (/crons).
 * Hỗ trợ chia nhỏ tin nhắn nếu vượt giới hạn Telegram (3800 chars).
 */
export function formatCronListReport(): string[] {
  const envBadge = getEnvBadge();
  const nowStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const crons = cronTracker.getAll();

  if (crons.length === 0) {
    return [
      [
        `⏰ <b>DANH SÁCH TÁC VỤ NỀN (CRON JOBS)</b> ${envBadge}`,
        `🕐 <i>${nowStr}</i>`,
        '────────────────────',
        'ℹ️ Chưa có tiến trình nền nào được đăng ký trong hệ thống.',
      ].join('\n'),
    ];
  }

  const blocks: string[] = crons.map((entry: CronEntry) => {
    let icon = '🟢';
    let statusText = '🟢 Hoạt động tốt';
    if (entry.lastStatus === 'failed') {
      icon = '🔴';
      statusText = '🔴 Thất bại';
    } else if (entry.lastStatus === 'running') {
      icon = '🟡';
      statusText = '🟡 Đang chạy';
    } else if (entry.lastStatus === 'idle' && entry.totalRuns === 0) {
      icon = '⚪️';
      statusText = '⚪️ Chờ kích hoạt';
    }

    const durationStr = entry.lastDurationMs != null ? ` (${entry.lastDurationMs}ms)` : '';
    const lines = [
      `${icon} <b>${escapeHtml(entry.name)}</b> (${escapeHtml(entry.description)})`,
      `  • Chu kỳ: <code>${escapeHtml(entry.schedule)}</code>`,
      `  • Lần chạy cuối: ${formatTimeAgo(entry.lastRunAt)}${durationStr}`,
      `  • Tình trạng: ${statusText} (Tổng chạy: ${entry.totalRuns}, Lỗi: ${entry.failedRuns})`,
    ];

    if (entry.lastError) {
      lines.push(`  • Lỗi gần nhất: <code>${escapeHtml(entry.lastError.slice(0, 150))}</code>`);
    }

    return lines.join('\n');
  });

  return splitIntoTelegramChunks(
    `⏰ <b>DANH SÁCH TÁC VỤ NỀN (CRON JOBS)</b> ${envBadge}`,
    nowStr,
    blocks,
    '💡 <i>Gõ <code>/health</code> để xem tổng quan sức khỏe hệ thống.</i>'
  );
}

/**
 * Tạo danh sách trạng thái chi tiết từng nick Zalo (/nicks).
 */
export async function formatNicksReport(orgId: string): Promise<string[]> {
  const envBadge = getEnvBadge();
  const nowStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  const accounts = await runSystemQuery(() =>
    prisma.zaloAccount.findMany({
      where: { orgId, archivedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        displayName: true,
        phone: true,
        status: true,
        zaloUid: true,
        sessionData: true,
        lastConnectedAt: true,
        disconnectedAt: true,
        createdAt: true,
        disconnectReason: true,
      },
    })
  );

  if (accounts.length === 0) {
    return [
      [
        `📱 <b>TRẠNG THÁI NICK ZALO</b> ${envBadge}`,
        `🕐 <i>${nowStr}</i>`,
        '────────────────────',
        'ℹ️ Không tìm thấy tài khoản Zalo nào trong tổ chức.',
      ].join('\n'),
    ];
  }

  const blocks: string[] = accounts.map((acc) => {
    const liveStatus = zaloPool.getStatus(acc.id);
    let icon = '⚪️';
    let statusDesc = '⚪️ Chưa đăng nhập / Offline';

    if (liveStatus === 'connected') {
      icon = '🟢';
      statusDesc = '🟢 Đang kết nối (Online)';
    } else if (liveStatus === 'connecting') {
      icon = '🟡';
      statusDesc = '🟡 Đang kết nối lại...';
    } else if (liveStatus === 'qr_pending') {
      icon = '🟡';
      statusDesc = '🟡 Đang chờ quét QR';
    } else {
      if (acc.disconnectReason === 'manual') {
        icon = '⚪️';
        statusDesc = '⚪️ Đã ngắt kết nối thủ công';
      } else {
        icon = '🔴';
        statusDesc = '🔴 Mất kết nối (Offline)';
      }
    }

    const session = acc.sessionData as { imei?: string } | null;
    const sessionDesc = session?.imei ? 'Hợp lệ (IMEI active)' : 'Chưa có phiên / Mất phiên';
    const lastActiveTime = acc.lastConnectedAt || acc.disconnectedAt || acc.createdAt;
    const nameStr = escapeHtml(acc.displayName || 'Chưa đặt tên');
    const phoneStr = acc.phone ? ` (${escapeHtml(acc.phone)})` : '';

    return [
      `${icon} <b>${nameStr}</b>${phoneStr}`,
      `  • Trạng thái: ${statusDesc}`,
      `  • Phiên làm việc: ${sessionDesc}`,
      `  • Hoạt động gần nhất: ${formatTimeAgo(lastActiveTime)}`,
    ].join('\n');
  });

  return splitIntoTelegramChunks(
    `📱 <b>TRẠNG THÁI NICK ZALO</b> ${envBadge}`,
    nowStr,
    blocks,
    '💡 <i>Gõ <code>/health</code> để xem tổng quan sức khỏe hệ thống.</i>'
  );
}

/**
 * Gửi cảnh báo lỗi Cron Job tự động vào Telegram Admin.
 */
export async function sendCronFailureAlert(cronName: string, description: string, error: string): Promise<void> {
  const envBadge = getEnvBadge();
  const nowStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  const message = [
    `🚨 <b>[ZaloCRM - ${envBadge}] SỰ CỐ TÁC VỤ NỀN (CRON FAILED)</b>`,
    '',
    `📌 <b>Tác vụ:</b> <code>${escapeHtml(cronName)}</code> (${escapeHtml(description)})`,
    `❌ <b>Chi tiết lỗi:</b> <code>${escapeHtml(error.slice(0, 300))}</code>`,
    `🕐 <b>Thời gian:</b> <i>${nowStr}</i>`,
    '',
    '💡 <i>Vui lòng kiểm tra lại log container: <code>docker logs zalo-crm-app</code></i>',
  ].join('\n');

  // Tìm danh sách chat nhận thông báo quản trị
  const targetChatIds = new Set<string>();

  try {
    // 1. Integrations có type=telegram
    const integrations = await prisma.integration.findMany({
      where: { type: 'telegram', enabled: true },
      select: { config: true },
    });
    for (const int of integrations) {
      const cfg = int.config as { chatId?: string } | null;
      if (cfg?.chatId) targetChatIds.add(cfg.chatId);
    }

    // 2. TelegramBridgeConfig
    const bridges = await prisma.telegramBridgeConfig.findMany({
      where: { enabled: true, telegramChatId: { not: null } },
      select: { telegramChatId: true },
      take: 5,
    });
    for (const b of bridges) {
      if (b.telegramChatId) targetChatIds.add(b.telegramChatId);
    }

    if (targetChatIds.size > 0) {
      for (const chatId of targetChatIds) {
        await sendMessage(chatId, message);
      }
    } else {
      logger.warn(`[system-monitor] Không tìm thấy Telegram ChatId để gửi cảnh báo lỗi cron: ${cronName}`);
    }
  } catch (err) {
    logger.error(`[system-monitor] Gửi cảnh báo Telegram cho cron ${cronName} thất bại:`, err);
  }
}

// Kết nối handler cảnh báo vào cronTracker
cronTracker.setErrorAlertHandler(sendCronFailureAlert);

/**
 * Helper chia nhỏ các block thành nhiều tin nhắn Telegram nếu vượt ngưỡng 3800 ký tự.
 */
function splitIntoTelegramChunks(
  title: string,
  timeStr: string,
  blocks: string[],
  advice: string
): string[] {
  const MAX_CHARS = 3800;
  const headerTime = `🕐 <i>${timeStr}</i>\n────────────────────`;
  const footer = `────────────────────\n${advice}`;

  const chunkGroups: string[][] = [];
  let currentGroup: string[] = [];
  let currentLen = title.length + headerTime.length + footer.length + 50;

  for (const block of blocks) {
    const addedLen = block.length + 2;
    if (currentGroup.length > 0 && currentLen + addedLen > MAX_CHARS) {
      chunkGroups.push(currentGroup);
      currentGroup = [block];
      currentLen = title.length + headerTime.length + footer.length + 50 + addedLen;
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
        `${title}\n${headerTime}`,
        chunkGroups[0]?.join('\n\n') || '',
        footer,
      ].join('\n\n'),
    ];
  }

  return chunkGroups.map((group, idx) => {
    const isLast = idx === total - 1;
    const chunkBadge = ` <b>[${idx + 1}/${total}]</b>`;
    const chunkHeader = `${title}${chunkBadge}\n${headerTime}`;

    const parts = [chunkHeader, group.join('\n\n')];
    if (isLast) parts.push(footer);
    return parts.join('\n\n');
  });
}
