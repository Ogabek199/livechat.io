<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <main class="mx-auto min-h-dvh max-w-lg px-4 py-8 sm:px-6 sm:py-10">
    <div class="mb-4 flex items-center justify-between gap-3">
      <NuxtLink to="/login" class="text-sm text-zinc-500 hover:text-zinc-300">← {{ t('back') }}</NuxtLink>
      <LanguageSwitcher />
    </div>
    <h1 class="mt-2 text-2xl font-extrabold">{{ t('termsTitle') }}</h1>
    <div class="mt-6 space-y-4 text-sm leading-relaxed text-zinc-400">
      <p>{{ t('termsP1') }}</p>
      <p>{{ t('termsP2') }}</p>
      <p>{{ t('termsP3') }}</p>
    </div>
  </main>
</template>
