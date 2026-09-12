import { describe, it, expect, vi } from 'vitest';
import { cronTracker } from '../../src/modules/system-monitor/cron-tracker.js';
import {
  escapeHtml,
  formatTimeAgo,
  formatCronListReport,
} from '../../src/modules/system-monitor/system-monitor-service.js';

describe('System Monitor - cronTracker', () => {
  it('registers, tracks execution and computes summary correctly', () => {
    // 1. Register a test cron
    cronTracker.register('test-cron-job', {
      description: 'Test Cron Description',
      schedule: '*/5 * * * *',
    });

    const entries = cronTracker.getAll();
    const entry = entries.find((e) => e.name === 'test-cron-job');
    expect(entry).toBeDefined();
    expect(entry?.description).toBe('Test Cron Description');
    expect(entry?.schedule).toBe('*/5 * * * *');
    expect(entry?.lastStatus).toBe('idle');
    expect(entry?.totalRuns).toBe(0);

    // 2. Mark running
    cronTracker.markRunning('test-cron-job');
    expect(entry?.lastStatus).toBe('running');
    expect(entry?.lastRunAt).toBeInstanceOf(Date);

    // 3. Mark finished success
    cronTracker.markFinished('test-cron-job', { ok: true, durationMs: 150 });
    expect(entry?.lastStatus).toBe('success');
    expect(entry?.lastDurationMs).toBe(150);
    expect(entry?.totalRuns).toBe(1);
    expect(entry?.failedRuns).toBe(0);

    // 4. Mark finished failure
    cronTracker.markFinished('test-cron-job', { ok: false, durationMs: 200, error: 'Connection refused' });
    expect(entry?.lastStatus).toBe('failed');
    expect(entry?.lastDurationMs).toBe(200);
    expect(entry?.totalRuns).toBe(2);
    expect(entry?.failedRuns).toBe(1);
    expect(entry?.lastError).toBe('Connection refused');

    // 5. Check summary
    const summary = cronTracker.getSummary();
    expect(summary.total).toBeGreaterThanOrEqual(1);
    expect(summary.failing).toBeGreaterThanOrEqual(1);
  });

  it('triggers alert handler on failure', async () => {
    const alertHandler = vi.fn().mockResolvedValue(undefined);
    cronTracker.setErrorAlertHandler(alertHandler);

    cronTracker.register('alert-test-cron', {
      description: 'Alert Test',
      schedule: '0 0 * * *',
    });

    cronTracker.markFinished('alert-test-cron', { ok: false, durationMs: 50, error: 'Simulated failure' });

    // Wait microtask
    await new Promise((r) => setTimeout(r, 10));
    expect(alertHandler).toHaveBeenCalledWith('alert-test-cron', 'Alert Test', 'Simulated failure');
  });
});

describe('System Monitor - formatters', () => {
  it('escapes HTML characters properly', () => {
    expect(escapeHtml('<script>alert("test" & 1)</script>')).toBe(
      '&lt;script&gt;alert(&quot;test&quot; &amp; 1)&lt;/script&gt;'
    );
  });

  it('formats relative time ago', () => {
    expect(formatTimeAgo(null)).toBe('Chưa chạy lần nào');
    const justNow = new Date();
    expect(formatTimeAgo(justNow)).toBe('0 giây trước');

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    expect(formatTimeAgo(twoMinutesAgo)).toBe('2 phút trước');

    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    expect(formatTimeAgo(twoHoursAgo)).toBe('2 giờ trước');

    const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000);
    expect(formatTimeAgo(threeDaysAgo)).toBe('3 ngày trước');
  });

  it('generates cron report text', () => {
    const chunks = formatCronListReport();
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]).toContain('DANH SÁCH TÁC VỤ NỀN');
    expect(chunks[0]).toContain('test-cron-job');
  });
});
