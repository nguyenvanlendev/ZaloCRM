<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <Teleport to="body">
    <div v-if="visible" class="quick-template-popup" :style="popupStyle" @keydown="onKey">
      <div class="qtp-card">
        <!-- CHẾ ĐỘ 1: TẠO / SỬA MẪU NHANH -->
        <div v-if="isEditing" class="qtp-form-panel">
          <div class="qtp-form-head">
            <div class="qtp-form-title">
              <v-icon size="15" color="#e11d48">{{ editingId ? 'mdi-pencil' : 'mdi-plus-circle' }}</v-icon>
              <span>{{ editingId ? 'Chỉnh sửa mẫu tin nhắn' : 'Tạo mẫu tin nhắn mới' }}</span>
            </div>
            <button class="qtp-btn-icon" title="Đóng" @click="cancelEdit">
              <v-icon size="16">mdi-close</v-icon>
            </button>
          </div>

          <div class="qtp-form-body">
            <div v-if="formError" class="qtp-form-alert">
              <v-icon size="14" color="#dc2626">mdi-alert-circle-outline</v-icon>
              <span>{{ formError }}</span>
            </div>

            <div class="qtp-form-row">
              <div class="qtp-form-col">
                <label class="qtp-label">Tên mẫu <span class="req">*</span></label>
                <input
                  ref="nameInputRef"
                  v-model="formData.name"
                  class="qtp-input"
                  placeholder="VD: Chào khách mới, Báo giá..."
                  maxlength="100"
                />
              </div>
              <div class="qtp-form-col-sm">
                <label class="qtp-label">Phím tắt</label>
                <div class="qtp-input-prefix">
                  <span class="pfx">/</span>
                  <input
                    v-model="formData.shortcut"
                    class="qtp-input"
                    placeholder="chao_khach"
                    maxlength="30"
                  />
                </div>
              </div>
            </div>

            <div class="qtp-form-row">
              <div class="qtp-form-col">
                <label class="qtp-label">Phạm vi chia sẻ</label>
                <div class="qtp-scope-toggle">
                  <button
                    type="button"
                    class="qtp-scope-btn"
                    :class="{ active: formData.visibility === 'private' }"
                    @click="formData.visibility = 'private'"
                  >
                    <v-icon size="13">mdi-lock-outline</v-icon> Cá nhân
                  </button>
                  <button
                    type="button"
                    class="qtp-scope-btn"
                    :class="{ active: formData.visibility === 'public' }"
                    @click="formData.visibility = 'public'"
                  >
                    <v-icon size="13">mdi-account-group-outline</v-icon> Dùng chung (Cả nhóm)
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div class="qtp-label-row">
                <label class="qtp-label">Nội dung mẫu <span class="req">*</span></label>
                <span class="qtp-hint">Bấm chip để chèn biến</span>
              </div>

              <!-- Thanh chip biến cá nhân hoá nhanh -->
              <div class="qtp-var-bar">
                <button
                  v-for="v in QUICK_VARS"
                  :key="v.code"
                  type="button"
                  class="qtp-var-chip"
                  :title="v.example ? `VD: ${v.example}` : v.label"
                  @click="insertVar(v.code)"
                >
                  <v-icon size="11">{{ v.icon }}</v-icon>
                  <span>{{ v.code }}</span>
                </button>
              </div>

              <textarea
                ref="contentTextareaRef"
                v-model="formData.content"
                class="qtp-textarea"
                rows="4"
                placeholder="Nhập nội dung tin nhắn, dùng các biến như {gender}, {name}, {crm_full}..."
              ></textarea>
            </div>
          </div>

          <div class="qtp-form-foot">
            <button type="button" class="qtp-btn-secondary" :disabled="formSubmitting" @click="cancelEdit">
              Hủy
            </button>
            <button type="button" class="qtp-btn-primary" :disabled="formSubmitting" @click="submitForm">
              <v-progress-circular v-if="formSubmitting" indeterminate size="13" width="2" class="mr-1" />
              <span>{{ editingId ? 'Lưu cập nhật' : 'Tạo mẫu' }}</span>
            </button>
          </div>
        </div>

        <!-- CHẾ ĐỘ 2: DANH SÁCH MẪU -->
        <template v-else>
          <!-- Header: tiêu đề + nút Tạo mẫu -->
          <div class="qtp-head">
            <div class="qtp-title-row">
              <div class="qtp-title">
                <v-icon size="14" color="#e11d48">mdi-message-flash-outline</v-icon>
                <span>MẪU TIN NHẮN</span>
                <span class="qtp-count">{{ filtered.length }}</span>
              </div>
              <button class="qtp-create-btn" title="Tạo mẫu tin nhắn mới" @click="openCreateForm">
                <v-icon size="14">mdi-plus</v-icon>
                <span>Tạo mẫu</span>
              </button>
            </div>

            <!-- Ô tìm kiếm khi mở bằng nút (không có query từ dấu /) -->
            <div v-if="!query" class="qtp-search-wrap">
              <v-icon size="14" class="qtp-search-icon">mdi-magnify</v-icon>
              <input
                ref="searchInputRef"
                v-model="localSearch"
                class="qtp-search-input"
                placeholder="Tìm theo tên, /phím tắt hoặc nội dung..."
              />
              <button v-if="localSearch" class="qtp-search-clear" @click="localSearch = ''">
                <v-icon size="13">mdi-close-circle</v-icon>
              </button>
            </div>

            <!-- Bộ lọc chip -->
            <div class="qtp-tagbar">
              <button class="qtp-tag" :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">
                Tất cả
              </button>
              <button class="qtp-tag" :class="{ active: activeFilter === 'mine' }" @click="activeFilter = 'mine'">
                <v-icon size="11">mdi-account</v-icon> Cá nhân
              </button>
              <button class="qtp-tag" :class="{ active: activeFilter === 'public' }" @click="activeFilter = 'public'">
                <v-icon size="11">mdi-account-group</v-icon> Dùng chung
              </button>
              <button
                v-for="tag in dynamicTags"
                :key="tag"
                class="qtp-tag"
                :class="{ active: activeFilter === tag }"
                @click="activeFilter = activeFilter === tag ? 'all' : tag"
              >
                {{ tag }}
              </button>
            </div>
          </div>

          <!-- Xem trước (ở TRÊN danh sách) -->
          <div v-if="previewText" class="qtp-preview">
            <span class="qtp-preview-lbl">Xem trước:</span> {{ previewText }}
          </div>

          <!-- Danh sách mẫu -->
          <div class="qtp-list">
            <div
              v-for="(tpl, i) in filtered"
              :key="tpl.id"
              class="qtp-item"
              :class="{ active: i === selectedIndex }"
              @click="selectTemplate(tpl)"
              @mouseenter="selectedIndex = i"
            >
              <v-icon
                :icon="tpl.isPersonal ? 'mdi-account' : 'mdi-account-group'"
                size="15"
                :color="tpl.isPersonal ? '#e11d48' : '#9ca3af'"
                class="qtp-item-icon"
              />
              <div class="qtp-item-body">
                <div class="qtp-item-name">
                  <span>{{ tpl.name }}</span>
                  <span v-if="tpl.shortcut" class="qtp-item-sc">/{{ tpl.shortcut }}</span>
                </div>
                <div class="qtp-item-sub">{{ plainOf(tpl) }}</div>
              </div>

              <!-- Thao tác Sửa / Xóa cho mẫu cá nhân hoặc chủ sở hữu -->
              <div v-if="tpl.isMine || tpl.isPersonal" class="qtp-item-actions" @click.stop>
                <button class="qtp-item-act-btn" title="Chỉnh sửa mẫu" @click.stop="openEditForm(tpl)">
                  <v-icon size="13">mdi-pencil-outline</v-icon>
                </button>
                <button class="qtp-item-act-btn del" title="Xóa mẫu" @click.stop="confirmDelete(tpl)">
                  <v-icon size="13">mdi-delete-outline</v-icon>
                </button>
              </div>

              <span v-if="(tpl.tagIds || []).length" class="qtp-item-tag">
                {{ tpl.tagIds![0] }}
              </span>
            </div>

            <div v-if="!filtered.length" class="qtp-empty">
              <v-icon size="24" color="#cbd5e1" class="mb-1">mdi-message-text-outline</v-icon>
              <div>Không tìm thấy mẫu tin nhắn nào</div>
              <button class="qtp-empty-btn" @click="openCreateForm">
                ＋ Tạo mẫu mới ngay
              </button>
            </div>
          </div>

          <div class="qtp-foot">
            <span>↑↓ di chuyển</span> · <span>Enter chèn</span> · <span>Esc đóng</span>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch, nextTick, onBeforeUnmount } from 'vue';
import { api } from '@/api';

interface RichPayload { text: string; styles?: Array<{ st: string; start: number; len: number }> }
interface Template {
  id: string;
  name: string;
  shortcut?: string | null;
  content: string;
  contentRich?: RichPayload | null;
  category?: string | null;
  tagIds?: string[];
  isPersonal: boolean;
  isMine?: boolean;
}

interface ContactCtx {
  fullName?: string | null;
  gender?: string | null;
  crmAlias?: string | null;
}

const props = defineProps<{
  visible: boolean;
  query: string;
  templates: Template[];
  contact?: ContactCtx | null;
  saleFullName?: string | null;
  anchorEl?: HTMLElement | null;
}>();

const emit = defineEmits<{
  select: [payload: RichPayload, templateId: string];
  close: [];
  refresh: [];
}>();

const selectedIndex = ref(0);
const activeFilter = ref('all');
const localSearch = ref('');

// ── Biến cá nhân hóa phổ biến nhất để chèn nhanh ──
const QUICK_VARS = [
  { code: '{gender}', label: 'Giới tính (Anh/Chị)', icon: 'mdi-human-male-female', example: 'Anh' },
  { code: '{name}', label: 'Tên khách', icon: 'mdi-account-outline', example: 'Lộc' },
  { code: '{name_full}', label: 'Tên đầy đủ', icon: 'mdi-account', example: 'Nguyễn Văn Lộc' },
  { code: '{crm_full}', label: 'Tên gợi nhớ', icon: 'mdi-bookmark-outline', example: 'Lộc Q7' },
  { code: '{phone}', label: 'SĐT', icon: 'mdi-phone', example: '0908xxxxxx' },
  { code: '{sale}', label: 'Tên sale', icon: 'mdi-account-tie', example: 'Vy' },
];

// ── Chế độ Form Tạo / Sửa ──
const isEditing = ref(false);
const editingId = ref<string | null>(null);
const formSubmitting = ref(false);
const formError = ref('');
const nameInputRef = ref<HTMLInputElement | null>(null);
const contentTextareaRef = ref<HTMLTextAreaElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

const formData = reactive({
  name: '',
  shortcut: '',
  visibility: 'private' as 'public' | 'private',
  content: '',
});

function openCreateForm() {
  editingId.value = null;
  formData.name = '';
  formData.shortcut = '';
  formData.visibility = 'private';
  formData.content = '';
  formError.value = '';
  isEditing.value = true;
  nextTick(() => {
    nameInputRef.value?.focus();
  });
}

function openEditForm(tpl: Template) {
  editingId.value = tpl.id;
  formData.name = tpl.name;
  formData.shortcut = tpl.shortcut || '';
  formData.visibility = tpl.isPersonal ? 'private' : 'public';
  formData.content = tpl.contentRich?.text || tpl.content || '';
  formError.value = '';
  isEditing.value = true;
  nextTick(() => {
    nameInputRef.value?.focus();
  });
}

function cancelEdit() {
  isEditing.value = false;
  editingId.value = null;
  formError.value = '';
}

function insertVar(code: string) {
  const textarea = contentTextareaRef.value;
  if (!textarea) {
    formData.content += code;
    return;
  }
  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const current = formData.content;
  formData.content = current.substring(0, start) + code + current.substring(end);
  nextTick(() => {
    textarea.focus();
    const newPos = start + code.length;
    textarea.setSelectionRange(newPos, newPos);
  });
}

async function submitForm() {
  if (!formData.name.trim()) {
    formError.value = 'Vui lòng nhập tên mẫu tin nhắn';
    return;
  }
  if (!formData.content.trim()) {
    formError.value = 'Vui lòng nhập nội dung mẫu tin nhắn';
    return;
  }

  formSubmitting.value = true;
  formError.value = '';
  try {
    const payload = {
      name: formData.name.trim(),
      shortcut: formData.shortcut.trim() || undefined,
      visibility: formData.visibility,
      content: formData.content.trim(),
      contentRich: {
        text: formData.content.trim(),
        styles: [],
      },
    };

    if (editingId.value) {
      await api.put(`/automation/templates/${editingId.value}`, payload);
    } else {
      await api.post('/automation/templates', payload);
    }

    emit('refresh');
    cancelEdit();
  } catch (err: any) {
    formError.value = err.response?.data?.error || 'Có lỗi xảy ra, vui lòng thử lại';
  } finally {
    formSubmitting.value = false;
  }
}

async function confirmDelete(tpl: Template) {
  if (!confirm(`Bạn có chắc chắn muốn xóa mẫu tin nhắn "${tpl.name}"?`)) return;
  try {
    await api.delete(`/automation/templates/${tpl.id}`);
    emit('refresh');
  } catch (err: any) {
    alert(err.response?.data?.error || 'Không thể xóa mẫu tin nhắn');
  }
}

// ── Dynamic tags từ danh sách mẫu ──
const dynamicTags = computed(() => {
  const set = new Set<string>();
  (props.templates || []).forEach((t) => {
    (t.tagIds || []).forEach((tag) => {
      if (tag && tag.trim()) set.add(tag.trim());
    });
  });
  return Array.from(set).slice(0, 5);
});

// ── Định vị popup ngay trên ô nhập ──
const popupStyle = ref<Record<string, string>>({});
function recalcPosition() {
  const el = props.anchorEl;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const width = Math.min(500, Math.max(340, r.width));
  let left = r.left;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (left < 8) left = 8;
  popupStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    bottom: `${window.innerHeight - r.top + 6}px`,
    width: `${width}px`,
    maxHeight: `${Math.min(480, Math.max(340, r.top - 16))}px`,
  };
}

let onScrollResize: (() => void) | null = null;
watch(() => props.visible, async (v) => {
  if (v) {
    isEditing.value = false;
    localSearch.value = '';
    await nextTick();
    recalcPosition();
    if (!props.query) {
      searchInputRef.value?.focus();
    }
    onScrollResize = () => recalcPosition();
    window.addEventListener('resize', onScrollResize);
    window.addEventListener('scroll', onScrollResize, true);
  } else if (onScrollResize) {
    window.removeEventListener('resize', onScrollResize);
    window.removeEventListener('scroll', onScrollResize, true);
    onScrollResize = null;
  }
});
watch(() => props.query, () => { if (props.visible) recalcPosition(); });
onBeforeUnmount(() => {
  if (onScrollResize) {
    window.removeEventListener('resize', onScrollResize);
    window.removeEventListener('scroll', onScrollResize, true);
  }
});

function normQuery(q: string): string {
  return q.trim().replace(/^\/+/, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

const filtered = computed(() => {
  let list = props.templates || [];

  // Lọc theo tag / nhóm
  if (activeFilter.value === 'mine') {
    list = list.filter((t) => t.isPersonal || t.isMine);
  } else if (activeFilter.value === 'public') {
    list = list.filter((t) => !t.isPersonal);
  } else if (activeFilter.value !== 'all') {
    list = list.filter((t) => (t.tagIds || []).includes(activeFilter.value));
  }

  // Kết hợp query từ "/" hoặc ô tìm kiếm
  const qStr = (props.query || localSearch.value || '').toLowerCase().trim();
  if (qStr) {
    const qs = normQuery(qStr);
    const scored = list
      .map((t) => {
        const sc = (t.shortcut || '').toLowerCase();
        let score = -1;
        if (qs && sc) {
          if (sc === qs) score = 100;
          else if (sc.startsWith(qs)) score = 80;
          else if (sc.includes(qs)) score = 40;
        }
        if (score < 0) {
          if (t.name.toLowerCase().includes(qStr)) score = 20;
          else if (plainOf(t).toLowerCase().includes(qStr)) score = 10;
        }
        return { t, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score);
    list = scored.map((x) => x.t);
  }
  return list;
});

watch(filtered, () => { selectedIndex.value = 0; });
watch(() => props.query, () => { selectedIndex.value = 0; });
watch(localSearch, () => { selectedIndex.value = 0; });

function plainOf(tpl: Template): string {
  return tpl.contentRich?.text ?? tpl.content ?? '';
}

// ── Render 8 biến cá nhân hoá khớp ZaloCRM backend ──
function renderRich(tpl: Template): RichPayload {
  const src: RichPayload = tpl.contentRich?.text
    ? { text: tpl.contentRich.text, styles: tpl.contentRich.styles ?? [] }
    : { text: tpl.content ?? '', styles: [] };

  const gender = props.contact?.gender;
  const genderStr = gender === 'female' ? 'Chị' : gender === 'male' ? 'Anh' : 'Anh/Chị';
  const nameRaw = (props.contact?.fullName ?? '').trim();
  const nameLast = nameRaw ? (nameRaw.split(/\s+/).pop() ?? '') : '';
  const saleRaw = (props.saleFullName ?? '').trim();
  const saleLast = saleRaw ? (saleRaw.split(/\s+/).pop() ?? 'em') : 'em';
  const crmFull = ((props.contact?.crmAlias ?? '').trim()) || nameRaw;
  const crmWords = crmFull ? crmFull.split(/\s+/) : [];

  const repl: Record<string, string> = {
    '{gender}': genderStr,
    '{name}': nameLast,
    '{name_full}': nameRaw,
    '{crm_full}': crmFull,
    '{crm_first}': crmWords[0] ?? '',
    '{crm_last}': crmWords[crmWords.length - 1] ?? '',
    '{sale}': saleLast,
    '{sale_full}': saleRaw || 'em',
  };

  const styles = (src.styles ?? []).map((s) => ({ ...s }));
  let text = src.text;

  const tokenRe = /\{(gender|name_full|name|crm_full|crm_first|crm_last|sale_full|sale)\}/;
  let guard = 0;
  while (guard++ < 200) {
    const m = tokenRe.exec(text);
    if (!m) break;
    const at = m.index;
    const tokenLen = m[0].length;
    const value = repl[m[0]] ?? '';
    const delta = value.length - tokenLen;
    text = text.slice(0, at) + value + text.slice(at + tokenLen);
    if (delta !== 0) {
      for (const s of styles) {
        const end = s.start + s.len;
        if (s.start >= at + tokenLen) {
          s.start += delta;
        } else if (end > at && s.start <= at) {
          s.len += delta;
        } else if (s.start > at && s.start < at + tokenLen) {
          s.start = at + value.length;
        }
      }
    }
  }
  const clean = styles.filter((s) => s.len > 0 && s.start >= 0);
  return { text, styles: clean };
}

const previewText = computed(() => {
  const tpl = filtered.value[selectedIndex.value];
  if (!tpl) return '';
  return renderRich(tpl).text;
});

function selectTemplate(tpl: Template) {
  emit('select', renderRich(tpl), tpl.id);
}

function onKey(e: KeyboardEvent) {
  if (isEditing.value) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex.value = Math.min(selectedIndex.value + 1, filtered.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const tpl = filtered.value[selectedIndex.value];
    if (tpl) selectTemplate(tpl);
  } else if (e.key === 'Escape') {
    emit('close');
  }
}

defineExpose({ onKey });
</script>

<style scoped>
.quick-template-popup {
  z-index: 3000;
}
.qtp-card {
  width: 100%;
  height: 100%;
  background: #ffffff;
  border: 1px solid #e3e6eb;
  border-radius: 12px;
  box-shadow: 0 10px 32px rgba(20, 26, 36, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: inherit;
}

/* Header */
.qtp-head {
  padding: 8px 12px 8px;
  border-bottom: 1px solid #eef0f3;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #fbfcfd;
}
.qtp-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.qtp-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 700;
  color: #4b5563;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.qtp-count {
  background: var(--brand-soft, #ffe4e6);
  color: var(--brand-700, #9f1239);
  font-size: 10.5px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
}

.qtp-create-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--brand, #e11d48);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}
.qtp-create-btn:hover {
  background: #0f6ea3;
}

/* Search wrap */
.qtp-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.qtp-search-icon {
  position: absolute;
  left: 8px;
  color: #9ca3af;
  pointer-events: none;
}
.qtp-search-input {
  width: 100%;
  height: 28px;
  padding: 0 26px 0 28px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  outline: none;
  background: #ffffff;
  color: #111827;
}
.qtp-search-input:focus {
  border-color: var(--brand, #e11d48);
  box-shadow: 0 0 0 2px rgba(225, 29, 72, 0.15);
}
.qtp-search-clear {
  position: absolute;
  right: 6px;
  border: none;
  background: none;
  cursor: pointer;
  color: #9ca3af;
  display: flex;
  align-items: center;
}
.qtp-search-clear:hover {
  color: #4b5563;
}

/* Tagbar */
.qtp-tagbar {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.qtp-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 999px;
  color: #4b5563;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}
.qtp-tag:hover {
  border-color: var(--brand, #e11d48);
  color: var(--brand, #e11d48);
}
.qtp-tag.active {
  background: var(--brand-soft, #ffe4e6);
  border-color: var(--brand, #e11d48);
  color: var(--brand-700, #9f1239);
  font-weight: 600;
}

/* Xem trước */
.qtp-preview {
  padding: 7px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #eef0f3;
  font-size: 12px;
  color: #334155;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.qtp-preview-lbl {
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
}

/* Danh sách */
.qtp-list {
  flex: 1;
  min-height: 120px;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px 6px;
}
.qtp-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  background: none;
  border-radius: 7px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}
.qtp-item:hover,
.qtp-item.active {
  background: #f0f7fc;
}
.qtp-item-icon {
  flex-shrink: 0;
}
.qtp-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.qtp-item-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
}
.qtp-item-sc {
  font-size: 10.5px;
  font-weight: 600;
  color: #0284c7;
  background: #e0f2fe;
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 6px;
  font-family: ui-monospace, monospace;
}
.qtp-item-sub {
  font-size: 11.5px;
  color: #64748b;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.qtp-item-tag {
  flex-shrink: 0;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 5px;
  background: #f1f5f9;
  color: #475569;
  font-weight: 500;
  white-space: nowrap;
}

/* Thao tác Sửa / Xóa khi hover item */
.qtp-item-actions {
  display: none;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  flex-shrink: 0;
}
.qtp-item:hover .qtp-item-actions {
  display: flex;
}
.qtp-item-act-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #ffffff;
  color: #64748b;
  cursor: pointer;
}
.qtp-item-act-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}
.qtp-item-act-btn.del:hover {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #ef4444;
}

.qtp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 12px;
  text-align: center;
  color: #94a3b8;
  font-size: 12.5px;
}
.qtp-empty-btn {
  margin-top: 8px;
  background: var(--brand, #e11d48);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

/* Footer hint */
.qtp-foot {
  padding: 5px 12px;
  border-top: 1px solid #eef0f3;
  font-size: 10.5px;
  color: #94a3b8;
  text-align: center;
  background: #fbfcfd;
}

/* ── Panel Form Tạo / Sửa ── */
.qtp-form-panel {
  display: flex;
  flex-direction: column;
  max-height: 460px;
}
.qtp-form-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #eef0f3;
  background: #f8fafc;
}
.qtp-form-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}
.qtp-btn-icon {
  border: none;
  background: none;
  cursor: pointer;
  color: #94a3b8;
  display: flex;
  align-items: center;
  border-radius: 4px;
  padding: 2px;
}
.qtp-btn-icon:hover {
  color: #334155;
  background: #e2e8f0;
}

.qtp-form-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}
.qtp-form-alert {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11.5px;
}

.qtp-form-row {
  display: flex;
  gap: 10px;
}
.qtp-form-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.qtp-form-col-sm {
  width: 120px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.qtp-label {
  font-size: 11.5px;
  font-weight: 600;
  color: #475569;
}
.qtp-label .req {
  color: #ef4444;
}
.qtp-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.qtp-hint {
  font-size: 10.5px;
  color: #94a3b8;
}

.qtp-input {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  font-size: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  outline: none;
  background: #ffffff;
  color: #0f172a;
}
.qtp-input:focus {
  border-color: var(--brand, #e11d48);
  box-shadow: 0 0 0 2px rgba(225, 29, 72, 0.15);
}

.qtp-input-prefix {
  display: flex;
  align-items: center;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  overflow: hidden;
}
.qtp-input-prefix:focus-within {
  border-color: var(--brand, #e11d48);
  box-shadow: 0 0 0 2px rgba(225, 29, 72, 0.15);
}
.qtp-input-prefix .pfx {
  padding: 0 7px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  background: #f1f5f9;
  border-right: 1px solid #e2e8f0;
}
.qtp-input-prefix .qtp-input {
  border: none;
  box-shadow: none;
  padding-left: 6px;
}

.qtp-scope-toggle {
  display: flex;
  gap: 6px;
}
.qtp-scope-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 8px;
  font-size: 11.5px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  border-radius: 6px;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s ease;
}
.qtp-scope-btn:hover {
  border-color: var(--brand, #e11d48);
  color: var(--brand, #e11d48);
}
.qtp-scope-btn.active {
  background: #e0f2fe;
  border-color: #0284c7;
  color: #0369a1;
  font-weight: 600;
}

.qtp-var-bar {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.qtp-var-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  font-size: 10.5px;
  font-family: ui-monospace, monospace;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  color: #0369a1;
  cursor: pointer;
  transition: all 0.12s ease;
}
.qtp-var-chip:hover {
  background: #e0f2fe;
  border-color: #7dd3fc;
  color: #0284c7;
}

.qtp-textarea {
  width: 100%;
  padding: 8px;
  font-size: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  outline: none;
  background: #ffffff;
  color: #0f172a;
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}
.qtp-textarea:focus {
  border-color: var(--brand, #e11d48);
  box-shadow: 0 0 0 2px rgba(225, 29, 72, 0.15);
}

.qtp-form-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 14px;
  border-top: 1px solid #eef0f3;
  background: #f8fafc;
}
.qtp-btn-secondary {
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #475569;
  border-radius: 6px;
  cursor: pointer;
}
.qtp-btn-secondary:hover {
  background: #f1f5f9;
}
.qtp-btn-primary {
  display: flex;
  align-items: center;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  background: var(--brand, #e11d48);
  color: #ffffff;
  border-radius: 6px;
  cursor: pointer;
}
.qtp-btn-primary:hover {
  background: var(--brand-600, #be123c);
}
.qtp-btn-primary:disabled,
.qtp-btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
