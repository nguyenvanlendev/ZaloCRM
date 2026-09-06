<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  CreateUserQuickModal.vue
  Modal cho admin tạo user nhanh (không qua Zalo handshake).
  Chỉ cần điền Tên, SĐT/Email, Mật khẩu, Phòng ban, Nhóm quyền.
-->
<template>
  <div v-if="open" class="cuwz-overlay" @click.self="tryClose">
    <div class="cuwz-modal">
      <header class="cuwz-header">
        <h2>⚡ Tạo nhanh nhân viên (không Zalo)</h2>
        <button class="cuwz-close" @click="tryClose" :disabled="creating">×</button>
      </header>

      <div class="cuwz-body">
        <div class="cuwz-field">
          <label>Họ và tên đầy đủ <span class="req">*</span></label>
          <input v-model="form.fullName" type="text" placeholder="VD: Nguyễn Văn A" />
        </div>

        <div class="cuwz-row">
          <div class="cuwz-field flex1">
            <label>SĐT <span class="req" v-if="!form.email">*</span></label>
            <input v-model="form.phone" type="tel" placeholder="VD: 0908278807" />
          </div>
          <div class="cuwz-field flex1">
            <label>Email <span class="req" v-if="!form.phone">*</span></label>
            <input v-model="form.email" type="email" placeholder="Nhập email" />
          </div>
        </div>
        <div class="cuwz-hint" style="margin-top: -10px; margin-bottom: 16px;">
          Bắt buộc ít nhất 1 trong 2 (Email hoặc SĐT) để làm tên đăng nhập.
        </div>

        <div class="cuwz-field">
          <label>Mật khẩu <span class="req">*</span></label>
          <input v-model="form.password" type="text" placeholder="Nhập mật khẩu cho nhân viên" />
        </div>

        <div class="cuwz-row">
          <div class="cuwz-field flex1">
            <label>Phòng ban</label>
            <select v-model="form.departmentId">
              <option value="">— Chưa gán —</option>
              <option v-for="d in flatDepts" :key="d.id" :value="d.id">
                {{ '— '.repeat(d._depth) }}{{ d.name }}
              </option>
            </select>
          </div>

          <div class="cuwz-field flex1">
            <label>Nhóm quyền</label>
            <select v-model="form.permissionGroupId">
              <option value="">— Chưa gán —</option>
              <option v-for="g in flatGroups" :key="g.id" :value="g.id">
                {{ '— '.repeat(g._depth) }}{{ g.name }}
              </option>
            </select>
          </div>
        </div>

        <div v-if="createError" class="cuwz-alert error">{{ createError }}</div>

        <footer class="cuwz-footer" style="margin-top: 24px;">
          <button class="btn-secondary" @click="tryClose" :disabled="creating">Huỷ</button>
          <button
            class="btn-primary"
            :disabled="!canCreate || creating"
            @click="onConfirmCreate"
          >
            <span v-if="creating">⏳ Đang tạo...</span>
            <span v-else>✅ Xác nhận tạo nhân viên</span>
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { api } from '@/api/index';

interface DeptNode {
  id: string;
  name: string;
  _depth: number;
}
interface GroupNode {
  id: string;
  name: string;
  _depth: number;
}

interface Props {
  open: boolean;
  departments: DeptNode[];
  permissionGroups: GroupNode[];
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'created'): void;
}>();

const form = reactive({
  fullName: '',
  phone: '',
  email: '',
  password: '',
  departmentId: '',
  permissionGroupId: '',
});
const creating = ref(false);
const createError = ref('');

const flatDepts = computed(() => props.departments || []);
const flatGroups = computed(() => props.permissionGroups || []);

const canCreate = computed(() => {
  return form.fullName.trim().length > 0 &&
         form.password.trim().length > 0 &&
         (form.phone.trim().length > 0 || form.email.trim().length > 0);
});

async function onConfirmCreate() {
  if (!canCreate.value) return;
  creating.value = true;
  createError.value = '';
  try {
    const res = await api.post('/users', {
      fullName: form.fullName.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      password: form.password.trim(),
      role: 'member',
    });
    
    // Nếu người dùng có chọn phòng ban hoặc nhóm quyền, update chúng qua PUT
    const userId = res.data.id;
    if (form.departmentId || form.permissionGroupId) {
      await api.put(`/users/${userId}`, {
        departmentId: form.departmentId || null,
        permissionGroupId: form.permissionGroupId || null,
        fullName: form.fullName.trim(),
        role: 'member'
      });
    }

    emit('created');
    emit('update:open', false);
    
    // Reset form
    form.fullName = '';
    form.phone = '';
    form.email = '';
    form.password = '';
    form.departmentId = '';
    form.permissionGroupId = '';
  } catch (err: any) {
    createError.value = err?.response?.data?.error || 'Tạo user thất bại';
  } finally {
    creating.value = false;
  }
}

function tryClose() {
  if (creating.value) return;
  emit('update:open', false);
}
</script>

<style scoped>
.cuwz-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.cuwz-modal {
  background: var(--cream, #fffaf2); border-radius: 14px; width: 100%; max-width: 560px;
  max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}
.cuwz-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 22px; border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
.cuwz-header h2 { margin: 0; font-size: 18px; font-weight: 600; }
.cuwz-close {
  border: 0; background: transparent; font-size: 24px; cursor: pointer;
  width: 32px; height: 32px; line-height: 1; border-radius: 6px;
}
.cuwz-close:hover:not(:disabled) { background: rgba(0, 0, 0, 0.06); }
.cuwz-body { padding: 20px 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.cuwz-field { display: flex; flex-direction: column; gap: 6px; }
.cuwz-field label { font-size: 13px; font-weight: 500; color: #444; }
.cuwz-field .req { color: #d9534f; }
.cuwz-field input,
.cuwz-field select {
  font: inherit; padding: 9px 11px; border: 1px solid #cfcfcf; border-radius: 7px;
  background: white;
}
.cuwz-field input:focus,
.cuwz-field select:focus { outline: 2px solid #2d6cdf55; border-color: #2d6cdf; }
.cuwz-field .has-check { border-color: #2d6cdf; }
.cuwz-hint { font-size: 12px; color: #888; }
.cuwz-row { display: flex; gap: 12px; }
.flex1 { flex: 1; }
.cuwz-footer {
  display: flex; gap: 10px; justify-content: flex-end; padding-top: 14px;
  border-top: 1px solid rgba(0, 0, 0, 0.06); margin-top: auto;
}
.btn-primary {
  background: #2d6cdf; color: white; border: 0; padding: 9px 16px;
  border-radius: 7px; font: inherit; font-weight: 500; cursor: pointer;
}
.btn-primary:disabled { background: #aac4ec; cursor: not-allowed; }
.btn-secondary {
  background: transparent; color: #555; border: 1px solid #cfcfcf;
  padding: 9px 16px; border-radius: 7px; font: inherit; cursor: pointer;
}
.cuwz-alert {
  padding: 9px 12px; border-radius: 7px; font-size: 13px;
  border-left: 3px solid;
}
.cuwz-alert.error { background: #fdecea; color: #b71c1c; border-color: #d9534f; }
</style>
