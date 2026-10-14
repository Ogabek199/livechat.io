<script setup lang="ts">
import { SYSTEM_STICKERS, type StickerId } from '~/utils/stickers'

const emit = defineEmits<{ pick: [id: StickerId] }>()

const open = ref(false)
const { t } = useI18n()

function select(id: StickerId) {
  emit('pick', id)
  open.value = false
}
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-lg ring-1 ring-zinc-800 transition hover:bg-zinc-800"
      :aria-label="t('stickers')"
      @click="open = !open"
    >
      😊
    </button>

    <div
      v-if="open"
      class="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[min(280px,70vw)] rounded-2xl bg-zinc-950 p-2 shadow-xl ring-1 ring-zinc-800"
    >
      <p class="px-2 pb-1 text-[11px] font-bold text-zinc-500">{{ t('stickers') }}</p>
      <div class="grid grid-cols-6 gap-1">
        <button
          v-for="s in SYSTEM_STICKERS"
          :key="s.id"
          type="button"
          class="flex h-10 items-center justify-center rounded-xl text-xl transition hover:bg-zinc-800 active:scale-95"
          :title="s.label"
          @click="select(s.id)"
        >
          {{ s.emoji }}
        </button>
      </div>
    </div>
  </div>
</template>
