// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { describe, it, expect } from 'vitest';
import { normalizeShortcut } from '../../src/modules/automation/template-controller.js';

describe('normalizeShortcut', () => {
  it('handles empty or null values', () => {
    expect(normalizeShortcut(null)).toBeNull();
    expect(normalizeShortcut(undefined)).toBeNull();
    expect(normalizeShortcut('')).toBeNull();
    expect(normalizeShortcut('   ')).toBeNull();
  });

  it('strips leading slashes', () => {
    expect(normalizeShortcut('/chao')).toBe('chao');
    expect(normalizeShortcut('///chao')).toBe('chao');
  });

  it('normalizes vietnamese accents and converts to lowercase', () => {
    expect(normalizeShortcut('/ChàoKhách')).toBe('chaokhach');
    expect(normalizeShortcut('/học_phí')).toBe('hoc_phi');
    expect(normalizeShortcut('/Đăng_Ký')).toBe('dang_ky');
    expect(normalizeShortcut('/đáp_án')).toBe('dap_an');
  });

  it('removes spaces and special characters', () => {
    expect(normalizeShortcut('chao khach !@#')).toBe('chaokhach');
    expect(normalizeShortcut('gia-khoa-hoc_2026')).toBe('gia-khoa-hoc_2026');
  });
});
