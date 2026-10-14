<script setup lang="ts">
const { toasts, dismiss } = useToast()
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 top-4 z-[9999] flex flex-col items-center gap-2 px-4"
    aria-live="polite"
  >
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg ring-1 backdrop-blur"
        :class="{
          'bg-red-500/95 text-white ring-red-400/40': t.kind === 'error',
          'bg-emerald-500/95 text-white ring-emerald-400/40': t.kind === 'success',
          'bg-zinc-800/95 text-white ring-white/10': t.kind === 'info',
        }"
        role="status"
      >
        <p class="flex-1 leading-snug">{{ t.message }}</p>
        <button
          type="button"
          class="shrink-0 text-white/80 hover:text-white"
          aria-label="Yopish"
          @click="dismiss(t.id)"
        >
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.28s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}
.toast-move {
  transition: transform 0.28s ease;
}
</style>
