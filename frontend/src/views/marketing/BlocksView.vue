<template>
  <div class="blocks-view pa-6">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h1 class="text-h5 font-weight-bold color-primary d-flex align-center gap-2">
          <v-icon color="primary">mdi-cube-outline</v-icon>
          Khối nội dung (Blocks)
        </h1>
        <p class="text-body-2 text-medium-emphasis">
          Quản lý các nội dung tin nhắn và câu chào tự động tái sử dụng trong các kịch bản.
        </p>
      </div>
      <v-btn color="primary" prepend-icon="mdi-plus" elevation="2" @click="openCreateDialog">
        Tạo khối mới
      </v-btn>
    </div>

    <!-- Filters & Search -->
    <v-card class="mb-6 elevation-1 rounded-lg">
      <v-card-text class="pa-4 d-flex align-center gap-4 flex-wrap">
        <v-text-field
          v-model="searchQuery"
          placeholder="Tìm theo tên khối..."
          prepend-inner-icon="mdi-magnify"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 300px"
        />

        <v-chip-group v-model="filterType" selected-class="bg-primary" mandatory>
          <v-chip value="ALL" filter variant="outlined">Tất cả</v-chip>
          <v-chip value="send_message" filter variant="outlined">Gửi tin nhắn</v-chip>
          <v-chip value="request_friend" filter variant="outlined">Lời mời kết bạn</v-chip>
        </v-chip-group>

        <v-spacer />
        <v-btn icon="mdi-refresh" variant="text" density="comfortable" @click="fetchBlocks" :loading="loading" />
      </v-card-text>
    </v-card>

    <!-- Loading State -->
    <div v-if="loading" class="d-flex justify-center py-12">
      <v-progress-circular indeterminate color="primary" size="48" />
    </div>

    <!-- Empty State -->
    <v-card v-else-if="filteredBlocks.length === 0" class="text-center py-12 rounded-lg elevation-1">
      <v-icon size="64" color="grey-lighten-1">mdi-cube-off-outline</v-icon>
      <h3 class="text-h6 font-weight-medium mt-4">Chưa có khối nội dung nào</h3>
      <p class="text-body-2 text-medium-emphasis mb-4">Hãy tạo khối nội dung đầu tiên để ghép vào kịch bản bám đuổi.</p>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateDialog">Tạo khối nội dung</v-btn>
    </v-card>

    <!-- Grid List -->
    <v-row v-else>
      <v-col v-for="block in filteredBlocks" :key="block.id" cols="12" md="6" lg="4">
        <v-card class="block-card elevation-2 rounded-lg h-100 d-flex flex-column">
          <v-card-item class="pb-2">
            <div class="d-flex justify-space-between align-center mb-2">
              <v-chip
                :color="block.actionType === 'request_friend' ? 'purple' : 'info'"
                size="small"
                variant="flat"
                class="font-weight-medium"
              >
                <v-icon start size="14">
                  {{ block.actionType === 'request_friend' ? 'mdi-account-plus' : 'mdi-message-text' }}
                </v-icon>
                {{ block.actionType === 'request_friend' ? 'Lời mời kết bạn' : 'Gửi tin nhắn' }}
              </v-chip>

              <div class="d-flex gap-1">
                <v-btn icon="mdi-pencil-outline" size="x-small" variant="text" color="grey" @click="editBlock(block)" />
                <v-btn icon="mdi-delete-outline" size="x-small" variant="text" color="error" @click="confirmDelete(block)" />
              </div>
            </div>

            <v-card-title class="text-subtitle-1 font-weight-bold">{{ block.name }}</v-card-title>
          </v-card-item>

          <v-card-text class="flex-grow-1">
            <div class="content-preview bg-grey-lighten-4 pa-3 rounded border">
              <p class="text-body-2 text-pre-wrap mb-0">
                {{ getPreviewText(block) }}
              </p>
            </div>
            <div v-if="getVariantsCount(block) > 1" class="mt-2 text-caption text-primary font-weight-medium">
              <v-icon size="14" start>mdi-format-list-bulleted</v-icon>
              {{ getVariantsCount(block) }} biến thể nội dung (xoay vòng tránh spam)
            </div>
          </v-card-text>

          <v-divider />

          <v-card-actions class="px-4 py-2 text-caption text-medium-emphasis">
            <span>Tạo ngày: {{ formatDate(block.createdAt) }}</span>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <!-- Dialog Create / Edit -->
    <v-dialog v-model="dialog" max-width="600px" persistent>
      <v-card class="rounded-lg">
        <v-card-title class="text-h6 font-weight-bold pa-4 bg-primary text-white d-flex align-center justify-space-between">
          <span>{{ isEditing ? 'Chỉnh sửa khối nội dung' : 'Tạo khối nội dung mới' }}</span>
          <v-btn icon="mdi-close" variant="text" size="small" color="white" @click="dialog = false" />
        </v-card-title>

        <v-card-text class="pa-6">
          <v-form ref="formRef" v-model="valid">
            <v-text-field
              v-model="form.name"
              label="Tên khối *"
              placeholder="VD: Tin chào mừng KH mới"
              variant="outlined"
              density="comfortable"
              :rules="[v => !!v || 'Vui lòng nhập tên khối']"
              class="mb-4"
            />

            <v-select
              v-model="form.actionType"
              label="Loại hành động *"
              :items="[
                { title: 'Gửi tin nhắn (Chat)', value: 'send_message' },
                { title: 'Gửi lời mời kết bạn', value: 'request_friend' }
              ]"
              variant="outlined"
              density="comfortable"
              class="mb-4"
            />

            <div class="d-flex align-center justify-space-between mb-2">
              <label class="text-subtitle-2 font-weight-bold">Nội dung tin nhắn *</label>
              <div class="d-flex gap-1">
                <v-chip size="x-small" color="primary" variant="outlined" @click="insertVar('{name}')">+ {name}</v-chip>
                <v-chip size="x-small" color="primary" variant="outlined" @click="insertVar('{gender}')">+ {gender}</v-chip>
                <v-chip size="x-small" color="primary" variant="outlined" @click="insertVar('{sale}')">+ {sale}</v-chip>
              </div>
            </div>

            <v-textarea
              v-model="form.contentText"
              placeholder="Nhập nội dung tin nhắn tự động tại đây..."
              variant="outlined"
              rows="4"
              :rules="[v => !!v || 'Vui lòng nhập nội dung tin nhắn']"
              hint="Hỗ trợ biến cá nhân hóa: {name} = Tên KH, {gender} = Anh/Chị, {sale} = Tên Sale"
              persistent-hint
              class="mb-4"
            />
          </v-form>
        </v-card-text>

        <v-divider />

        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="outlined" color="grey" @click="dialog = false">Hủy</v-btn>
          <v-btn color="primary" elevation="2" :loading="saving" @click="saveBlock">Lưu khối</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog Confirm Delete -->
    <v-dialog v-model="deleteDialog" max-width="400px">
      <v-card class="rounded-lg">
        <v-card-title class="text-h6 font-weight-bold pa-4">Xác nhận xoá</v-card-title>
        <v-card-text class="px-4 py-2">
          Bạn có chắc chắn muốn xoá khối nội dung <strong>{{ selectedBlock?.name }}</strong> không?
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" color="grey" @click="deleteDialog = false">Hủy</v-btn>
          <v-btn color="error" :loading="deleting" @click="executeDelete">Xoá</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

interface BlockItem {
  id: string;
  name: string;
  actionType: string;
  content: any;
  createdAt: string;
}

const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const blocks = ref<BlockItem[]>([]);

const searchQuery = ref('');
const filterType = ref('ALL');

const dialog = ref(false);
const deleteDialog = ref(false);
const isEditing = ref(false);
const selectedBlock = ref<BlockItem | null>(null);
const valid = ref(false);

const form = ref({
  id: '',
  name: '',
  actionType: 'send_message',
  contentText: ''
});

const filteredBlocks = computed(() => {
  return blocks.value.filter(b => {
    const matchSearch = !searchQuery.value || b.name.toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchType = filterType.value === 'ALL' || b.actionType === filterType.value;
    return matchSearch && matchType;
  });
});

async function fetchBlocks() {
  loading.value = true;
  try {
    const res = await fetch('/api/v1/automation/blocks', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    if (res.ok) {
      blocks.value = await res.json();
    }
  } catch (e) {
    console.error('Lỗi tải danh sách blocks:', e);
  } finally {
    loading.value = false;
  }
}

function openCreateDialog() {
  isEditing.value = false;
  form.value = { id: '', name: '', actionType: 'send_message', contentText: '' };
  dialog.value = true;
}

function editBlock(block: BlockItem) {
  isEditing.value = true;
  selectedBlock.value = block;
  let text = '';
  if (block.content) {
    const variants = block.content.textVariants || block.content.greetingVariants;
    if (Array.isArray(variants) && variants.length > 0) {
      text = variants[0];
    } else if (typeof block.content.text === 'string') {
      text = block.content.text;
    }
  }

  form.value = {
    id: block.id,
    name: block.name,
    actionType: block.actionType,
    contentText: text
  };
  dialog.value = true;
}

function insertVar(varName: string) {
  form.value.contentText += ` ${varName}`;
}

async function saveBlock() {
  if (!form.value.name || !form.value.contentText) return;
  saving.value = true;

  const payload = {
    name: form.value.name,
    actionType: form.value.actionType,
    content: {
      textVariants: [form.value.contentText]
    }
  };

  try {
    const url = isEditing.value
      ? `/api/v1/automation/blocks/${form.value.id}`
      : '/api/v1/automation/blocks';
    const method = isEditing.value ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      dialog.value = false;
      await fetchBlocks();
    }
  } catch (e) {
    console.error('Lỗi lưu block:', e);
  } finally {
    saving.value = false;
  }
}

function confirmDelete(block: BlockItem) {
  selectedBlock.value = block;
  deleteDialog.value = true;
}

async function executeDelete() {
  if (!selectedBlock.value) return;
  deleting.value = true;

  try {
    const res = await fetch(`/api/v1/automation/blocks/${selectedBlock.value.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    if (res.ok) {
      deleteDialog.value = false;
      await fetchBlocks();
    }
  } catch (e) {
    console.error('Lỗi xoá block:', e);
  } finally {
    deleting.value = false;
  }
}

function getPreviewText(block: BlockItem): string {
  if (!block.content) return '(Không có nội dung)';
  const variants = block.content.textVariants || block.content.greetingVariants;
  if (Array.isArray(variants) && variants.length > 0) return variants[0];
  if (typeof block.content.text === 'string') return block.content.text;
  return JSON.stringify(block.content);
}

function getVariantsCount(block: BlockItem): number {
  if (!block.content) return 0;
  const variants = block.content.textVariants || block.content.greetingVariants;
  return Array.isArray(variants) ? variants.length : 1;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('vi-VN');
}

onMounted(() => {
  fetchBlocks();
});
</script>

<style scoped>
.block-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.block-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12) !important;
}
.content-preview {
  max-height: 120px;
  overflow-y: auto;
}
</style>
