// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * metric-cron.ts — Cron job gửi báo cáo Metric & Quota SDK định kỳ 1 giờ qua Telegram.
 * Chạy vào phút thứ 0 của mỗi giờ (0 * * * *), theo múi giờ Asia/Ho_Chi_Minh.
 */
import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '../../shared/utils/logger.js';
import { cronTracker } from './cron-tracker.js';
import { sendHourlyMetricReport } from '../zalo/quota-alert-service.js';

let task: ScheduledTask | null = null;

export function startMetricCron(): void {
  if (task) return;

  const schedule = process.env.METRIC_HOURLY_CRON_SCHEDULE || '0 * * * *';

  // Đăng ký thông tin cron vào cronTracker
  cronTracker.register('metric-hourly-report', {
    description: 'Báo cáo tổng hợp Metric & Quota SDK định kỳ 1 giờ gửi Telegram',
    schedule: `${schedule} (Asia/Ho_Chi_Minh)`,
  });

  task = cron.schedule(
    schedule,
    async () => {
      logger.info('[metric-cron] Bắt đầu chạy tiến trình gửi metric định kỳ 1 giờ...');
      const startedAt = Date.now();
      cronTracker.markRunning('metric-hourly-report');
      try {
        const result = await sendHourlyMetricReport();
        const durationMs = Date.now() - startedAt;
        if (!result.success) {
          logger.warn(`[metric-cron] Gửi metric hoàn tất với cảnh báo: ${result.error}`);
          await cronTracker.markFinished('metric-hourly-report', {
            ok: false,
            durationMs,
            error: result.error,
          });
        } else {
          logger.info(`[metric-cron] Đã gửi báo cáo metric thành công tới ${result.targetChatCount} kênh Telegram.`);
          await cronTracker.markFinished('metric-hourly-report', {
            ok: true,
            durationMs,
          });
        }
      } catch (err) {
        const durationMs = Date.now() - startedAt;
        logger.error('[metric-cron] Lỗi ngoại lệ khi chạy metric-cron:', err);
        await cronTracker.markFinished('metric-hourly-report', {
          ok: false,
          durationMs,
          error: String(err),
        });
      }
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
  );

  logger.info(`[metric-cron] Đã kích hoạt Cron Báo cáo Metric 1h (${schedule}, Asia/Ho_Chi_Minh).`);
}

export function stopMetricCron(): void {
  if (task) {
    task.stop();
    task = null;
    logger.info('[metric-cron] Đã dừng Cron Báo cáo Metric 1h.');
  }
}
