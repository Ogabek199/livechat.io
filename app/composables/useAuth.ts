export type AuthUser = {
  id: string
  name: string
  isAnonymous: boolean
  createdAt: string
}

function errMessage(err: unknown, fallback: string) {
  const e = err as {
    code?: string
    message?: string
    data?: { message?: string; statusMessage?: string }
    statusMessage?: string
  }
  return (
    e?.data?.statusMessage ||
    e?.data?.message ||
    e?.statusMessage ||
    e?.message ||
    fallback
  ).slice(0, 180)
}

export function useAuth() {
  const user = useState<AuthUser | null>('auth-user', () => null)
  const ready = useState('auth-ready', () => false)
  const toast = useToast()

  async function syncSession(idToken: string) {
    const res = await $fetch<{ user: AuthUser }>('/api/auth/session', {
      method: 'POST',
      body: { idToken },
    })
    user.value = res.user
    ready.value = true
    return res.user
  }

  async function completeFirebaseUser(fbUser: { getIdToken: (force?: boolean) => Promise<string> }) {
    const idToken = await fbUser.getIdToken(true)
    return await syncSession(idToken)
  }

  async function fetchMe() {
    try {
      const res = await $fetch<{ user: AuthUser }>('/api/auth/me')
      user.value = res.user
    } catch {
      user.value = null
    } finally {
      ready.value = true
    }
  }

  async function loginAnonymous() {
    try {
      const { firebaseAnonymous, firebaseAuthErrorMessage } = await import('~/utils/firebase.client')
      const fbUser = await firebaseAnonymous()
      return await completeFirebaseUser(fbUser)
    } catch (err) {
      const { firebaseAuthErrorMessage } = await import('~/utils/firebase.client').catch(() => ({
        firebaseAuthErrorMessage: (e: unknown) => errMessage(e, 'Anonim kirish xatosi'),
      }))
      toast.error(firebaseAuthErrorMessage(err))
      throw err
    }
  }

  async function loginWithGoogle() {
    try {
      const { firebaseGoogle, firebaseAuthErrorMessage } = await import('~/utils/firebase.client')
      const fbUser = await firebaseGoogle()
      return await completeFirebaseUser(fbUser)
    } catch (err) {
      const { firebaseAuthErrorMessage } = await import('~/utils/firebase.client').catch(() => ({
        firebaseAuthErrorMessage: (e: unknown) => errMessage(e, 'Google kirish xatosi'),
      }))
      toast.error(firebaseAuthErrorMessage(err))
      throw err
    }
  }

  /** Redirect orqali qaytganda chaqiriladi */
  async function finishGoogleRedirect() {
    try {
      const { firebaseGoogleRedirectResult } = await import('~/utils/firebase.client')
      const fbUser = await firebaseGoogleRedirectResult()
      if (!fbUser) return null
      return await completeFirebaseUser(fbUser)
    } catch (err) {
      toast.error(errMessage(err, 'Google redirect xatosi'))
      throw err
    }
  }

  async function logout() {
    try {
      if (import.meta.client) {
        const { firebaseLogout } = await import('~/utils/firebase.client')
        await firebaseLogout().catch(() => {})
      }
      await $fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      toast.error('Chiqishda xatolik')
    } finally {
      user.value = null
    }
  }

  async function getWsToken() {
    try {
      const res = await $fetch<{ token: string }>('/api/auth/token')
      return res.token
    } catch (err) {
      toast.error('Sessiya token olinmadi — qayta kiring')
      throw err
    }
  }

  return {
    user,
    ready,
    fetchMe,
    loginAnonymous,
    loginWithGoogle,
    finishGoogleRedirect,
    logout,
    getWsToken,
  }
}
