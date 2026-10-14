<script setup lang="ts">
defineProps<{
  open: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[10000] flex items-end justify-center bg-black/70 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        @click.self="emit('cancel')"
      >
        <div class="w-full max-w-sm rounded-2xl bg-zinc-950 p-5 ring-1 ring-zinc-800 shadow-2xl">
          <h2 class="text-base font-extrabold text-white">{{ title }}</h2>
          <p class="mt-2 text-sm leading-relaxed text-zinc-400">{{ body }}</p>
          <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              class="rounded-xl px-4 py-2.5 text-sm font-bold text-zinc-300 ring-1 ring-zinc-800 hover:bg-zinc-900"
              @click="emit('cancel')"
            >
              {{ cancelLabel }}
            </button>
            <button
              type="button"
              class="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500"
              @click="emit('confirm')"
            >
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
