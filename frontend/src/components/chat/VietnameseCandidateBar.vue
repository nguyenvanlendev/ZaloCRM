<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <transition name="candidate-fade">
    <div
      v-if="enabled && candidates.length > 0"
      class="vietnamese-candidate-bar"
      role="region"
      aria-label="Thanh gợi ý gõ tiếng Việt"
    >
      <div class="candidate-list">
        <button
          v-for="(word, idx) in candidates"
          :key="word"
          type="button"
          class="candidate-pill"
          :class="{ 'is-selected': idx === selectedIndex }"
          :title="`Chọn từ '${word}' (Phím ${idx + 1} hoặc Tab)`"
          @mousedown.prevent
          @click="$emit('select', word)"
        >
          <span class="candidate-badge">{{ idx + 1 }}</span>
          <span class="candidate-text">{{ word }}</span>
        </button>
      </div>

      <div class="candidate-meta">
        <span class="candidate-type-label">
          <span v-if="isNextWord" class="type-icon">✨ Tiếp theo</span>
          <span v-else class="type-icon">⚡ Gợi ý từ</span>
        </span>
        <span class="candidate-hotkey-hint">Tab / 1-{{ candidates.length }}</span>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
defineProps<{
  candidates: string[];
  selectedIndex?: number;
  isNextWord?: boolean;
  enabled: boolean;
}>();

defineEmits<{
  (e: 'select', word: string): void;
  (e: 'toggle'): void;
}>();
</script>

<style scoped>
.vietnamese-candidate-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 10px;
  background: var(--v-theme-surface, #ffffff);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 8px 8px 0 0;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.04);
  font-family: inherit;
  user-select: none;
  z-index: 10;
  transition: all 0.15s ease-in-out;
}

:global(.dark) .vietnamese-candidate-bar {
  background: #18191b;
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);
}

.candidate-list {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  overflow-x: auto;
}

.candidate-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: rgba(241, 245, 249, 0.7);
  color: #334155;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: all 0.12s ease;
  white-space: nowrap;
}

:global(.dark) .candidate-pill {
  background: rgba(255, 255, 255, 0.05);
  color: #cbd5e1;
}

.candidate-pill:hover {
  background: #e2e8f0;
  color: #0f172a;
  transform: translateY(-1px);
}

:global(.dark) .candidate-pill:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #f8fafc;
}

.candidate-pill.is-selected {
  background: rgba(219, 52, 46, 0.08);
  border-color: rgba(219, 52, 46, 0.35);
  color: #db342e;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(219, 52, 46, 0.1);
}

:global(.dark) .candidate-pill.is-selected {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: #f87171;
}

.candidate-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 10px;
  font-weight: 700;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.06);
  color: #64748b;
}

:global(.dark) .candidate-badge {
  background: rgba(255, 255, 255, 0.1);
  color: #94a3b8;
}

.candidate-pill.is-selected .candidate-badge {
  background: #db342e;
  color: #ffffff;
}

:global(.dark) .candidate-pill.is-selected .candidate-badge {
  background: #ef4444;
  color: #ffffff;
}

.candidate-text {
  letter-spacing: -0.01em;
}

.candidate-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
}

.candidate-type-label {
  font-weight: 500;
  color: #64748b;
}

:global(.dark) .candidate-type-label {
  color: #94a3b8;
}

.candidate-hotkey-hint {
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.04);
  font-family: monospace;
  font-size: 10px;
}

:global(.dark) .candidate-hotkey-hint {
  background: rgba(255, 255, 255, 0.06);
}

/* Animations */
.candidate-fade-enter-active,
.candidate-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.candidate-fade-enter-from,
.candidate-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
