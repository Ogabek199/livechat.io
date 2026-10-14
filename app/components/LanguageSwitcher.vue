<script setup lang="ts">
const { locale, setLocale, locales, t } = useI18n()

const labels: Record<string, string> = {
  uz: 'UZ',
  ru: 'RU',
  en: 'EN',
}
</script>

<template>
  <div class="inline-flex items-center gap-1 rounded-full bg-zinc-900/80 p-1 ring-1 ring-zinc-800" :title="t('lang')">
    <button
      v-for="code in locales"
      :key="code"
      type="button"
      class="rounded-full px-2.5 py-1 text-[11px] font-extrabold transition"
      :class="locale === code ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'"
      @click="setLocale(code)"
    >
      {{ labels[code] }}
    </button>
  </div>
</template>
