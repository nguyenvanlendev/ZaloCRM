<template>
  <Teleport to="body">
    <div v-if="open" class="cam-overlay" @click.self="onCancel">
      <div class="cam-modal" role="dialog" aria-modal="true">
        <!-- Head -->
        <div class="cam-head">
          <span class="cam-ic primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </span>
          <div class="cam-head__tx">
            <h2>Đổi tên gợi nhớ</h2>
            <p class="cam-sub">Tên này sẽ hiển thị thay thế tên Zalo gốc và tự động đồng bộ lên app Zalo (nếu còn Quota đổi tên).</p>
          </div>
          <button class="cam-x" aria-label="Đóng" @click="onCancel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <!-- Body -->
        <div class="cam-body">
          <label class="cam-label">Tên mới</label>
          <input
            ref="inputEl"
            v-model="alias"
            class="cam-input"
            placeholder="Nhập tên gợi nhớ..."
            autocomplete="off"
            @keydown.enter.exact.prevent="onConfirm"
          />
        </div>

        <!-- Foot -->
        <div class="cam-foot">
          <button class="cam-btn cam-btn--ghost" :disabled="busy" @click="onCancel">Hủy</button>
          <button
            class="cam-btn cam-btn--primary"
            :disabled="busy"
            @click="onConfirm"
          >
            <span v-if="busy" class="cam-spin" />
            Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';

const props = defineProps<{
  open: boolean;
  initialAlias?: string;
  busy?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [newAlias: string];
  cancel: [];
}>();

const alias = ref('');
const inputEl = ref<HTMLInputElement | null>(null);

// Mở modal → reset + focus ô nhập.
watch(() => props.open, (v) => {
  if (v) {
    alias.value = props.initialAlias || '';
    void nextTick(() => {
      inputEl.value?.focus();
      inputEl.value?.select();
    });
  }
});

function onConfirm(): void {
  if (props.busy) return;
  emit('confirm', alias.value.trim());
}

function onCancel(): void {
  if (props.busy) return;
  emit('cancel');
  emit('update:open', false);
}
</script>

<style scoped>
.cam-overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 26, 36, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  animation: cam-fade 0.15s ease;
}
@keyframes cam-fade { from { opacity: 0; } to { opacity: 1; } }

.cam-modal {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  width: 400px;
  max-width: calc(100vw - 32px);
  box-shadow: var(--sh-lg);
  animation: cam-slide 0.2s ease;
  display: flex;
  flex-direction: column;
}
@keyframes cam-slide {
  from { transform: translateY(16px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* Head */
.cam-head { display: flex; align-items: flex-start; gap: 11px; padding: 16px 16px 12px; }
.cam-ic {
  width: 34px; height: 34px; border-radius: var(--r-sm); flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
}
.cam-ic.primary { background: var(--brand-soft, #e0f2fe); color: var(--brand, #0284c7); }
.cam-head__tx { flex: 1; min-width: 0; }
.cam-head h2 { margin: 0; font-size: 14.5px; font-weight: 600; color: var(--ink); line-height: 1.35; }
.cam-sub { font-size: 12.5px; color: var(--ink-3); margin-top: 4px; line-height: 1.45; }
.cam-x {
  width: 26px; height: 26px; border-radius: var(--r-sm); border: 0; flex-shrink: 0;
  background: transparent; color: var(--ink-4); cursor: pointer; font-family: inherit;
  display: inline-flex; align-items: center; justify-content: center;
}
.cam-x:hover { background: var(--surface-3); color: var(--ink); }

/* Body */
.cam-body { padding: 2px 16px 16px; display: flex; flex-direction: column; }
.cam-label { font-size: 11.5px; font-weight: 600; color: var(--ink-2); margin-bottom: 6px; }
.cam-input {
  width: 100%; box-sizing: border-box;
  border: 1px solid var(--line); border-radius: var(--r-sm);
  padding: 8px 10px; font-family: inherit; font-size: 13px; color: var(--ink);
  background: var(--surface); transition: border-color 0.12s;
}
.cam-input:focus { outline: none; border-color: var(--brand); }

/* Foot */
.cam-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 16px 16px; border-top: 1px solid var(--line); }
.cam-btn {
  height: 36px; padding: 0 16px; border-radius: var(--r-sm);
  font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  border: 1px solid transparent; transition: 0.12s;
}
.cam-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.cam-btn--ghost { background: var(--surface); border-color: var(--line); color: var(--ink-2); }
.cam-btn--ghost:hover:not(:disabled) { background: var(--surface-3); }
.cam-btn--primary { background: var(--brand); color: #fff; }
.cam-btn--primary:hover:not(:disabled) { background: var(--brand-600); }

.cam-spin {
  width: 13px; height: 13px; border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff; border-radius: 50%; animation: cam-spin 0.7s linear infinite;
}
@keyframes cam-spin { to { transform: rotate(360deg); } }

svg { display: block; }
</style>
