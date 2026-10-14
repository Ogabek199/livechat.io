<script setup lang="ts">
const { loginAnonymous, loginWithGoogle, finishGoogleRedirect, user } = useAuth()
const { error: toastError } = useToast()
const { t } = useI18n()
const router = useRouter()

const loading = ref<'google' | 'anon' | null>(null)

watch(
  user,
  (u) => {
    if (u) router.replace('/app')
  },
  { immediate: true },
)

onMounted(async () => {
  try {
    const u = await finishGoogleRedirect()
    if (u) {
      loading.value = 'google'
      await router.replace('/app')
    }
  } catch {
    // toast shown
  } finally {
    if (!user.value) loading.value = null
  }
})

async function onGoogle() {
  if (loading.value) return
  loading.value = 'google'
  try {
    await loginWithGoogle()
    await router.push('/app')
  } catch {
    // toast already shown — loadingni tozalash
  } finally {
    // Redirect ketayotgan bo‘lsa ham 10s ichida xato chiqadi
    loading.value = null
  }
}

async function onAnonymous() {
  if (loading.value) return
  loading.value = 'anon'
  try {
    await loginAnonymous()
    await router.push('/app')
  } catch {
    // toast
  } finally {
    loading.value = null
  }
}

onErrorCaptured((err) => {
  toastError(err?.message || 'Error')
  return false
})
</script>

<template>
  <main class="relative flex min-h-dvh flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.06),_transparent_55%)]" />

    <div class="absolute right-3 top-3 z-20 sm:right-5 sm:top-5">
      <LanguageSwitcher />
    </div>

    <div class="relative z-10 flex w-full max-w-sm flex-col items-center">
      <div class="mb-8 text-center sm:mb-10" style="animation: fadeUp 0.45s ease-out both">
        <h1 class="font-display text-[2.4rem] font-black leading-none tracking-tight text-white sm:text-5xl">
          <span class="inline-flex items-center">
            <span class="logo-outline">live</span>
            <span class="mx-1 inline-flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white bg-black sm:h-11 sm:w-11">
              <span class="text-base font-black leading-none text-white sm:text-xl">:)</span>
            </span>
            <span class="logo-outline">chat</span>
          </span>
        </h1>
        <p class="mt-4 text-sm leading-snug text-zinc-400 sm:text-[15px]">
          {{ t('tagline') }}
        </p>
      </div>

      <div class="w-full space-y-3 sm:space-y-4" style="animation: fadeUp 0.45s ease-out 0.1s both">
        <button
          type="button"
          class="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-[15px] font-bold text-black transition hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-60"
          :disabled="!!loading"
          @click="onGoogle"
        >
          <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span>{{ loading === 'google' ? t('loading') : t('loginGoogle') }}</span>
        </button>

        <div class="flex items-center gap-3 py-1">
          <div class="h-px flex-1 bg-zinc-800" />
          <span class="text-xs text-zinc-500">{{ t('or') }}</span>
          <div class="h-px flex-1 bg-zinc-800" />
        </div>

        <button
          type="button"
          class="flex w-full items-center justify-center gap-3 rounded-2xl bg-zinc-900 px-4 py-3.5 text-[15px] font-bold text-white ring-1 ring-zinc-800 transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-60"
          :disabled="!!loading"
          @click="onAnonymous"
        >
          <svg
            class="h-5 w-5 shrink-0 text-zinc-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            />
          </svg>
          <span>{{ loading === 'anon' ? t('loading') : t('loginAnon') }}</span>
        </button>
      </div>

      <p class="mt-10 max-w-xs text-center text-[12px] leading-relaxed text-zinc-500 sm:mt-14" style="animation: fadeUp 0.45s ease-out 0.2s both">
        {{ t('agreePrefix') }}
        <NuxtLink to="/terms" class="underline underline-offset-2 hover:text-zinc-300">{{ t('terms') }}</NuxtLink>
        {{ ' ' }}{{ t('and') }}{{ ' ' }}
        <NuxtLink to="/privacy" class="underline underline-offset-2 hover:text-zinc-300">{{ t('privacy') }}</NuxtLink>
        <template v-if="t('agreeSuffix')">{{ ' ' }}{{ t('agreeSuffix') }}</template><template v-else>.</template>
      </p>
    </div>
  </main>
</template>

<style scoped>
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.logo-outline {
  color: #fff;
  text-shadow:
    -1.5px -1.5px 0 #fff,
    1.5px -1.5px 0 #fff,
    -1.5px 1.5px 0 #fff,
    1.5px 1.5px 0 #fff;
}
</style>
