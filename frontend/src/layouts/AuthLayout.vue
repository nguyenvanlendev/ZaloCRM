<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <!-- 2026-06-09 (anh chốt): login 2 cột — banner thương hiệu YOEDU trái + form phải.
       Bỏ container 450px cũ, để LoginView tự dựng 2 cột full màn. -->
  <v-app class="auth-shell">
    <v-main class="d-flex align-center justify-center" style="min-height: 100vh;">
      <slot />
    </v-main>
  </v-app>
</template>

<style scoped>
/* Linear Dark Slate Mesh Gradient Background */
.auth-shell {
  background: linear-gradient(-45deg, #0b0f17, #1e293b, #0f172a, #1a162b);
  background-size: 400% 400%;
  animation: gradientBG 15s ease infinite;
}

@keyframes gradientBG {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
</style>
