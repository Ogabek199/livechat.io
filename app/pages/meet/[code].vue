<script setup lang="ts">
import type { StickerId } from '~/utils/stickers'
import { isValidMeetCode } from '~/utils/privateMeetRtdb'

const { user, logout } = useAuth()
const { t } = useI18n()
const toast = useToast()
const router = useRouter()
const route = useRoute()
const priv = usePrivateMeet()

const code = computed(() => String(route.params.code || '').toLowerCase())

const input = ref('')
const editingId = ref<string | null>(null)
const listRef = ref<HTMLElement | null>(null)
const localEl = ref<HTMLVideoElement | null>(null)
const remoteEl = ref<HTMLVideoElement | null>(null)
const logoutOpen = ref(false)

const status = computed(() => priv.status.value)
const partner = computed(() => priv.partner.value)
const messages = computed(() => priv.messages.value)
const error = computed(() => priv.error.value)
const micOn = computed(() => priv.micOn.value)
const camOn = computed(() => priv.camOn.value)
const chatOpen = computed({
  get: () => priv.chatOpen.value,
  set: (v: boolean) => {
    priv.chatOpen.value = v
  },
})
const hostName = computed(() => priv.hostName.value)

const canChat = computed(() => status.value === 'in_call' && !!partner.value)
const waiting = computed(
  () => status.value === 'requesting' || status.value === 'waiting_approval' || status.value === 'connecting',
)

watch([localEl, remoteEl], () => {
  priv.setVideoEls(localEl.value, remoteEl.value)
})

watch(
  () => messages.value.length,
  async () => {
    await nextTick()
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
  },
)

onMounted(async () => {
  if (!isValidMeetCode(code.value)) {
    toast.error(t('invalidMeetCode'))
    await router.replace('/app')
    return
  }
  await nextTick()
  priv.setVideoEls(localEl.value, remoteEl.value)
  await priv.joinMeet(code.value)
})

async function send() {
  if (!canChat.value) {
    toast.info(t('chatLocked'))
    return
  }
  if (editingId.value) {
    const ok = await priv.editChat(editingId.value, input.value)
    if (ok) {
      editingId.value = null
      input.value = ''
    }
    return
  }
  if (priv.sendChat(input.value)) input.value = ''
}

function startEdit(m: { id: string; text: string; fromMe?: boolean; system?: boolean; stickerId?: string }) {
  if (!m.fromMe || m.system || m.stickerId || !canChat.value) return
  editingId.value = m.id
  input.value = m.text
}

function cancelEdit() {
  editingId.value = null
  input.value = ''
}

function onSticker(id: StickerId) {
  if (!canChat.value) {
    toast.info(t('chatLocked'))
    return
  }
  if (editingId.value) cancelEdit()
  priv.sendSticker(id)
}

async function leave() {
  await priv.hangUp()
  await router.replace('/app')
}

async function confirmLogout() {
  logoutOpen.value = false
  await priv.hangUp()
  await logout()
  await router.replace('/login')
}
</script>

<template>
  <div class="relative flex h-dvh w-full flex-col overflow-hidden bg-black lg:flex-row">
    <section class="relative min-h-0 flex-1 bg-zinc-950">
      <video
        ref="remoteEl"
        class="h-full w-full object-cover"
        autoplay
        playsinline
      />

      <div
        v-if="status !== 'in_call' || !partner"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-4 text-center"
      >
        <div
          v-if="waiting"
          class="h-10 w-10 animate-spin rounded-full border-2 border-zinc-600 border-t-white"
        />
        <p class="text-sm font-bold text-zinc-200">
          <template v-if="status === 'waiting_approval'">{{ t('waitingApproval') }}</template>
          <template v-else-if="waiting">{{ t('connecting') }}</template>
          <template v-else-if="status === 'error'">{{ error }}</template>
          <template v-else>{{ t('meetNotReady') }}</template>
        </p>
        <p v-if="status === 'waiting_approval'" class="max-w-xs text-xs text-zinc-500">
          {{ t('waitingApprovalHint') }}
          <span v-if="hostName" class="block mt-1 text-zinc-400">{{ hostName }}</span>
        </p>
        <p v-else class="max-w-xs text-xs text-zinc-500">{{ t('mediaHint') }}</p>
        <p class="font-mono text-sm text-zinc-600">{{ code }}</p>
        <button
          type="button"
          class="mt-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-black"
          @click="leave"
        >
          {{ t('backToLobby') }}
        </button>
      </div>

      <header class="absolute left-0 right-0 top-0 z-10 flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 py-3 sm:px-4">
        <div class="min-w-0">
          <p class="text-sm font-extrabold tracking-tight">live<span class="text-zinc-400">chat</span></p>
          <p class="truncate text-xs text-zinc-400">
            {{ user?.name }}
            <span class="text-zinc-600">· private</span>
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span
            v-if="partner"
            class="hidden max-w-[120px] truncate rounded-full bg-black/50 px-3 py-1 text-xs font-bold text-zinc-200 ring-1 ring-white/10 md:inline"
          >
            {{ partner.name }}
          </span>
          <button
            type="button"
            class="rounded-xl px-2.5 py-2 text-xs font-bold text-zinc-400 hover:text-white"
            @click="leave"
          >
            {{ t('backToLobby') }}
          </button>
        </div>
      </header>

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

      <div
        v-if="status === 'in_call'"
        class="absolute bottom-3 left-1/2 z-10 flex max-w-[95vw] -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-2xl bg-black/60 p-1.5 ring-1 ring-white/10 backdrop-blur sm:bottom-4 sm:gap-3 sm:px-3 sm:py-2"
      >
        <button
          type="button"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition sm:h-11 sm:w-11"
          :class="micOn ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-red-500 text-white'"
          @click="priv.toggleMic()"
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
          @click="priv.toggleCam()"
        >
          <svg v-if="camOn" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12.002 18.75H4.5A2.25 2.25 0 012.25 16.5v-9c0-.384.096-.746.266-1.066M3 3l18 18M9.75 5.25h3.75A2.25 2.25 0 0115.75 7.5v5.318" />
          </svg>
        </button>

        <button
          type="button"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500 sm:h-11 sm:w-11"
          @click="leave"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
        </button>
      </div>
    </section>

    <aside
      v-show="chatOpen && status === 'in_call'"
      class="z-20 flex h-[46%] min-h-[240px] w-full flex-col border-t border-zinc-900 bg-black sm:h-[42%] lg:h-auto lg:w-[360px] lg:border-l lg:border-t-0 xl:w-[400px]"
    >
      <div class="flex items-center gap-2 border-b border-zinc-900 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 ring-1 ring-zinc-800"
          @click="chatOpen = false"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold">{{ t('messages') }}</p>
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
                  : editingId === m.id
                    ? 'rounded-br-md bg-white text-black ring-2 ring-zinc-400'
                    : m.fromMe
                      ? 'rounded-br-md bg-white text-black'
                      : 'rounded-bl-md bg-zinc-900 text-zinc-100 ring-1 ring-zinc-800'
            "
          >
            <p v-if="m.stickerId" class="select-none text-4xl leading-none">{{ m.stickerEmoji || m.text }}</p>
            <p v-else class="whitespace-pre-wrap break-words text-[13px]">{{ m.text }}</p>
            <div v-if="!m.system" class="mt-1 flex items-center gap-2 text-[10px] opacity-50">
              <span>{{ m.time }}</span>
              <span v-if="m.edited">· {{ t('edited') }}</span>
              <button
                v-if="m.fromMe && !m.stickerId && canChat"
                type="button"
                class="font-bold underline-offset-2 hover:underline"
                @click="startEdit(m)"
              >
                {{ t('edit') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <form class="border-t border-zinc-900 p-2 sm:p-3" @submit.prevent="send">
        <p v-if="editingId" class="mb-2 flex items-center justify-between text-[11px] text-zinc-500">
          <span>{{ t('editMessage') }}</span>
          <button type="button" class="font-bold text-zinc-300" @click="cancelEdit">{{ t('cancelEdit') }}</button>
        </p>
        <div class="flex items-end gap-1.5" :class="canChat ? '' : 'opacity-55'">
          <StickerPicker @pick="onSticker" />
          <input
            v-model="input"
            type="text"
            maxlength="500"
            :placeholder="!canChat ? t('waitPartner') : editingId ? t('editMessage') : t('writeMessage')"
            class="min-h-11 min-w-0 flex-1 rounded-2xl bg-zinc-900 px-3 text-sm outline-none ring-1 ring-zinc-800"
            :readonly="!canChat"
          >
          <button
            type="submit"
            class="flex h-11 shrink-0 items-center justify-center rounded-2xl bg-white px-3 text-black"
            :class="canChat && input.trim() ? 'opacity-100' : 'opacity-40'"
          >
            <span v-if="editingId" class="text-xs font-bold">{{ t('saveEdit') }}</span>
            <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
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
