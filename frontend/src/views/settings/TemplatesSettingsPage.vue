<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="templates-settings-page">
    <!-- Header -->
    <header class="tsp-header">
      <div class="tsp-title-row">
        <div class="tsp-icon">⚡</div>
        <div>
          <h1 class="tsp-h1">Quản lý Mẫu tin nhắn nhanh</h1>
          <p class="tsp-sub">
            Thiết lập danh sách tin nhắn mẫu, gán phím tắt <b>/shortcut</b> và sử dụng các biến cá nhân hóa để nhân viên chèn nhanh khi tư vấn khách hàng.
          </p>
        </div>
      </div>
    </header>

    <!-- Thống kê -->
    <div class="tsp-stats-grid">
      <div class="tsp-stat-card">
        <div class="tsp-stat-val">{{ templates.length }}</div>
        <div class="tsp-stat-lbl">Tổng số mẫu</div>
      </div>
      <div class="tsp-stat-card">
        <div class="tsp-stat-val text-primary">{{ publicCount }}</div>
        <div class="tsp-stat-lbl">Mẫu dùng chung</div>
      </div>
      <div class="tsp-stat-card">
        <div class="tsp-stat-val text-info">{{ personalCount }}</div>
        <div class="tsp-stat-lbl">Mẫu cá nhân</div>
      </div>
      <div class="tsp-stat-card">
        <div class="tsp-stat-val text-success">{{ totalUsage }}</div>
        <div class="tsp-stat-lbl">Tổng lượt sử dụng</div>
      </div>
    </div>

    <!-- Thanh công cụ: Tìm kiếm, Bộ lọc & Nút hành động -->
    <div class="tsp-toolbar">
      <div class="tsp-search-box">
        <v-icon size="16" class="tsp-search-ico">mdi-magnify</v-icon>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Tìm theo tên mẫu, /phím tắt hoặc nội dung..."
          class="tsp-search-input"
        />
        <button v-if="searchQuery" class="tsp-clear-btn" @click="searchQuery = ''">
          <v-icon size="14">mdi-close-circle</v-icon>
        </button>
      </div>

      <div class="tsp-filter-group">
        <select v-model="filterVisibility" class="tsp-select">
          <option value="">Tất cả phạm vi</option>
          <option value="public">Dùng chung (Cả nhóm)</option>
          <option value="private">Cá nhân</option>
        </select>

        <select v-model="filterFolderId" class="tsp-select">
          <option value="">Tất cả thư mục</option>
          <option value="none">Chưa phân thư mục</option>
          <option v-for="f in folders" :key="f.id" :value="f.id">
            📁 {{ f.name }}
          </option>
        </select>
      </div>

      <div class="tsp-action-group">
        <button class="tsp-btn-sec" @click="openFolderDialog">
          <v-icon size="16" class="mr-1">mdi-folder-outline</v-icon>
          Thư mục ({{ folders.length }})
        </button>
        <button class="tsp-btn-pri" @click="openCreateDialog">
          <v-icon size="16" class="mr-1">mdi-plus</v-icon>
          Tạo mẫu mới
        </button>
      </div>
    </div>

    <!-- Bảng danh sách mẫu -->
    <div class="tsp-table-card">
      <div v-if="loading" class="tsp-loading">
        <v-progress-circular indeterminate color="primary" size="28" />
        <span class="ml-2">Đang tải danh sách mẫu tin nhắn...</span>
      </div>

      <div v-else-if="filteredTemplates.length === 0" class="tsp-empty">
        <v-icon size="40" color="#cbd5e1">mdi-message-text-outline</v-icon>
        <div class="tsp-empty-title">Không tìm thấy mẫu tin nhắn nào</div>
        <p class="tsp-empty-desc">Tạo mẫu tin nhắn đầu tiên để nhân viên chèn nhanh khi nhắn tin với khách hàng.</p>
        <button class="tsp-btn-pri mt-3" @click="openCreateDialog">
          <v-icon size="16" class="mr-1">mdi-plus</v-icon>
          Tạo mẫu ngay
        </button>
      </div>

      <table v-else class="tsp-table">
        <thead>
          <tr>
            <th style="width: 130px;">Phím tắt</th>
            <th style="width: 200px;">Tên mẫu</th>
            <th>Nội dung xem trước</th>
            <th style="width: 140px;">Thư mục</th>
            <th style="width: 120px;">Phạm vi</th>
            <th style="width: 100px; text-align: center;">Lượt dùng</th>
            <th style="width: 110px; text-align: right;">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tpl in filteredTemplates" :key="tpl.id">
            <td>
              <span v-if="tpl.shortcut" class="tsp-badge-shortcut">
                /{{ tpl.shortcut }}
              </span>
              <span v-else class="text-muted">—</span>
            </td>
            <td>
              <div class="tsp-tpl-name">{{ tpl.name }}</div>
              <div v-if="tpl.category" class="tsp-tpl-cat">{{ tpl.category }}</div>
            </td>
            <td>
              <div class="tsp-tpl-content" :title="plainOf(tpl)">
                {{ plainOf(tpl) }}
              </div>
            </td>
            <td>
              <span v-if="getFolderName(tpl.folderId)" class="tsp-badge-folder">
                📁 {{ getFolderName(tpl.folderId) }}
              </span>
              <span v-else class="text-muted">—</span>
            </td>
            <td>
              <span
                class="tsp-badge-scope"
                :class="tpl.isPersonal ? 'personal' : 'public'"
              >
                <v-icon size="12" class="mr-1">
                  {{ tpl.isPersonal ? 'mdi-lock-outline' : 'mdi-account-group-outline' }}
                </v-icon>
                {{ tpl.isPersonal ? 'Cá nhân' : 'Dùng chung' }}
              </span>
            </td>
            <td style="text-align: center;">
              <span class="tsp-usage-count">{{ tpl.manualSendCount || 0 }}</span>
            </td>
            <td style="text-align: right;">
              <div class="tsp-row-actions">
                <button
                  class="tsp-act-btn"
                  title="Chỉnh sửa mẫu"
                  @click="openEditDialog(tpl)"
                >
                  <v-icon size="15">mdi-pencil-outline</v-icon>
                </button>
                <button
                  class="tsp-act-btn del"
                  title="Xoá mẫu"
                  @click="handleDeleteTemplate(tpl)"
                >
                  <v-icon size="15">mdi-delete-outline</v-icon>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- DIALOG TẠO / SỬA MẪU TIN NHẮN -->
    <v-dialog v-model="templateDialog" max-width="680" persistent>
      <div class="tsp-dialog-card">
        <div class="tsp-dialog-head">
          <div class="tsp-dialog-title">
            <v-icon size="20" color="#1786be">
              {{ editingTemplateId ? 'mdi-pencil' : 'mdi-plus-circle' }}
            </v-icon>
            <span>{{ editingTemplateId ? 'Chỉnh sửa mẫu tin nhắn' : 'Tạo mẫu tin nhắn mới' }}</span>
          </div>
          <button class="tsp-dialog-close" @click="templateDialog = false">
            <v-icon size="18">mdi-close</v-icon>
          </button>
        </div>

        <div class="tsp-dialog-body">
          <div v-if="dialogError" class="tsp-alert-error">
            <v-icon size="16" color="#dc2626">mdi-alert-circle-outline</v-icon>
            <span>{{ dialogError }}</span>
          </div>

          <div class="tsp-form-grid">
            <div class="tsp-form-group">
              <label class="tsp-label">Tên mẫu tin nhắn <span class="req">*</span></label>
              <input
                v-model="templateForm.name"
                class="tsp-input"
                placeholder="VD: Chào khách mới, Báo giá học phí..."
              />
            </div>

            <div class="tsp-form-group">
              <label class="tsp-label">Phím tắt nhanh (gõ / khi chat)</label>
              <div class="tsp-input-prefix">
                <span class="pfx">/</span>
                <input
                  v-model="templateForm.shortcut"
                  class="tsp-input"
                  placeholder="chao_khach"
                />
              </div>
            </div>
          </div>

          <div class="tsp-form-grid">
            <div class="tsp-form-group">
              <label class="tsp-label">Phạm vi chia sẻ</label>
              <select v-model="templateForm.visibility" class="tsp-select full">
                <option value="public">Dùng chung (Cả nhóm đều thấy)</option>
                <option value="private">Cá nhân (Chỉ mình tôi thấy)</option>
              </select>
            </div>

            <div class="tsp-form-group">
              <label class="tsp-label">Thư mục</label>
              <select v-model="templateForm.folderId" class="tsp-select full">
                <option :value="null">Không phân loại thư mục</option>
                <option v-for="f in folders" :key="f.id" :value="f.id">
                  📁 {{ f.name }}
                </option>
              </select>
            </div>
          </div>

          <!-- Chèn biến cá nhân hoá -->
          <div class="tsp-vars-section">
            <div class="tsp-vars-head">
              <label class="tsp-label mb-0">Biến cá nhân hóa</label>
              <span class="tsp-vars-hint">Nhấp vào biến để chèn vào vị trí con trỏ</span>
            </div>
            <div class="tsp-vars-chips">
              <button
                v-for="v in AVAILABLE_VARIABLES"
                :key="v.code"
                type="button"
                class="tsp-var-btn"
                :title="v.example ? `VD: ${v.example}` : v.label"
                @click="insertVariable(v.code)"
              >
                <span>{{ v.code }}</span>
                <span class="lbl">{{ v.label }}</span>
              </button>
            </div>
          </div>

          <!-- Nội dung soạn thảo -->
          <div class="tsp-form-group">
            <label class="tsp-label">Nội dung mẫu tin nhắn <span class="req">*</span></label>
            <textarea
              ref="contentEditorRef"
              v-model="templateForm.content"
              class="tsp-textarea"
              rows="5"
              placeholder="Nhập nội dung tin nhắn, dùng các biến như {gender}, {name}, {crm_full}..."
            ></textarea>
          </div>

          <!-- Live Preview -->
          <div class="tsp-preview-box">
            <div class="tsp-preview-title">
              <v-icon size="14" color="#0284c7">mdi-eye-outline</v-icon>
              <span>Xem trước thực tế (với dữ liệu mẫu):</span>
            </div>
            <div class="tsp-preview-content">
              {{ renderedPreviewText || '(Chưa có nội dung xem trước)' }}
            </div>
          </div>
        </div>

        <div class="tsp-dialog-foot">
          <button class="tsp-btn-sec" :disabled="saving" @click="templateDialog = false">
            Hủy
          </button>
          <button class="tsp-btn-pri" :disabled="saving" @click="submitTemplateForm">
            <v-progress-circular v-if="saving" indeterminate size="14" width="2" class="mr-1" />
            <span>{{ editingTemplateId ? 'Lưu thay đổi' : 'Tạo mẫu tin nhắn' }}</span>
          </button>
        </div>
      </div>
    </v-dialog>

    <!-- DIALOG QUẢN LÝ THƯ MỤC -->
    <v-dialog v-model="folderDialog" max-width="520">
      <div class="tsp-dialog-card">
        <div class="tsp-dialog-head">
          <div class="tsp-dialog-title">
            <v-icon size="20" color="#1786be">mdi-folder-cog-outline</v-icon>
            <span>Quản lý Thư mục Mẫu tin nhắn</span>
          </div>
          <button class="tsp-dialog-close" @click="folderDialog = false">
            <v-icon size="18">mdi-close</v-icon>
          </button>
        </div>

        <div class="tsp-dialog-body">
          <!-- Form tạo thư mục nhanh -->
          <div class="tsp-folder-create">
            <input
              v-model="newFolderName"
              class="tsp-input"
              placeholder="Nhập tên thư mục mới..."
              @keyup.enter="handleCreateFolder"
            />
            <button
              class="tsp-btn-pri"
              :disabled="!newFolderName.trim()"
              @click="handleCreateFolder"
            >
              Thêm thư mục
            </button>
          </div>

          <!-- Danh sách thư mục -->
          <div class="tsp-folder-list">
            <div v-if="folders.length === 0" class="tsp-empty-folder">
              Chưa có thư mục nào. Bạn có thể tạo thư mục để gom nhóm mẫu tin nhắn.
            </div>
            <div
              v-for="f in folders"
              :key="f.id"
              class="tsp-folder-item"
            >
              <div class="tsp-folder-info">
                <v-icon size="18" color="#eab308">mdi-folder</v-icon>
                <span class="tsp-folder-name">{{ f.name }}</span>
                <span class="tsp-folder-count">({{ f._count?.templates ?? 0 }} mẫu)</span>
              </div>
              <button
                class="tsp-act-btn del"
                title="Xóa thư mục"
                @click="handleDeleteFolder(f.id)"
              >
                <v-icon size="15">mdi-delete-outline</v-icon>
              </button>
            </div>
          </div>
        </div>

        <div class="tsp-dialog-foot">
          <button class="tsp-btn-pri" @click="folderDialog = false">
            Hoàn tất
          </button>
        </div>
      </div>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick } from 'vue';
import { useMessageTemplates, type MessageTemplate } from '@/composables/use-message-templates';

const {
  templates,
  folders,
  loading,
  saving,
  fetchTemplates,
  fetchFolders,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  createFolder,
  deleteFolder
} = useMessageTemplates();

const searchQuery = ref('');
const filterVisibility = ref('');
const filterFolderId = ref('');

// Dialog states
const templateDialog = ref(false);
const editingTemplateId = ref<string | null>(null);
const dialogError = ref('');
const contentEditorRef = ref<HTMLTextAreaElement | null>(null);

const templateForm = reactive({
  name: '',
  shortcut: '',
  visibility: 'public' as 'public' | 'private',
  folderId: null as string | null,
  content: '',
});

// Thư mục dialog
const folderDialog = ref(false);
const newFolderName = ref('');

// Danh sách biến cá nhân hoá đầy đủ
const AVAILABLE_VARIABLES = [
  { code: '{gender}', label: 'Xưng hô (Anh/Chị)', example: 'Anh' },
  { code: '{name}', label: 'Tên khách', example: 'Lộc' },
  { code: '{name_full}', label: 'Tên đầy đủ', example: 'Nguyễn Văn Lộc' },
  { code: '{crm_full}', label: 'Tên gợi nhớ', example: 'Lộc Q7' },
  { code: '{phone}', label: 'Số điện thoại', example: '0908 123 456' },
  { code: '{email}', label: 'Email', example: 'khachhang@gmail.com' },
  { code: '{sale}', label: 'Tên nhân viên', example: 'Vy' },
  { code: '{sale_full}', label: 'Tên đầy đủ nhân viên', example: 'Nguyễn Tường Vy' },
];

onMounted(async () => {
  await Promise.all([
    fetchTemplates({ includeArchived: false }),
    fetchFolders()
  ]);
});

// Stats
const publicCount = computed(() => templates.value.filter(t => !t.isPersonal).length);
const personalCount = computed(() => templates.value.filter(t => t.isPersonal).length);
const totalUsage = computed(() => templates.value.reduce((acc, t) => acc + (t.manualSendCount || 0), 0));

// Filtered templates
const filteredTemplates = computed(() => {
  return templates.value.filter(t => {
    if (filterVisibility.value === 'public' && t.isPersonal) return false;
    if (filterVisibility.value === 'private' && !t.isPersonal) return false;

    if (filterFolderId.value === 'none' && t.folderId) return false;
    if (filterFolderId.value && filterFolderId.value !== 'none' && t.folderId !== filterFolderId.value) return false;

    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      const matchName = t.name.toLowerCase().includes(q);
      const matchSc = (t.shortcut || '').toLowerCase().includes(q.replace(/^\/+/, ''));
      const matchContent = (t.content || t.contentRich?.text || '').toLowerCase().includes(q);
      return matchName || matchSc || matchContent;
    }

    return true;
  });
});

function getFolderName(folderId?: string | null): string {
  if (!folderId) return '';
  const f = folders.value.find(x => x.id === folderId);
  return f ? f.name : '';
}

function plainOf(tpl: MessageTemplate): string {
  return tpl.contentRich?.text ?? tpl.content ?? '';
}

// Live preview text
const renderedPreviewText = computed(() => {
  let text = templateForm.content;
  if (!text) return '';
  text = text.replace(/\{gender\}/g, 'Anh');
  text = text.replace(/\{name\}/g, 'Lộc');
  text = text.replace(/\{name_full\}/g, 'Nguyễn Văn Lộc');
  text = text.replace(/\{crm_full\}/g, 'Lộc Q7');
  text = text.replace(/\{phone\}/g, '0908 123 456');
  text = text.replace(/\{email\}/g, 'khachhang@gmail.com');
  text = text.replace(/\{sale\}/g, 'Vy');
  text = text.replace(/\{sale_full\}/g, 'Nguyễn Tường Vy');
  return text;
});

function openCreateDialog() {
  editingTemplateId.value = null;
  templateForm.name = '';
  templateForm.shortcut = '';
  templateForm.visibility = 'public';
  templateForm.folderId = null;
  templateForm.content = '';
  dialogError.value = '';
  templateDialog.value = true;
}

function openEditDialog(tpl: MessageTemplate) {
  editingTemplateId.value = tpl.id;
  templateForm.name = tpl.name;
  templateForm.shortcut = tpl.shortcut || '';
  templateForm.visibility = tpl.isPersonal ? 'private' : 'public';
  templateForm.folderId = tpl.folderId || null;
  templateForm.content = tpl.contentRich?.text || tpl.content || '';
  dialogError.value = '';
  templateDialog.value = true;
}

function insertVariable(code: string) {
  const textarea = contentEditorRef.value;
  if (!textarea) {
    templateForm.content += code;
    return;
  }
  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const current = templateForm.content;
  templateForm.content = current.substring(0, start) + code + current.substring(end);
  nextTick(() => {
    textarea.focus();
    const newPos = start + code.length;
    textarea.setSelectionRange(newPos, newPos);
  });
}

async function submitTemplateForm() {
  if (!templateForm.name.trim()) {
    dialogError.value = 'Vui lòng nhập tên mẫu tin nhắn';
    return;
  }
  if (!templateForm.content.trim()) {
    dialogError.value = 'Vui lòng nhập nội dung mẫu tin nhắn';
    return;
  }

  dialogError.value = '';
  try {
    const payload = {
      name: templateForm.name.trim(),
      shortcut: templateForm.shortcut.trim() || undefined,
      visibility: templateForm.visibility,
      folderId: templateForm.folderId || undefined,
      content: templateForm.content.trim(),
      contentRich: {
        text: templateForm.content.trim(),
        styles: []
      }
    };

    if (editingTemplateId.value) {
      await updateTemplate(editingTemplateId.value, payload);
    } else {
      await createTemplate(payload);
    }

    templateDialog.value = false;
    await fetchTemplates({ includeArchived: false });
    await fetchFolders();
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Có lỗi xảy ra, vui lòng thử lại';
  }
}

async function handleDeleteTemplate(tpl: MessageTemplate) {
  if (!confirm(`Bạn có chắc muốn xóa mẫu tin nhắn "${tpl.name}"?`)) return;
  try {
    await deleteTemplate(tpl.id);
    await fetchTemplates({ includeArchived: false });
    await fetchFolders();
  } catch (err: any) {
    alert(err.response?.data?.error || 'Không thể xóa mẫu tin nhắn');
  }
}

function openFolderDialog() {
  newFolderName.value = '';
  folderDialog.value = true;
}

async function handleCreateFolder() {
  if (!newFolderName.value.trim()) return;
  try {
    await createFolder({ name: newFolderName.value.trim(), visibility: 'public' });
    newFolderName.value = '';
    await fetchFolders();
  } catch (err: any) {
    alert(err.response?.data?.error || 'Không thể tạo thư mục');
  }
}

async function handleDeleteFolder(id: string) {
  if (!confirm('Bạn có chắc muốn xóa thư mục này? Các mẫu trong thư mục sẽ được đưa về mục Chưa phân loại.')) return;
  try {
    await deleteFolder(id, true);
    await fetchFolders();
    await fetchTemplates({ includeArchived: false });
  } catch (err: any) {
    alert(err.response?.data?.error || 'Không thể xóa thư mục');
  }
}
</script>

<style scoped>
.templates-settings-page {
  padding: 24px 28px 48px;
  max-width: 1200px;
  margin: 0 auto;
}

/* Header */
.tsp-header {
  margin-bottom: 24px;
}
.tsp-title-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.tsp-icon {
  font-size: 28px;
  line-height: 1;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 10px;
  padding: 10px;
}
.tsp-h1 {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 6px;
}
.tsp-sub {
  font-size: 13.5px;
  color: #64748b;
  margin: 0;
  line-height: 1.5;
}

/* Thống kê */
.tsp-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
.tsp-stat-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px 18px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}
.tsp-stat-val {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.2;
}
.tsp-stat-lbl {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
  margin-top: 4px;
}
.text-primary { color: #0284c7 !important; }
.text-info { color: #8b5cf6 !important; }
.text-success { color: #10b981 !important; }

/* Toolbar */
.tsp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.tsp-search-box {
  position: relative;
  flex: 1;
  min-width: 260px;
  max-width: 400px;
}
.tsp-search-ico {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
}
.tsp-search-input {
  width: 100%;
  height: 36px;
  padding: 0 28px 0 32px;
  font-size: 13px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: #ffffff;
  outline: none;
}
.tsp-search-input:focus {
  border-color: #0284c7;
  box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
}
.tsp-clear-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: none;
  color: #94a3b8;
  cursor: pointer;
}

.tsp-filter-group {
  display: flex;
  gap: 10px;
}
.tsp-select {
  height: 36px;
  padding: 0 10px;
  font-size: 13px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: #ffffff;
  color: #334155;
  outline: none;
}
.tsp-select:focus {
  border-color: #0284c7;
}
.tsp-select.full {
  width: 100%;
}

.tsp-action-group {
  display: flex;
  gap: 10px;
}
.tsp-btn-pri {
  height: 36px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 600;
  background: #0284c7;
  color: #ffffff;
  border: none;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  transition: background 0.15s ease;
}
.tsp-btn-pri:hover {
  background: #0369a1;
}
.tsp-btn-sec {
  height: 36px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  background: #ffffff;
  color: #334155;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.15s ease;
}
.tsp-btn-sec:hover {
  background: #f8fafc;
  border-color: #94a3b8;
}

/* Bảng */
.tsp-table-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}
.tsp-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: #64748b;
  font-size: 13.5px;
}
.tsp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}
.tsp-empty-title {
  font-size: 15px;
  font-weight: 600;
  color: #334155;
  margin-top: 12px;
}
.tsp-empty-desc {
  font-size: 13px;
  color: #64748b;
  max-width: 420px;
  margin: 6px 0 0;
}

.tsp-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.tsp-table th {
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  padding: 10px 14px;
  border-bottom: 1px solid #e2e8f0;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.tsp-table td {
  padding: 12px 14px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
  color: #1e293b;
  vertical-align: middle;
}
.tsp-table tbody tr:hover {
  background: #f8fafc;
}

.tsp-badge-shortcut {
  font-family: ui-monospace, monospace;
  font-size: 11.5px;
  font-weight: 600;
  color: #0284c7;
  background: #e0f2fe;
  padding: 2px 7px;
  border-radius: 5px;
  white-space: nowrap;
}
.tsp-tpl-name {
  font-weight: 600;
  color: #0f172a;
}
.tsp-tpl-cat {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}
.tsp-tpl-content {
  color: #475569;
  font-size: 12.5px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 420px;
}
.tsp-badge-folder {
  font-size: 11.5px;
  color: #475569;
  background: #f1f5f9;
  padding: 2px 7px;
  border-radius: 5px;
  white-space: nowrap;
}
.tsp-badge-scope {
  display: inline-flex;
  align-items: center;
  font-size: 11.5px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.tsp-badge-scope.public {
  background: #e0f2fe;
  color: #0369a1;
}
.tsp-badge-scope.personal {
  background: #f3e8ff;
  color: #6b21a8;
}
.tsp-usage-count {
  font-size: 12.5px;
  font-weight: 600;
  color: #334155;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 999px;
}

.tsp-row-actions {
  display: inline-flex;
  gap: 4px;
}
.tsp-act-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  border-radius: 6px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.12s ease;
}
.tsp-act-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}
.tsp-act-btn.del:hover {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #dc2626;
}

/* Dialog chung */
.tsp-dialog-card {
  background: #ffffff;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.tsp-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}
.tsp-dialog-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}
.tsp-dialog-close {
  border: none;
  background: none;
  color: #94a3b8;
  cursor: pointer;
  border-radius: 4px;
  padding: 2px;
}
.tsp-dialog-close:hover {
  color: #334155;
}

.tsp-dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 70vh;
  overflow-y: auto;
}
.tsp-dialog-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}

.tsp-alert-error {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.tsp-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.tsp-form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.tsp-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #334155;
}
.tsp-label .req {
  color: #ef4444;
}

.tsp-input {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  font-size: 13px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: #ffffff;
  outline: none;
}
.tsp-input:focus {
  border-color: #0284c7;
  box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
}

.tsp-input-prefix {
  display: flex;
  align-items: center;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: #ffffff;
  overflow: hidden;
}
.tsp-input-prefix:focus-within {
  border-color: #0284c7;
  box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
}
.tsp-input-prefix .pfx {
  padding: 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: #64748b;
  background: #f1f5f9;
  border-right: 1px solid #cbd5e1;
}
.tsp-input-prefix .tsp-input {
  border: none;
  box-shadow: none;
}

.tsp-textarea {
  width: 100%;
  padding: 10px;
  font-size: 13px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  outline: none;
  font-family: inherit;
  resize: vertical;
}
.tsp-textarea:focus {
  border-color: #0284c7;
  box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
}

/* Biến cá nhân hoá */
.tsp-vars-section {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
}
.tsp-vars-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.tsp-vars-hint {
  font-size: 11.5px;
  color: #64748b;
}
.tsp-vars-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.tsp-var-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  font-size: 11.5px;
  font-family: ui-monospace, monospace;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  color: #0284c7;
  cursor: pointer;
  transition: all 0.12s ease;
}
.tsp-var-btn .lbl {
  font-family: inherit;
  font-size: 10.5px;
  color: #64748b;
}
.tsp-var-btn:hover {
  background: #e0f2fe;
  border-color: #7dd3fc;
}

/* Live Preview */
.tsp-preview-box {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 10px 14px;
}
.tsp-preview-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  color: #166534;
  margin-bottom: 4px;
}
.tsp-preview-content {
  font-size: 12.5px;
  color: #14532d;
  line-height: 1.45;
  white-space: pre-wrap;
}

/* Quản lý Thư mục */
.tsp-folder-create {
  display: flex;
  gap: 8px;
}
.tsp-folder-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px;
}
.tsp-folder-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 6px;
  background: #f8fafc;
}
.tsp-folder-item:hover {
  background: #f1f5f9;
}
.tsp-folder-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
}
.tsp-folder-count {
  font-size: 11.5px;
  color: #64748b;
}
.tsp-empty-folder {
  padding: 16px;
  text-align: center;
  color: #94a3b8;
  font-size: 12.5px;
}
</style>
