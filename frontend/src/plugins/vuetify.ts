// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

/**
 * Vuetify theme — REDESIGN YOEDU CRM (migration 2026-06-05).
 * `hsLight` (default) = bộ token HS (teal-navy shell + metallic blue #1786be),
 * mirror PART 1 của hs-crm-theme.css. `smax-light`/`legacy-dark` giữ fallback
 * cho các view chưa migrate; sẽ rút ở cụm cleanup cuối.
 */
export const vuetify = createVuetify({
  components,
  directives,
  theme: {
    // hsLight làm mặc định. Bỏ đọc localStorage cũ (tránh kẹt 'smax-light').
    defaultTheme: 'hsLight',
    themes: {
      'hsLight': {
        dark: false,
        colors: {
          primary: '#e11d48',          // --brand (Crimson Rose)
          'primary-darken-1': '#be123c',
          secondary: '#64748b',        // --ink-3 (Slate 500)
          accent: '#fb7185',           // --brand-bright (Rose 400)
          background: '#f8fafc',       // --canvas / --surface-2 (Slate 50)
          surface: '#ffffff',
          'surface-variant': '#f1f4f9', // Slate 100
          success: '#10b981',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#0284c7',
          'nav-a': '#0f172a',
          'nav-b': '#0b0f17',
          'nav-accent': '#fb7185',
          'on-surface': '#0f172a',
          'on-background': '#0f172a',
          'on-primary': '#ffffff',
        },
        variables: {
          'border-color': '#e2e8f0',
          'border-opacity': 1,
          'high-emphasis-opacity': 1,
          'medium-emphasis-opacity': 0.78,
          'theme-radius': '8px',
        },
      },
      'smax-light': {
        dark: false,
        colors: {
          background: '#f5f6fa',
          surface: '#ffffff',
          'surface-variant': '#fafbfc',
          primary: '#1786be',
          secondary: '#1f2330',
          accent: '#1786be',
          error: '#ff3d00',
          warning: '#ff9100',
          success: '#00c853',
          info: '#2196f3',
          'on-background': '#212121',
          'on-surface': '#212121',
          'on-primary': '#ffffff',
          'on-secondary': '#ffffff',
        },
      },
      'legacy-dark': {
        dark: true,
        colors: {
          background: '#0A192F',
          surface: '#112240',
          'surface-variant': '#1D2D50',
          primary: '#00F2FF',
          secondary: '#E6F1FF',
          accent: '#00F2FF',
          error: '#FF5252',
          warning: '#FFB74D',
          success: '#4CAF50',
          info: '#00F2FF',
          'on-background': '#E6F1FF',
          'on-surface': '#E6F1FF',
          'on-primary': '#0A192F',
        },
      },
    },
  },
  defaults: {
    // HS defaults: nút bo md không uppercase, card bo lg viền, chip pill
    VBtn: { variant: 'flat', rounded: 'md', style: 'text-transform:none;letter-spacing:0;' },
    VTextField: { variant: 'outlined', density: 'compact' },
    VSelect: { variant: 'outlined', density: 'compact' },
    VAutocomplete: { variant: 'outlined', density: 'compact' },
    VTextarea: { variant: 'outlined', density: 'compact' },
    VCard: { rounded: 'lg', variant: 'flat' },
    VChip: { rounded: 'pill', size: 'small' },
    VDialog: { maxWidth: 600 },
  },
});

/* ── HS helpers (mirror hs-vuetify-theme.ts) — dùng trong template ── */
export function scoreLevel(score: number): 'zero' | 'low' | 'mid' | 'high' {
  if (score === 0) return 'zero';
  if (score < 40) return 'low';
  if (score < 70) return 'mid';
  return 'high';
}
export const SCORE_COLORS = {
  zero: { bg: '#eef1f6', fg: '#94a3b8' },
  low: { bg: '#fdf3e2', fg: '#b45309' },
  mid: { bg: '#e9f3ff', fg: '#1565c0' },
  high: { bg: '#e7f7ef', fg: '#157f3c' },
} as const;
export const REL_KIND = {
  friend: { label: 'Đã kết bạn', dot: '#12b76a', bg: '#e7f7ef', fg: '#157f3c' },
  pending_friend: { label: 'Đã gửi mời', dot: '#f5a524', bg: '#fdf3e2', fg: '#b45309' },
  chatting_stranger: { label: 'Đang nhắn lạ', dot: '#1786be', bg: '#e4f1f8', fg: '#1565c0' },
  ghost: { label: 'Đã ngắt', dot: '#9aa3b2', bg: '#f1f4f9', fg: '#475066' },
} as const;
