// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * cron-tracker.ts — Registry & Lifecycle Tracker cho tất cả tiến trình nền (Cron Jobs).
 *
 * Pattern: Register + Report (Non-invasive):
 *  - Không can thiệp vào cách tổ chức code hay mutex của từng file cron.
 *  - Mỗi file cron chỉ gọi:
 *      1. register(name, { description, schedule })
 *      2. markRunning(name) khi bắt đầu tick
 *      3. markFinished(name, { ok, durationMs, error }) khi kết thúc tick
 *  - Tự động debounce / deduplicate cảnh báo Telegram khi có lỗi (tối đa 1 cảnh báo / 10 phút / job).
 */
import { logger } from '../../shared/utils/logger.js';
import { getRedis } from '../../shared/redis-client.js';

export interface CronEntry {
  name: string;
  description: string;
  schedule: string;
  lastRunAt: Date | null;
  lastDurationMs: number | null;
  lastStatus: 'success' | 'failed' | 'running' | 'idle';
  lastError: string | null;
  totalRuns: number;
  failedRuns: number;
}

type ErrorAlertHandler = (name: string, description: string, error: string) => Promise<void>;

class CronTracker {
  private registry = new Map<string, CronEntry>();
  private alertHandler: ErrorAlertHandler | null = null;
  private lastAlertTime = new Map<string, number>();

  /**
   * Đăng ký một cron job vào tracker. Idempotent.
   */
  register(name: string, meta: { description: string; schedule: string }): void {
    const existing = this.registry.get(name);
    if (!existing) {
      this.registry.set(name, {
        name,
        description: meta.description,
        schedule: meta.schedule,
        lastRunAt: null,
        lastDurationMs: null,
        lastStatus: 'idle',
        lastError: null,
        totalRuns: 0,
        failedRuns: 0,
      });
    } else {
      existing.description = meta.description;
      existing.schedule = meta.schedule;
    }
  }

  /**
   * Đánh dấu cron bắt đầu một chu kỳ chạy.
   */
  markRunning(name: string): void {
    const entry = this.registry.get(name);
    if (entry) {
      entry.lastStatus = 'running';
      entry.lastRunAt = new Date();
    }
  }

  /**
   * Đánh dấu cron đã kết thúc chu kỳ chạy (thành công hoặc thất bại).
   */
  markFinished(
    name: string,
    result: { ok: boolean; durationMs: number; error?: string }
  ): void {
    const entry = this.registry.get(name);
    if (!entry) return;

    entry.lastRunAt = new Date();
    entry.lastDurationMs = result.durationMs;
    entry.totalRuns += 1;

    if (result.ok) {
      entry.lastStatus = 'success';
      entry.lastError = null;
    } else {
      entry.lastStatus = 'failed';
      entry.failedRuns += 1;
      entry.lastError = result.error || 'Unknown error';

      // Kích hoạt cảnh báo Telegram (chống spam)
      void this.triggerErrorAlert(entry, entry.lastError);
    }
  }

  /**
   * Đăng ký hàm bắn cảnh báo lỗi (được nối bởi system-monitor-service).
   */
  setErrorAlertHandler(handler: ErrorAlertHandler): void {
    this.alertHandler = handler;
  }

  /**
   * Trả về toàn bộ danh sách cron đã đăng ký.
   */
  getAll(): CronEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * Trả về tóm tắt trạng thái phục vụ lệnh /health.
   */
  getSummary(): { total: number; healthy: number; failing: number; running: number } {
    let healthy = 0;
    let failing = 0;
    let running = 0;

    for (const entry of this.registry.values()) {
      if (entry.lastStatus === 'failed') {
        failing++;
      } else if (entry.lastStatus === 'running') {
        running++;
        healthy++;
      } else {
        healthy++;
      }
    }

    return {
      total: this.registry.size,
      healthy,
      failing,
      running,
    };
  }

  /**
   * Deduplicate & gửi alert khi cron job bị lỗi.
   */
  private async triggerErrorAlert(entry: CronEntry, error: string): Promise<void> {
    if (!this.alertHandler) return;

    const DEBOUNCE_MS = 10 * 60 * 1000; // 10 phút
    const now = Date.now();
    const key = `cron:alert:${entry.name}`;

    // 1. Kiểm tra Redis dedup nếu có
    const redis = await getRedis();
    if (redis) {
      try {
        const exists = await redis.exists(key);
        if (exists) return;
        await redis.set(key, '1', 'EX', 600); // 10 phút
      } catch {
        // fallback in-memory
      }
    }

    // 2. Kiểm tra In-memory dedup
    const lastTime = this.lastAlertTime.get(entry.name) || 0;
    if (now - lastTime < DEBOUNCE_MS) {
      return;
    }
    this.lastAlertTime.set(entry.name, now);

    try {
      await this.alertHandler(entry.name, entry.description, error);
    } catch (alertErr) {
      logger.error(`[cron-tracker] Lỗi khi gửi alert cho cron ${entry.name}:`, alertErr);
    }
  }
}

export const cronTracker = new CronTracker();
