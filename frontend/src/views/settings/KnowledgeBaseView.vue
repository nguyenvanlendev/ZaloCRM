<template>
  <div class="knowledge-base-page pb-12">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-4">
      <div>
        <h1 class="text-h4 d-flex align-center font-weight-bold">
          <v-icon class="mr-3" color="primary">mdi-graph</v-icon>
          GraphRAG Knowledge Base
        </h1>
        <p class="text-body-1 text-medium-emphasis mt-2">
          Quản lý tài liệu tri thức cho tổ chức. Hệ thống tự động phân tích và tạo GraphRAG để trả lời chat tự động.
        </p>
      </div>
    </div>

    <!-- Upload Section -->
    <v-card class="mb-6 elevation-1 rounded-lg border">
      <v-card-text>
        <div class="d-flex align-center">
          <v-file-input
            v-model="files"
            label="Chọn file tài liệu (PDF, TXT)"
            accept=".pdf,.txt"
            variant="outlined"
            density="compact"
            hide-details
            prepend-icon="mdi-file-document-outline"
            class="mr-4 flex-grow-1"
          ></v-file-input>
          
          <v-btn
            color="primary"
            prepend-icon="mdi-upload"
            :loading="uploading"
            :disabled="!files"
            @click="uploadDocument"
          >
            Tải lên
          </v-btn>
        </div>
        <v-alert v-if="error" type="error" density="compact" class="mt-4" closable @click:close="error = ''">
          {{ error }}
        </v-alert>
        <v-alert v-if="successMsg" type="success" density="compact" class="mt-4" closable @click:close="successMsg = ''">
          {{ successMsg }}
        </v-alert>
      </v-card-text>
    </v-card>

    <!-- Document List -->
    <v-card class="elevation-1 rounded-lg border">
      <v-card-title class="px-4 pt-4 pb-2 text-subtitle-1 font-weight-bold d-flex align-center">
        Danh sách tài liệu đã tải lên
        <v-spacer></v-spacer>
        <v-btn icon size="small" variant="text" @click="fetchDocuments" :loading="loading">
          <v-icon>mdi-refresh</v-icon>
        </v-btn>
      </v-card-title>
      
      <v-data-table
        :headers="headers"
        :items="documents"
        :loading="loading"
        no-data-text="Chưa có tài liệu nào"
        class="border-t"
      >
        <template #item.fileSize="{ item }">
          {{ formatBytes(item.fileSize) }}
        </template>
        <template #item.status="{ item }">
          <v-chip
            :color="statusColor(item.status)"
            size="small"
            variant="flat"
            class="text-uppercase font-weight-bold"
          >
            {{ item.status }}
          </v-chip>
        </template>
        <template #item.createdAt="{ item }">
          {{ new Date(item.createdAt).toLocaleString('vi-VN') }}
        </template>
        <template #item.actions="{ item }">
          <v-btn icon size="small" color="error" variant="text" title="Xóa tài liệu" @click="confirmDelete(item)">
            <v-icon>mdi-delete</v-icon>
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <!-- Delete Confirm -->
    <v-dialog v-model="showDelete" max-width="400">
      <v-card>
        <v-card-title>Xác nhận xóa</v-card-title>
        <v-card-text>
          Bạn có chắc muốn xóa tài liệu <b>{{ selectedDoc?.fileName }}</b> không? Dữ liệu đồ thị và vector liên quan cũng sẽ bị xóa.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showDelete = false">Hủy</v-btn>
          <v-btn color="error" :loading="deleting" @click="handleDelete">Xóa</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api';

const files = ref<File | null>(null);
const documents = ref<any[]>([]);
const loading = ref(false);
const uploading = ref(false);
const deleting = ref(false);
const error = ref('');
const successMsg = ref('');

const showDelete = ref(false);
const selectedDoc = ref<any>(null);

const headers = [
  { title: 'Tên file', key: 'fileName' },
  { title: 'Kích thước', key: 'fileSize' },
  { title: 'Trạng thái', key: 'status' },
  { title: 'Ngày tải', key: 'createdAt' },
  { title: 'Thao tác', key: 'actions', sortable: false, align: 'end' as const },
];

onMounted(() => {
  fetchDocuments();
});

async function fetchDocuments() {
  loading.value = true;
  try {
    const res = await api.get('/knowledge');
    documents.value = res.data.data || res.data;
  } catch (err: any) {
    console.error(err);
  } finally {
    loading.value = false;
  }
}

async function uploadDocument() {
  if (!files.value) return;
  const file = files.value;
  
  uploading.value = true;
  error.value = '';
  successMsg.value = '';
  
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    await api.post('/knowledge/upload', formData);
    
    successMsg.value = 'Tải lên thành công, hệ thống đang trích xuất GraphRAG...';
    files.value = null;
    fetchDocuments();
  } catch (err: any) {
    error.value = err.message || 'Lỗi khi tải tài liệu lên';
  } finally {
    uploading.value = false;
  }
}

function confirmDelete(doc: any) {
  selectedDoc.value = doc;
  showDelete.value = true;
}

async function handleDelete() {
  if (!selectedDoc.value) return;
  deleting.value = true;
  try {
    await api.delete(`/knowledge/${selectedDoc.value.id}`);
    showDelete.value = false;
    fetchDocuments();
  } catch (err: any) {
    error.value = err.message || 'Lỗi xóa tài liệu';
  } finally {
    deleting.value = false;
  }
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function statusColor(status: string) {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'error';
  return 'warning';
}
</script>
