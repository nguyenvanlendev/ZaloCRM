<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <v-app class="smax-app">
    <!-- ════════ TOP NAV — YOEDU teal-navy shell (redesign 2026-06-05, đảo lock Variant A) ════════ -->
    <!-- Gradient teal-navy + monogram HS + wordmark · 7 tab + Báo cáo + Cài đặt · MDI line icon · active HS -->
    <header class="smax-topnav">
      <!-- Brand — logo + tên lấy theo hồ sơ tổ chức (đồng bộ /login, /setup-password) -->
      <RouterLink to="/" class="hs-brand" :title="`${brandName} CRM`">
        <span class="hs-bbox"><img :src="brandLogo" :alt="brandName" @error="onLogoError" /></span>
        <span class="hs-bwm"><span class="hs-b1">{{ brandName }}</span><span class="hs-b2">CRM</span></span>
      </RouterLink>

      <!-- Primary nav tabs -->
      <nav class="nav-tabs">
        <RouterLink
          v-for="tab in visiblePrimaryTabs"
          :key="tab.path"
          :to="tab.path"
          class="nav-tab"
          :class="{ active: isActive(tab) }"
        >
          <v-icon :icon="tab.icon" size="16" class="ic-svg" />{{ tab.label }}
        </RouterLink>

        <!-- Báo cáo dropdown — gộp Phân tích + Báo cáo (anh chốt 2026-05-28).
             RBAC: chỉ hiện cho ai có engagement_score (Sale Senior trở lên).
             2026-06-09 (anh báo menu bar kẹt không click được, phải F5): đổi
             open-on-hover → CLICK + v-model điều khiển. Hover race + click item bị
             chặn quyền làm overlay (z-index 2000) kẹt mở, phủ lên nav nuốt click.
             router.afterEach đóng hết menu. -->
        <v-menu v-if="authStore.canAccess('engagement_score')" v-model="reportsMenu" :close-on-content-click="true">
          <template #activator="{ props: act }">
            <button class="nav-tab" :class="{ active: isReportsActive }" v-bind="act">
              <v-icon icon="mdi-chart-box-outline" size="16" class="ic-svg" />Báo cáo<span class="caret">▾</span>
            </button>
          </template>
          <!-- Module Báo cáo 7 màn (2026-06-17) — liệt kê trực tiếp cho dễ vào. -->
          <v-list density="compact" min-width="236">
            <v-list-subheader>Báo cáo</v-list-subheader>
            <v-list-item to="/reports/tong-quan"  title="Tổng quan điều hành"   prepend-icon="mdi-view-dashboard-outline" />
            <v-list-item to="/reports/nick"        title="Vận hành Nick Zalo"    prepend-icon="mdi-cellphone-link" />
            <v-list-item to="/reports/sale"        title="Hiệu suất Sale & Team" prepend-icon="mdi-account-tie-outline" />
            <!-- EE-only: Pipeline (Lead Pool) + Automation report là tính năng Extension.
                 Ẩn ở Community (route /reports/automation do EE inject → CE không có). -->
            <v-list-item v-if="isExtension" to="/reports/pipeline"    title="Pipeline & Lead Pool"  prepend-icon="mdi-filter-variant" />
            <v-list-item v-if="isExtension" to="/reports/automation"  title="Automation & Chăm sóc" prepend-icon="mdi-cog-sync-outline" />
            <v-list-item to="/reports/engagement"  title="Engagement KH"         prepend-icon="mdi-fire" />
            <v-list-item to="/reports/audit"       title="Audit & Sức khỏe HT"   prepend-icon="mdi-shield-check-outline" />
            <v-divider />
            <v-list-item to="/analytics" title="Phân tích nâng cao" prepend-icon="mdi-chart-line" />
          </v-list>
        </v-menu>

        <!-- Cài đặt dropdown -->
        <v-menu v-model="settingsMenu" :close-on-content-click="true">
          <template #activator="{ props: act }">
            <button class="nav-tab" :class="{ active: isSettingsActive }" v-bind="act">
              <v-icon icon="mdi-cog-outline" size="16" class="ic-svg" />Cài đặt<span class="caret">▾</span>
            </button>
          </template>
          <!-- Dropdown = LỐI TẮT (2026-06-10 CEO-review): 7 mục hay dùng, route mới
               đồng bộ sidebar (bỏ /settings/team/* legacy + Tag cũ). Lọc theo grants.
               Đầy đủ menu ở "Xem tất cả cài đặt". -->
          <v-list density="compact" min-width="248">
            <v-list-subheader>Lối tắt hay dùng</v-list-subheader>
            <v-list-item to="/settings/personal/profile" title="Hồ sơ của tôi" prepend-icon="mdi-account-outline" />
            <v-list-item v-if="authStore.canAccess('user')" to="/settings/rbac/users" title="Nhân viên" prepend-icon="mdi-account-group-outline" />
            <v-list-item v-if="authStore.canAccess('permission_group')" to="/settings/rbac/permission-groups" title="Phân quyền" prepend-icon="mdi-shield-account-outline" />
            <v-divider />
            <v-list-item v-if="authStore.canAccess('zalo_account')" to="/settings/channels/zalo" title="Tài khoản Zalo" prepend-icon="mdi-cellphone-link" />
            <v-list-item v-if="authStore.canAccess('settings')" to="/settings/crm/tags-v2" title="Nhãn KH" prepend-icon="mdi-tag-multiple-outline" />
            <v-list-item v-if="authStore.canAccess('settings')" to="/settings/org/system-notifications" title="Thông báo hệ thống" prepend-icon="mdi-bell-cog-outline" />
            <!-- Open-core: extension top-nav shortcuts (empty in Community edition). -->
            <template v-for="sc in eeTopNavShortcuts" :key="sc.to">
              <v-list-item v-if="authStore.canAccess(sc.resource)" :to="sc.to" :title="sc.title" :prepend-icon="sc.icon" />
            </template>
            <v-divider />
            <v-list-item to="/settings" title="Xem tất cả cài đặt" prepend-icon="mdi-cog-outline" />
          </v-list>
        </v-menu>
      </nav>

      <!-- Flexible spacer pushes everything after it to the right edge. -->
      <div class="topnav-spacer" />

      <!--
        ATTRIBUTION BANNER — moved into DashboardView per copyright holder
        (locnt@locnguyendata.com). Rendering still required by Apache 2.0 §4(d);
        see src/views/DashboardView.vue and src/composables/use-attribution.ts.
      -->

      <!-- Global search trigger -->
      <GlobalSearch class="topnav-search" />

      <!-- Right icon buttons -->
      <!-- 2026-06-13 (anh chốt): nút này trỏ về trang quản lý nick Zalo (trước trỏ /groups). -->
      <RouterLink to="/settings/channels/zalo" class="icon-btn" title="Quản lý nick Zalo">
        <v-icon size="18">mdi-cellphone-link</v-icon>
      </RouterLink>

      <NotificationBell class="icon-btn-wrap" />

      <v-menu v-model="userMenu" :close-on-content-click="true">
        <template #activator="{ props: act }">
          <button class="user-avatar" v-bind="act" :title="authStore.user?.fullName || 'Tài khoản'">
            <Avatar :src="authStore.user?.avatarUrl" :name="authStore.user?.fullName || 'U'" :size="32" :platform="null" />
          </button>
        </template>
        <v-list density="compact" min-width="200">
          <v-list-item :title="authStore.user?.fullName || ''" :subtitle="authStore.user?.email || ''" />
          <v-divider />
          <!-- 2026-06-13 (anh chốt): Hồ sơ trỏ về trang gom "Tài khoản của tôi". Bỏ nút Theme tối. -->
          <v-list-item to="/settings/personal/profile" title="Hồ sơ" prepend-icon="mdi-account-circle-outline" />
          <v-divider />
          <v-list-item @click="logout" title="Đăng xuất" prepend-icon="mdi-logout" />
        </v-list>
      </v-menu>
    </header>

    <!-- Phase Internal Contact 2-method 2026-05-23 — banner persistent nếu sale chưa setup -->
    <div v-if="showInternalContactBanner" class="ic-banner">
      <span class="ic-banner-icon">⚠</span>
      <div class="ic-banner-text">
        <strong>Bạn đang BỎ LỠ thông báo quan trọng từ CRM!</strong>
        <span class="ic-banner-sub">Khách đồng ý kết bạn, cảnh báo silent 30 ngày, lịch hẹn, daily KPI...</span>
      </div>
      <button class="ic-banner-cta" @click="goSetupInternalContact">⚙ Thiết lập ngay</button>
      <button class="ic-banner-dismiss" @click="dismissInternalContactBanner" title="Ẩn 24h">✕</button>
    </div>

    <!-- ════════ MAIN ════════ -->
    <v-main class="smax-main">
      <slot />
    </v-main>

    <!-- 2026-06-04: Anh chốt gỡ MiniOnboardingIndicator — badge 4/4 hiện đè
         mọi UI gây rối mắt sau khi sale hoàn tất. Sẽ code lại setup 4 bước. -->

    <!-- 2026-06-01: LeadFloatingButton moved → ConversationFilterSidebar (chỉ render trong /chat).
         Floating bottom-right bị bỏ. Sale thấy nút "Nhận khách" trong sidebar cột 1 (expanded card / collapsed icon hộp quà pulse). -->

    <!-- Global toast queue -->
    <ToastContainer />
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useTheme } from 'vuetify';
import { useRoute, RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { isExtension } from '@ee/edition';
import { useRouter } from 'vue-router';
import NotificationBell from '@/components/NotificationBell.vue';
import GlobalSearch from '@/components/GlobalSearch.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import Avatar from '@/components/ui/Avatar.vue';
import { fetchPublicBranding } from '@/api/public-branding';
// Open-core: extension top-nav shortcuts (empty in Community edition via @ee stub).
import { eeTopNavShortcuts } from '@ee/nav';
// 2026-06-04: gỡ MiniOnboardingIndicator (Anh chốt code lại setup 4 bước sau)
// LeadFloatingButton moved to ConversationFilterSidebar 2026-06-01
// 2026-06-08: gỡ import api — banner "BỎ LỠ thông báo" đã tắt (checkInternalContactSetup no-op).
const theme = useTheme();
const route = useRoute();
const authStore = useAuthStore();
const router = useRouter();

// 2026-06-09 (anh báo menu bar kẹt, phải F5) — điều khiển dropdown nav bằng v-model
// + ép đóng HẾT sau mỗi điều hướng (kể cả khi điều hướng bị huỷ/chặn quyền). Dropdown
// Vuetify (z-index 2000) nếu kẹt mở sẽ phủ lên nav (z-index 100) nuốt click → đây là gốc lỗi.
const reportsMenu = ref(false);
const settingsMenu = ref(false);
const userMenu = ref(false);
function closeAllNavMenus() {
  reportsMenu.value = false;
  settingsMenu.value = false;
  userMenu.value = false;
}

// 2026-06-23 (anh báo: thao tác 1 lúc ở MỌI module rồi click nav không chuyển được, phải
// F5; hover vẫn hiện href ⇒ KHÔNG phải overlay phủ-hình). GỐC: overlay Vuetify (v-menu/
// v-dialog, z-index 2000) bị KẸT/ORPHAN — activator unmount giữa lúc mở (list re-render,
// đổi route…) để lại overlay + listener "click-outside" ở document → click nav bị nuốt
// (đóng overlay ma thay vì điều hướng). Fix cũ chỉ đóng 3 menu NAV, không dọn overlay từ
// module khác. Đây là DỌN TOÀN CỤC mọi overlay kẹt sau mỗi điều hướng:
//   1) Esc native → Vuetify tự đóng overlay còn mounted (sạch, không lỗi removeChild).
//   2) nextTick xong gỡ orphan DOM còn sót trong .v-overlay-container (component đã unmount
//      nên Vuetify không quản nữa → gỡ an toàn; bọc try/catch chống race).
function sweepStuckOverlays() {
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  } catch { /* no-op */ }
  void nextTick(() => {
    try {
      document
        .querySelectorAll('.v-overlay-container > .v-overlay.v-overlay--active')
        .forEach((el) => el.remove());
    } catch { /* race với Vuetify cleanup — bỏ qua */ }
  });
}

function cleanupAfterNav() {
  closeAllNavMenus();
  sweepStuckOverlays();
}
router.afterEach(() => cleanupAfterNav());
router.onError(() => cleanupAfterNav());

// Phase Internal Contact 2-method 2026-05-23 — banner cho sale chưa setup
// Phase Onboarding v1 redesign 2026-05-24: ẨN banner khi đang ở Dashboard route
// vì OnboardingChecklist đã cover. Banner chỉ nhắc ở các tab khác (Chat, Bạn bè,...).
const IC_BANNER_DISMISS_KEY = 'ic-banner-dismissed-until';
const _showICBannerRaw = ref(false);
const showInternalContactBanner = computed(() => {
  // Hide trên Dashboard — checklist đã hiện
  if (route.path === '/') return false;
  return _showICBannerRaw.value;
});
async function checkInternalContactSetup() {
  // 2026-06-08 (Anh chốt): TẮT banner "Bạn đang BỎ LỠ thông báo quan trọng từ CRM".
  // Lý do: giờ user được tạo bằng SĐT đã verify có Zalo 100% (wizard create-with-zalo),
  // recipient.threadIdInSenderView được điền sẵn lúc tạo → không cần nhắc sale tự vào
  // Cài đặt thiết lập nick liên lạc nội bộ nữa. Giữ lại logic bên dưới (comment) để dễ
  // bật lại nếu sau này cần.
  return;
  // if (!authStore.user) return;
  // const dismissedUntil = Number(localStorage.getItem(IC_BANNER_DISMISS_KEY) || '0');
  // if (dismissedUntil > Date.now()) return;
  // try {
  //   const { data } = await api.get('/me/internal-contact');
  //   if (!data.method || data.recipient?.status !== 'ready') {
  //     _showICBannerRaw.value = true;
  //   }
  // } catch { /* silent */ }
}
function goSetupInternalContact() {
  _showICBannerRaw.value = false;
  router.push('/settings/channels/zalo?tab=internal-contact');
}
function dismissInternalContactBanner() {
  _showICBannerRaw.value = false;
  localStorage.setItem(IC_BANNER_DISMISS_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
}

// Brand lockup trên menu — logo + tên tổ chức (đồng bộ /login, /setup-password).
const DEFAULT_LOGO = '/brand/zalocrm-logo.png';
const brandLogo = ref(DEFAULT_LOGO);
const brandName = ref('YOEDU');
function onLogoError() {
  if (brandLogo.value !== DEFAULT_LOGO) brandLogo.value = DEFAULT_LOGO;
}

onMounted(() => {
  // 2026-06-13 (anh chốt): app LUÔN theme sáng 'hsLight', bỏ chọn theme tối. Ép cứng +
  // dọn giá trị 'legacy-dark'/'smax-light' cũ trong localStorage để user nào đang kẹt
  // dark cũng về sáng.
  theme.global.name.value = 'hsLight';
  localStorage.setItem('theme', 'hsLight');
  void checkInternalContactSetup();

  fetchPublicBranding()
    .then((b) => {
      if (!b) return;
      brandLogo.value = b.logoUrl || DEFAULT_LOGO;
      brandName.value = b.name || 'YOEDU';
    })
    .catch(() => {});
});

interface NavTab {
  path: string;
  label: string;
  icon: string;
  matchPrefix?: string;
  // RBAC 2026-06-08 — resource cần để thấy tab. Không có resource = luôn hiện.
  resource?: string;
}

// HD-first redesign 2026-05-28 (anh chốt Variant A): 7 primary tabs + 2 dropdown.
// Bỏ: "KH đình trệ" (move vào Dashboard alert), "Phân tích" (gộp Báo cáo dropdown),
//     "Báo cáo" tab riêng (gộp dropdown), Automation legacy dropdown (Marketing thay).
// Icons MDI line stroke-2 (mdi-*-outline) thay emoji để nhất quán + đổi màu theo theme.
const primaryTabs: NavTab[] = [
  { path: '/',                       label: 'Dashboard',   icon: 'mdi-view-dashboard-outline', matchPrefix: '/$' },
  { path: '/chat',                   label: 'Tin nhắn',    icon: 'mdi-message-text-outline', resource: 'conversation' },
  { path: '/friends',                label: 'Bạn bè',      icon: 'mdi-account-multiple-outline', resource: 'friend' },
  { path: '/contacts',               label: 'Khách hàng',  icon: 'mdi-account-outline', resource: 'contact' },
  { path: '/appointments',           label: 'Lịch hẹn',    icon: 'mdi-calendar-outline' },
  { path: '/media',                  label: 'Kho ảnh',     icon: 'mdi-image-multiple-outline', resource: 'media' },
];

// RBAC 2026-06-09 — tab Marketing là module gồm nhiều chức năng. Hiện nếu user có
// quyền BẤT KỲ chức năng nào, và trỏ tới chức năng ĐẦU TIÊN user có quyền (vd Sale
// chỉ có Khối → tab Marketing trỏ thẳng /marketing/blocks). Thứ tự = thứ tự sidebar.
const MARKETING_FUNCTIONS: Array<{ path: string; resource: string }> = [
  { path: '/marketing/triggers',     resource: 'trigger' },
  { path: '/marketing/care-sessions',resource: 'care_session' },
  { path: '/marketing/sequences',    resource: 'sequence' },
  { path: '/marketing/blocks',       resource: 'block' },
  { path: '/marketing/broadcasts',   resource: 'broadcast' },
  { path: '/marketing/lists',        resource: 'customer_list' },
];
const marketingEntry = computed(() =>
  MARKETING_FUNCTIONS.find((f) => authStore.canAccess(f.resource))?.path ?? null,
);

// RBAC 2026-06-08 — chỉ hiện tab user có quyền (Dashboard + Lịch hẹn luôn hiện).
const visiblePrimaryTabs = computed(() => {
  const tabs = primaryTabs.filter((t) => !t.resource || authStore.canAccess(t.resource));
  // Tab Marketing — edition-aware (open-core):
  //  - EE: menu Marketing đầy đủ (triggers/sequences/…); hiện khi có quyền ≥1 chức năng.
  //  - Community: menu Marketing RIÊNG, chỉ Quét nhóm + Tệp khách hàng (route /marketing
  //    chỉ đăng ký khi !isExtension — xem router). KHÔNG dùng marketingEntry (resource EE).
  if (isExtension && marketingEntry.value) {
    tabs.push({
      path: marketingEntry.value,
      label: 'Marketing',
      icon: 'mdi-bullhorn-outline',
      matchPrefix: '/marketing',
    });
  } else if (!isExtension) {
    tabs.push({
      path: '/marketing/group-scan',
      label: 'Marketing',
      icon: 'mdi-bullhorn-outline',
      matchPrefix: '/marketing',
    });
  }
  return tabs;
});
// (2026-06-10) Bỏ showOrgGroup/showCrmGroup — dropdown redesign thành lối tắt phẳng,
// lọc per-item theo grants trực tiếp, không còn subheader nhóm cần gate.

function isActive(tab: NavTab): boolean {
  if (tab.matchPrefix === '/$') return route.path === '/';
  if (tab.matchPrefix) {
    return route.path === tab.matchPrefix || route.path.startsWith(tab.matchPrefix + '/');
  }
  return route.path === tab.path || route.path.startsWith(tab.path + '/');
}
const isSettingsActive = computed(() =>
  route.path === '/settings' || route.path.startsWith('/settings/'),
);
// Báo cáo dropdown active khi ở /analytics hoặc /reports
const isReportsActive = computed(
  () => route.path.startsWith('/analytics') || route.path.startsWith('/reports'),
);

// Workspace selector đã ẩn ở Variant A 2026-05-28 (single-tenant chưa cần switch).
// Sau này multi-tenant → revert back template + uncomment block dưới.

// Avatar top nav 2026-06-13 — dùng <Avatar/> (ảnh thật + fallback chữ cái), bỏ initials thủ công.
// 2026-06-13 (anh chốt): bỏ chọn theme tối — app luôn theme sáng 'hsLight' (mặc định ở vuetify.ts).

function logout() {
  authStore.logout();
  router.push('/login');
}
</script>

<style scoped>
/* Phase Internal Contact 2-method 2026-05-23 — banner persistent */
.ic-banner {
  display: flex; align-items: center; gap: 14px;
  padding: 10px 20px;
  background: linear-gradient(90deg, #FEF3C7 0%, #FDE68A 100%);
  border-bottom: 1px solid #FCD34D;
  color: #78350F;
  font-size: 13.5px;
}
.ic-banner-icon { font-size: 20px; flex-shrink: 0; }
.ic-banner-text { flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.3; }
.ic-banner-text strong { color: #92400E; font-weight: 700; }
.ic-banner-sub { font-size: 12px; color: #92400E; opacity: 0.85; }
.ic-banner-cta {
  background: #B45309; color: white; border: none;
  padding: 8px 16px; border-radius: 8px;
  font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit;
  white-space: nowrap;
}
.ic-banner-cta:hover { background: #92400E; }
.ic-banner-dismiss {
  background: transparent; color: #92400E; border: none;
  padding: 8px 10px; cursor: pointer; font-family: inherit;
  font-size: 14px; font-weight: 700;
}
.ic-banner-dismiss:hover { color: #78350F; }

/* YOEDU Linear shell — Dark Slate nav (Linear-grade) */
.smax-topnav {
  background: rgba(15, 23, 42, 0.96);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: rgba(255, 255, 255, 0.9);
  height: 50px;
  display: flex; align-items: center;
  padding: 0 16px; gap: 4px;
  flex-shrink: 0;
  position: sticky; top: 0; z-index: 100;
  box-shadow: 0 1px 0 rgba(255,255,255,.07), 0 2px 8px rgba(0,0,0,.2);
  border-bottom: 1px solid rgba(255,255,255,.07);
}

/* Brand lockup — monogram YOEDU + wordmark "YOEDU / CRM" */
.hs-brand {
  display: flex; align-items: center; gap: 10px;
  margin-right: 16px; flex: none; text-decoration: none;
  transition: opacity 0.15s ease;
}
.hs-brand:hover { opacity: 0.9; }
.hs-bbox {
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  flex: none;
}
.hs-bbox img { width: 100%; height: 100%; object-fit: contain; display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,.25)); }
.hs-bwm { display: flex; flex-direction: column; line-height: 1.1; white-space: nowrap; }
.hs-b1 { font-size: 13.5px; font-weight: 700; color: #fff; letter-spacing: -0.01em; }
.hs-b2 { font-size: 9px; font-weight: 700; letter-spacing: .24em; color: #fb7185; text-transform: uppercase; }

.nav-tabs {
  display: flex; align-items: center; gap: 2px;
  flex-wrap: nowrap;
  flex-shrink: 0;
}
.nav-tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 12px; border-radius: 6px;
  cursor: pointer;
  color: #94a3b8;
  font-size: 13px; font-weight: 500;
  background: transparent; border: none;
  white-space: nowrap;
  text-decoration: none;
  height: 32px;
  line-height: 1.2;
  position: relative;
  transition: all 0.15s ease;
}
.nav-tab .ic-svg { color: #64748b; transition: all .15s ease; }
.nav-tab .caret { font-size: 9px; opacity: 0.55; margin-left: -2px; transition: opacity .15s ease; }
.nav-tab:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
}
.nav-tab:hover .ic-svg { color: #cbd5e1; }
.nav-tab:hover .caret { opacity: 0.8; }
.nav-tab.active {
  background: rgba(255, 255, 255, 0.10);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12), inset 0 1px 0 rgba(255,255,255,.08);
}
.nav-tab.active .ic-svg { color: #fb7185; }

/* HD compact — chỉ kick in khi viewport < 1280 */
@media (max-width: 1280px) {
  .nav-tab { padding: 6px 9px; font-size: 12px; gap: 5px; }
}
@media (max-width: 1100px) {
  .nav-tab { padding: 5px 7px; gap: 4px; }
}

.topnav-spacer { flex: 1; min-width: 0; }

.contact-marquee {
  flex: 0 0 320px;
  margin-right: 12px;
  height: 24px;
  display: flex;
  align-items: center;
  overflow: hidden;
  background: linear-gradient(90deg, rgba(0,242,255,0.12), rgba(0,119,182,0.12));
  border: 1px solid rgba(0,242,255,0.30);
  border-radius: 6px;
  text-decoration: none;
  color: #FFFFFF;
  font-size: 8px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
}
.contact-marquee:hover {
  background: linear-gradient(90deg, rgba(0,242,255,0.20), rgba(0,119,182,0.20));
  border-color: rgba(0,242,255,0.50);
}
.marquee-track {
  display: inline-block;
  white-space: nowrap;
  animation: marquee-scroll 32s linear infinite;
  will-change: transform;
}
.contact-marquee:hover .marquee-track {
  animation-play-state: paused;
}
@keyframes marquee-scroll {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
@media (max-width: 1280px) {
  .contact-marquee { display: none; }
}

.topnav-search {
  max-width: 240px;
  flex-shrink: 1;
}
@media (max-width: 1500px) {
  .topnav-search { max-width: 200px; }
}
@media (max-width: 1280px) {
  .topnav-search { max-width: 160px; }
}
@media (max-width: 1100px) {
  .topnav-search { display: none; }
}
.topnav-search :deep(.v-field) {
  background: rgba(255, 255, 255, 0.06) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: white;
  border-radius: 8px !important;
  backdrop-filter: blur(4px);
  transition: all 0.15s ease;
}
.topnav-search :deep(.v-field:hover) {
  background: rgba(255, 255, 255, 0.10) !important;
  border-color: rgba(255, 255, 255, 0.18) !important;
}
.topnav-search :deep(input) { color: white !important; }
.topnav-search :deep(input::placeholder) { color: rgba(255, 255, 255, 0.45) !important; }

.icon-btn,
:deep(.icon-btn-wrap) > * {
  width: 32px; height: 32px;
  border-radius: 8px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: rgba(255, 255, 255, 0.75);
  position: relative;
  font-size: 15px;
  text-decoration: none;
  background: transparent; border: none;
  margin-left: 2px;
  transition: all 0.15s ease;
}
.icon-btn:hover,
:deep(.icon-btn-wrap) > *:hover {
  background: rgba(255, 255, 255, 0.08);
  color: white;
  transform: translateY(-1px);
}

.user-avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: none; padding: 0;
  border: none; cursor: pointer;
  margin-left: 8px;
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.15s ease;
}
.user-avatar:hover { transform: scale(1.06); }
.user-avatar :deep(.smax-av) { box-shadow: 0 0 0 2px rgba(251, 113, 133, .35); }

.smax-main {
  background: var(--surface-2, #f8fafc);
}
.smax-main :deep(.v-main__wrap) { min-height: calc(100vh - var(--smax-topnav-h)); }

/* Vuetify menus rendered from v-menu inherit theme automatically.
   Force light surface in case parent has legacy-dark applied. */
:deep(.v-overlay__content > .v-list) {
  background: var(--smax-bg);
  color: var(--smax-text);
}
</style>
