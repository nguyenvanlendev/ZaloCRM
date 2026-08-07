<template>
  <div class="sequences-view pa-6">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h1 class="text-h5 font-weight-bold color-primary d-flex align-center gap-2">
          <v-icon color="primary">mdi-sitemap-outline</v-icon>
          Luồng kịch bản (Sequences)
        </h1>
        <p class="text-body-2 text-medium-emphasis">
          Tạo các kịch bản bám đuổi tự động theo chuỗi thời gian cho khách hàng.
        </p>
      </div>
      <v-btn color="primary" prepend-icon="mdi-plus" elevation="2" @click="openCreateDialog">
        Tạo luồng kịch bản
      </v-btn>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="d-flex justify-center py-12">
      <v-progress-circular indeterminate color="primary" size="48" />
    </div>

    <!-- Empty State -->
    <v-card v-else-if="sequences.length === 0" class="text-center py-12 rounded-lg elevation-1">
      <v-icon size="64" color="grey-lighten-1">mdi-transit-connection-variant</v-icon>
      <h3 class="text-h6 font-weight-medium mt-4">Chưa có luồng kịch bản nào</h3>
      <p class="text-body-2 text-medium-emphasis mb-4">Hãy tạo luồng kịch bản đầu tiên để tự động chăm sóc khách hàng.</p>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateDialog">Tạo luồng kịch bản</v-btn>
    </v-card>

    <!-- List of Sequences -->
    <div v-else class="d-flex flex-column gap-4">
      <v-card v-for="seq in sequences" :key="seq.id" class="seq-card elevation-2 rounded-lg pa-4 mb-4">
        <div class="d-flex justify-space-between align-center mb-4">
          <div>
            <div class="d-flex align-center gap-3 mb-1">
              <h2 class="text-h6 font-weight-bold mb-0">{{ seq.name }}</h2>
              <v-chip :color="seq.enabled ? 'success' : 'grey'" size="x-small" variant="flat">
                {{ seq.enabled ? 'Đang bật' : 'Đã tắt' }}
              </v-chip>
            </div>
            <p v-if="seq.description" class="text-body-2 text-medium-emphasis mb-0">{{ seq.description }}</p>
          </div>

          <div class="d-flex align-center gap-2">
            <v-btn
              color="primary"
              variant="tonal"
              prepend-icon="mdi-account-plus"
              size="small"
              @click="openEnrollDialog(seq)"
            >
              Gán KH (Enroll)
            </v-btn>

            <v-btn
              color="secondary"
              variant="outlined"
              prepend-icon="mdi-plus"
              size="small"
              @click="openAddStepDialog(seq)"
            >
              Thêm bước
            </v-btn>
          </div>
        </div>

        <!-- Steps Timeline / Steps list -->
        <v-divider class="mb-4" />

        <div class="steps-timeline mb-4">
          <h4 class="text-subtitle-2 font-weight-bold mb-3 d-flex align-center gap-2">
            <v-icon size="18" color="primary">mdi-format-list-checks</v-icon>
            Các bước gửi tin ({{ seq.sequenceSteps?.length || 0 }} bước):
          </h4>

          <div v-if="!seq.sequenceSteps || seq.sequenceSteps.length === 0" class="text-caption text-medium-emphasis italic pa-3 bg-grey-lighten-4 rounded">
            Chưa có bước gửi tin nào. Bấm "Thêm bước" để thêm khối nội dung vào kịch bản.
          </div>

          <div v-else class="d-flex flex-column gap-2">
            <div
              v-for="(step, idx) in seq.sequenceSteps"
              :key="step.id"
              class="step-item d-flex align-center justify-space-between pa-3 bg-grey-lighten-4 rounded border"
            >
              <div class="d-flex align-center gap-3">
                <v-avatar color="primary" size="28" class="text-caption font-weight-bold text-white">
                  {{ idx + 1 }}
                </v-avatar>
                <div>
                  <div class="text-body-2 font-weight-bold">
                    {{ step.block?.name || 'Khối không tên' }}
                  </div>
                  <div class="text-caption text-medium-emphasis">
                    Độ trễ: {{ step.delayMinutes === 0 ? 'Gửi ngay lập tức' : `Sau ${step.delayMinutes} phút` }}
                  </div>
                </div>
              </div>

              <v-btn
                icon="mdi-close"
                size="x-small"
                variant="text"
                color="error"
                @click="deleteStep(seq.id, step.id)"
              />
            </div>
          </div>
        </div>

        <!-- Counters Footer -->
        <div class="d-flex align-center justify-space-between text-caption text-medium-emphasis bg-grey-lighten-5 pa-2 px-3 rounded">
          <div class="d-flex gap-4">
            <span><v-icon size="14" start>mdi-account-group</v-icon> Đã gán: <strong>{{ seq.enrolledCount || 0 }}</strong> KH</span>
            <span><v-icon size="14" start color="success">mdi-check-all</v-icon> Hoàn thành: <strong>{{ seq.completedCount || 0 }}</strong> KH</span>
          </div>
          <span>Tạo ngày: {{ formatDate(seq.createdAt) }}</span>
        </div>
      </v-card>
    </div>

    <!-- Dialog Create Sequence -->
    <v-dialog v-model="createDialog" max-width="500px">
      <v-card class="rounded-lg">
        <v-card-title class="text-h6 font-weight-bold pa-4 bg-primary text-white">Tạo luồng kịch bản mới</v-card-title>
        <v-card-text class="pa-6">
          <v-text-field
            v-model="createForm.name"
            label="Tên kịch bản *"
            placeholder="VD: Kịch bản bám đuổi KH quan tâm Khóa học"
            variant="outlined"
            density="comfortable"
            class="mb-4"
          />
          <v-textarea
            v-model="createForm.description"
            label="Mô tả"
            placeholder="Ghi chú thêm về kịch bản này..."
            variant="outlined"
            rows="3"
          />
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="outlined" color="grey" @click="createDialog = false">Hủy</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveSequence">Tạo kịch bản</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog Add Step -->
    <v-dialog v-model="stepDialog" max-width="500px">
      <v-card class="rounded-lg">
        <v-card-title class="text-h6 font-weight-bold pa-4 bg-primary text-white">Thêm bước vào kịch bản</v-card-title>
        <v-card-text class="pa-6">
          <v-select
            v-model="stepForm.blockId"
            label="Chọn Khối nội dung *"
            :items="availableBlocks"
            item-title="name"
            item-value="id"
            variant="outlined"
            density="comfortable"
            class="mb-4"
          />

          <v-text-field
            v-model.number="stepForm.delayMinutes"
            label="Độ trễ sau bước trước (Số phút) *"
            type="number"
            min="0"
            variant="outlined"
            density="comfortable"
            hint="0 = Gửi ngay lập tức sau bước trước"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="outlined" color="grey" @click="stepDialog = false">Hủy</v-btn>
          <v-btn color="primary" :loading="savingStep" @click="saveStep">Thêm bước</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog Enroll Contact -->
    <v-dialog v-model="enrollDialog" max-width="500px">
      <v-card class="rounded-lg">
        <v-card-title class="text-h6 font-weight-bold pa-4 bg-primary text-white">
          Kích hoạt Kịch bản cho Khách Hàng
        </v-card-title>
        <v-card-text class="pa-6">
          <p class="text-body-2 mb-4">
            Chọn hoặc nhập Friend ID của Khách Hàng để thử nghiệm chạy kịch bản bám đuổi <strong>{{ selectedSeq?.name }}</strong>.
          </p>

          <v-select
            v-if="friends.length > 0"
            v-model="enrollForm.friendId"
            label="Chọn Khách Hàng (Bạn bè Zalo)"
            :items="friends"
            item-title="displayName"
            item-value="id"
            variant="outlined"
            density="comfortable"
            class="mb-4"
          />

          <v-text-field
            v-model="enrollForm.friendId"
            label="Nhập trực tiếp Friend ID *"
            placeholder="Mã Friend ID trong DB"
            variant="outlined"
            density="comfortable"
            hint="Friend ID là mã duy nhất của khách hàng trong hệ thống ZaloCRM"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="outlined" color="grey" @click="enrollDialog = false">Hủy</v-btn>
          <v-btn color="success" prepend-icon="mdi-rocket-launch" :loading="enrolling" @click="executeEnroll">
            Kích hoạt ngay
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface SequenceItem {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  enrolledCount: number;
  completedCount: number;
  sequenceSteps: Array<{
    id: string;
    stepOrder: number;
    delayMinutes: number;
    block?: { id: string; name: string };
  }>;
  createdAt: string;
}

const loading = ref(false);
const saving = ref(false);
const savingStep = ref(false);
const enrolling = ref(false);

const sequences = ref<SequenceItem[]>([]);
const availableBlocks = ref<any[]>([]);
const friends = ref<any[]>([]);

const createDialog = ref(false);
const stepDialog = ref(false);
const enrollDialog = ref(false);

const selectedSeq = ref<SequenceItem | null>(null);

const createForm = ref({ name: '', description: '' });
const stepForm = ref({ blockId: '', delayMinutes: 0 });
const enrollForm = ref({ friendId: '' });

async function fetchSequences() {
  loading.value = true;
  try {
    const res = await fetch('/api/v1/automation/sequences', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    if (res.ok) {
      sequences.value = await res.json();
    }
  } catch (e) {
    console.error('Lỗi tải danh sách kịch bản:', e);
  } finally {
    loading.value = false;
  }
}

async function fetchBlocks() {
  try {
    const res = await fetch('/api/v1/automation/blocks', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    if (res.ok) {
      availableBlocks.value = await res.json();
    }
  } catch (e) {
    console.error('Lỗi tải danh sách blocks:', e);
  }
}

async function fetchFriends() {
  try {
    const res = await fetch('/api/v1/friends?limit=50', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    if (res.ok) {
      const data = await res.json();
      const list = data.items || data;
      if (Array.isArray(list)) {
        friends.value = list.map((f: any) => ({
          id: f.id,
          displayName: `${f.zaloDisplayName || f.aliasInNick || 'KH không tên'} (${f.zaloUidInNick || f.id})`
        }));
      }
    }
  } catch (e) {
    console.error('Lỗi tải danh sách bạn bè:', e);
  }
}

function openCreateDialog() {
  createForm.value = { name: '', description: '' };
  createDialog.value = true;
}

async function saveSequence() {
  if (!createForm.value.name) return;
  saving.value = true;

  try {
    const res = await fetch('/api/v1/automation/sequences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(createForm.value)
    });

    if (res.ok) {
      createDialog.value = false;
      await fetchSequences();
    }
  } catch (e) {
    console.error('Lỗi tạo kịch bản:', e);
  } finally {
    saving.value = false;
  }
}

function openAddStepDialog(seq: SequenceItem) {
  selectedSeq.value = seq;
  stepForm.value = { blockId: availableBlocks.value[0]?.id || '', delayMinutes: 0 };
  stepDialog.value = true;
}

async function saveStep() {
  if (!selectedSeq.value || !stepForm.value.blockId) return;
  savingStep.value = true;

  try {
    const res = await fetch(`/api/v1/automation/sequences/${selectedSeq.value.id}/steps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(stepForm.value)
    });

    if (res.ok) {
      stepDialog.value = false;
      await fetchSequences();
    }
  } catch (e) {
    console.error('Lỗi thêm step:', e);
  } finally {
    savingStep.value = false;
  }
}

async function deleteStep(seqId: string, stepId: string) {
  try {
    const res = await fetch(`/api/v1/automation/sequences/${seqId}/steps/${stepId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    if (res.ok) {
      await fetchSequences();
    }
  } catch (e) {
    console.error('Lỗi xoá step:', e);
  }
}

function openEnrollDialog(seq: SequenceItem) {
  selectedSeq.value = seq;
  enrollForm.value = { friendId: friends.value[0]?.id || '' };
  enrollDialog.value = true;
}

async function executeEnroll() {
  if (!selectedSeq.value || !enrollForm.value.friendId) return;
  enrolling.value = true;

  try {
    const res = await fetch(`/api/v1/automation/sequences/${selectedSeq.value.id}/enroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ friendId: enrollForm.value.friendId })
    });

    if (res.ok) {
      enrollDialog.value = false;
      await fetchSequences();
    }
  } catch (e) {
    console.error('Lỗi kích hoạt kịch bản:', e);
  } finally {
    enrolling.value = false;
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('vi-VN');
}

onMounted(() => {
  fetchSequences();
  fetchBlocks();
  fetchFriends();
});
</script>

<style scoped>
.seq-card {
  border-left: 4px solid var(--v-primary-base, #0e445a);
}
.step-item {
  transition: background-color 0.2s ease;
}
.step-item:hover {
  background-color: #eee !important;
}
</style>
