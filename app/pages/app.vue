<script setup lang="ts">
import type { StickerId } from '~/utils/stickers'

const { user, logout } = useAuth()
const { t } = useI18n()
const toast = useToast()
const router = useRouter()
const meet = useMeet()

const {
  status,
  partner,
  messages,
  error,
  micOn,
  camOn,
  chatOpen,
  connect,
  sendChat,
  sendSticker,
  nextPartner,
  toggleMic,
  toggleCam,
  hangUp,
  setVideoEls,
} = meet

const input = ref('')
const listRef = ref<HTMLElement | null>(null)
const localEl = ref<HTMLVideoElement | null>(null)
const remoteEl = ref<HTMLVideoElement | null>(null)
const logoutOpen = ref(false)

watch([localEl, remoteEl], () => {
  setVideoEls(localEl.value, remoteEl.value)
})

watch(
  () => messages.value.length,
  async () => {
    await nextTick()
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
  },
)

const canChat = computed(() => status.value === 'in_call' && !!partner.value)

function send() {
  if (!canChat.value) {
    toast.info(t('chatLocked'))
    return
  }
  if (sendChat(input.value)) input.value = ''
}

function onSticker(id: StickerId) {
  if (!canChat.value) {
    toast.info(t('chatLocked'))
    return
  }
  sendSticker(id)
}

function askLogout() {
  logoutOpen.value = true
}

async function confirmLogout() {
  logoutOpen.value = false
  hangUp()
  await logout()
  await router.replace('/login')
}

onMounted(async () => {
  await nextTick()
  setVideoEls(localEl.value, remoteEl.value)
  await connect()
})
</script>

<template>
  <div class="relative flex h-dvh w-full flex-col overflow-hidden bg-black lg:flex-row">
    <!-- Video -->
    <section class="relative min-h-0 flex-1 bg-zinc-950">
      <video
        ref="remoteEl"
        class="h-full w-full object-cover"
        autoplay
        playsinline
      />

      <div
        v-if="status !== 'in_call' || !partner"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-4 text-center sm:px-6"
      >
        <div
          v-if="status === 'searching' || status === 'connecting'"
          class="h-10 w-10 animate-spin rounded-full border-2 border-zinc-600 border-t-white"
        />
        <p class="text-sm font-bold text-zinc-200">
          <template v-if="status === 'connecting'">{{ t('connecting') }}</template>
          <template v-else-if="status === 'searching'">{{ t('searching') }}</template>
          <template v-else-if="status === 'error'">{{ error }}</template>
          <template v-else>{{ t('meetNotReady') }}</template>
        </p>
        <p class="max-w-xs text-xs text-zinc-500">{{ t('mediaHint') }}</p>
        <button
          v-if="status === 'error' || status === 'idle'"
          type="button"
          class="mt-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-black"
          @click="connect()"
        >
          {{ t('retry') }}
        </button>
      </div>

      <header class="absolute left-0 right-0 top-0 z-10 flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 py-3 sm:px-4">
        <div class="min-w-0">
          <p class="text-sm font-extrabold tracking-tight">live<span class="text-zinc-400">chat</span></p>
          <p class="truncate text-xs text-zinc-400">
            {{ user?.name }}
            <span v-if="user?.isAnonymous" class="text-zinc-600">· {{ t('anonymous') }}</span>
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <span
            v-if="partner"
            class="hidden max-w-[120px] truncate rounded-full bg-black/50 px-3 py-1 text-xs font-bold text-zinc-200 ring-1 ring-white/10 md:inline"
          >
            {{ partner.name }}
          </span>
          <button
            v-if="!chatOpen"
            type="button"
            class="rounded-xl bg-white/10 px-2.5 py-2 text-xs font-bold text-white ring-1 ring-white/15 backdrop-blur"
            @click="chatOpen = true"
          >
            {{ t('chat') }}
          </button>
          <button
            type="button"
            class="rounded-xl px-2.5 py-2 text-xs font-bold text-zinc-400 hover:text-white"
            @click="askLogout"
          >
            {{ t('logout') }}
          </button>
        </div>
      </header>

      <!-- PiP -->
      <div class="absolute bottom-[5.5rem] right-3 z-10 overflow-hidden rounded-2xl bg-zinc-900 shadow-lg ring-1 ring-white/10 sm:bottom-28 sm:right-6">
        <video
          ref="localEl"
          class="h-24 w-[4.5rem] object-cover sm:h-36 sm:w-28"
          autoplay
          playsinline
          muted
        />
        <div
          v-if="!camOn"
          class="absolute inset-0 flex items-center justify-center bg-zinc-900 text-[10px] font-bold text-zinc-400 sm:text-xs"
        >
          {{ t('camOff') }}
        </div>
      </div>

      <!-- Controls -->
      <div class="absolute bottom-3 left-1/2 z-10 flex max-w-[95vw] -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-2xl bg-black/60 p-1.5 ring-1 ring-white/10 backdrop-blur sm:bottom-4 sm:gap-3 sm:px-3 sm:py-2">
        <button
          type="button"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition sm:h-11 sm:w-11"
          :class="micOn ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-red-500 text-white'"
          @click="toggleMic()"
        >
          <svg v-if="micOn" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
          <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M9 9v3.75a3 3 0 005.122 2.122M15 9.75V4.5a3 3 0 00-5.83-1.012M19.5 12.75v.75a6.001 6.001 0 01-8.917 5.25M4.5 12.75v.75a6 6 0 002.25 4.742M12 18.75v3.75m-3.75 0h7.5" />
          </svg>
        </button>

        <button
          type="button"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition sm:h-11 sm:w-11"
          :class="camOn ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-red-500 text-white'"
          @click="toggleCam()"
        >
          <svg v-if="camOn" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <!-- Kamera o'chiq -->
          <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12.002 18.75H4.5A2.25 2.25 0 012.25 16.5v-9c0-.384.096-.746.266-1.066M3 3l18 18M9.75 5.25h3.75A2.25 2.25 0 0115.75 7.5v5.318" />
          </svg>
        </button>

        <button
          type="button"
          class="shrink-0 rounded-full bg-zinc-800 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-700 disabled:opacity-40 sm:px-4 sm:py-2.5"
          :disabled="status === 'connecting'"
          @click="nextPartner()"
        >
          {{ t('next') }}
        </button>

        <button
          v-if="!chatOpen"
          type="button"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-white hover:bg-zinc-700 sm:h-11 sm:w-11"
          :aria-label="t('chat')"
          @click="chatOpen = true"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.63-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
        </button>

        <button
          type="button"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500 sm:h-11 sm:w-11"
          :aria-label="t('logout')"
          @click="askLogout"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
        </button>
      </div>
    </section>

    <!-- Chat panel -->
    <aside
      v-show="chatOpen"
      class="z-20 flex h-[46%] min-h-[240px] w-full flex-col border-t border-zinc-900 bg-black sm:h-[42%] lg:h-auto lg:w-[360px] lg:border-l lg:border-t-0 xl:w-[400px]"
    >
      <div class="flex items-center gap-2 border-b border-zinc-900 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 ring-1 ring-zinc-800 transition hover:bg-zinc-800 hover:text-white"
          :aria-label="t('close')"
          :title="t('close')"
          @click="chatOpen = false"
        >
          <!-- Mobile: pastga yig'ish; desktop: yon panelni yopish -->
          <svg class="h-5 w-5 lg:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
          <svg class="hidden h-5 w-5 lg:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold">{{ t('messages') }}</p>
          <p class="truncate text-xs text-zinc-500">{{ t('messagesSecure') }}</p>
        </div>
        <LanguageSwitcher />
      </div>

      <div ref="listRef" class="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        <div
          v-for="m in messages"
          :key="m.id"
          class="flex"
          :class="m.system ? 'justify-center' : m.fromMe ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[85%] rounded-2xl px-3 py-2"
            :class="
              m.system
                ? 'bg-transparent px-1 text-center text-[11px] text-zinc-500'
                : m.stickerId
                  ? 'bg-transparent px-1'
                  : m.fromMe
                    ? 'rounded-br-md bg-white text-black'
                    : 'rounded-bl-md bg-zinc-900 text-zinc-100 ring-1 ring-zinc-800'
            "
          >
            <p
              v-if="m.stickerId"
              class="select-none text-4xl leading-none sm:text-5xl"
            >
              {{ m.stickerEmoji || m.text }}
            </p>
            <p
              v-else
              class="whitespace-pre-wrap break-words text-[13px] leading-snug"
            >
              {{ m.text }}
            </p>
            <p v-if="!m.system" class="mt-1 text-[10px] opacity-50">{{ m.time }}</p>
          </div>
        </div>
      </div>

      <form class="border-t border-zinc-900 p-2 sm:p-3" @submit.prevent="send">
        <div
          class="flex items-end gap-1.5 transition sm:gap-2"
          :class="canChat ? '' : 'opacity-55'"
        >
          <StickerPicker @pick="onSticker" />
          <input
            v-model="input"
            type="text"
            maxlength="500"
            autocomplete="off"
            spellcheck="false"
            :placeholder="canChat ? t('writeMessage') : t('waitPartner')"
            class="min-h-11 min-w-0 flex-1 rounded-2xl bg-zinc-900 px-3 text-sm outline-none ring-1 ring-zinc-800 placeholder:text-zinc-600 focus:ring-zinc-600 sm:px-4"
            :readonly="!canChat"
          >
          <button
            type="submit"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-black transition"
            :class="canChat && input.trim() ? 'opacity-100' : 'opacity-40'"
            :aria-label="t('send')"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </form>
    </aside>

    <ConfirmDialog
      :open="logoutOpen"
      :title="t('logoutConfirmTitle')"
      :body="t('logoutConfirmBody')"
      :confirm-label="t('confirm')"
      :cancel-label="t('cancel')"
      @confirm="confirmLogout"
      @cancel="logoutOpen = false"
    />
  </div>
</template>
