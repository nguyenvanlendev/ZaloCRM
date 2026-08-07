<template>
  <div class="rpt-automation pa-6">
    <div class="d-flex justify-space-between align-center mb-6">
      <div>
        <h2 class="text-h5 font-weight-bold">Automation (MVP)</h2>
        <p class="text-body-2 text-medium-emphasis">Quản lý các kịch bản chăm sóc khách hàng tự động.</p>
      </div>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="createNewSequence">
        Tạo kịch bản mới
      </v-btn>
    </div>

    <v-card class="border" elevation="0">
      <v-data-table
        :headers="headers"
        :items="sequences"
        :loading="loading"
        hover
      >
        <template #item.isActive="{ item }">
          <v-chip
            :color="item.isActive ? 'success' : 'default'"
            size="small"
            variant="flat"
          >
            {{ item.isActive ? 'Đang chạy' : 'Tạm dừng' }}
          </v-chip>
        </template>
        
        <template #item.actions="{ item }">
          <v-btn icon="mdi-pencil-outline" size="small" variant="text" @click="editSequence(item)" />
          <v-btn icon="mdi-delete-outline" color="error" size="small" variant="text" @click="deleteSequence(item)" />
        </template>

        <template #no-data>
          <div class="pa-6 text-center text-medium-emphasis">
            <v-icon icon="mdi-robot-outline" size="48" class="mb-2 opacity-50" />
            <p>Chưa có kịch bản automation nào.</p>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Dialog tạo kịch bản mới -->
    <v-dialog v-model="showCreateDialog" max-width="500">
      <v-card>
        <v-card-title class="text-h6 font-weight-bold pt-4 px-6">Tạo kịch bản mới</v-card-title>
        <v-card-text class="px-6 pt-2">
          <v-text-field
            v-model="newSequence.name"
            label="Tên kịch bản"
            variant="outlined"
            density="comfortable"
            placeholder="VD: Chăm sóc khách hàng sau 3 ngày"
            class="mb-4"
          />
          <v-textarea
            v-model="newSequence.description"
            label="Mô tả"
            variant="outlined"
            density="comfortable"
            placeholder="Mô tả ngắn gọn về kịch bản này"
            rows="3"
            hide-details
          />
        </v-card-text>
        <v-card-actions class="px-6 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="showCreateDialog = false">Hủy</v-btn>
          <v-btn color="primary" variant="flat" :loading="isCreating" @click="submitCreateSequence">Tạo mới</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';

const toast = useToast();
const loading = ref(false);
const sequences = ref<any[]>([]);

const showCreateDialog = ref(false);
const isCreating = ref(false);
const newSequence = ref({ name: '', description: '' });

const headers = [
  { title: 'Tên kịch bản', key: 'name' },
  { title: 'Trạng thái', key: 'enabled' },
  { title: 'Số bước (Steps)', key: '_count.sequenceSteps' },
  { title: 'Thao tác', key: 'actions', sortable: false, align: 'end' as const },
];

async function loadSequences() {
  loading.value = true;
  try {
    const res = await api.get('/automation/sequences');
    sequences.value = res.data;
  } catch (err: any) {
    if (err.response?.status !== 404) {
      toast.error('Lỗi tải danh sách kịch bản: ' + err.message);
    }
  } finally {
    loading.value = false;
  }
}

function createNewSequence() {
  newSequence.value = { name: '', description: '' };
  showCreateDialog.value = true;
}

async function submitCreateSequence() {
  if (!newSequence.value.name.trim()) {
    toast.error('Vui lòng nhập tên kịch bản');
    return;
  }
  
  isCreating.value = true;
  try {
    await api.post('/automation/sequences', newSequence.value);
    toast.success('Tạo kịch bản thành công');
    showCreateDialog.value = false;
    loadSequences(); // reload the list
  } catch (err: any) {
    toast.error('Lỗi khi tạo kịch bản: ' + (err.response?.data?.error || err.message));
  } finally {
    isCreating.value = false;
  }
}

function editSequence(item: any) {
  toast.push('Sửa kịch bản: ' + item.name);
}

function deleteSequence(item: any) {
  toast.warning('Xóa kịch bản: ' + item.name);
}

onMounted(() => {
  loadSequences();
});
</script>

<style scoped>
.rpt-automation {
  max-width: 1200px;
  margin: 0 auto;
}
</style>
