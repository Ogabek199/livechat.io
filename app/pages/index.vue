<script setup lang="ts">
const { user, ready } = useAuth()

watch(
  [user, ready],
  () => {
    if (!ready.value) return
    navigateTo(user.value ? '/app' : '/login', { replace: true })
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-black text-sm text-zinc-500">
    Yuklanmoqda...
  </div>
</template>
