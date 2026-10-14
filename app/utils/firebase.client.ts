import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'

let app: FirebaseApp | null = null
let auth: Auth | null = null
let persistenceReady: Promise<void> | null = null

export function getFirebaseAuth(): Auth {
  if (auth) return auth
  const config = useRuntimeConfig().public

  if (!config.firebaseApiKey || !config.firebaseProjectId) {
    throw new Error('Firebase sozlamalari topilmadi (.env ni tekshiring)')
  }

  const firebaseConfig = {
    apiKey: config.firebaseApiKey,
    authDomain: config.firebaseAuthDomain,
    projectId: config.firebaseProjectId,
    storageBucket: config.firebaseStorageBucket,
    messagingSenderId: config.firebaseMessagingSenderId,
    appId: config.firebaseAppId,
    measurementId: config.firebaseMeasurementId || undefined,
  }

  app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig)
  auth = getAuth(app)
  persistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => {})
  return auth
}

async function readyAuth() {
  const a = getFirebaseAuth()
  await persistenceReady
  return a
}

export async function firebaseAnonymous(): Promise<User> {
  const a = await readyAuth()
  const cred = await signInAnonymously(a)
  return cred.user
}

export async function firebaseGoogle(): Promise<User> {
  const a = await readyAuth()
  const provider = new GoogleAuthProvider()
  provider.addScope('profile')
  provider.addScope('email')
  provider.setCustomParameters({ prompt: 'select_account' })

  try {
    const cred = await signInWithPopup(a, provider)
    return cred.user
  } catch (err) {
    const code = (err as { code?: string })?.code || ''
    // Popup COOP/brauzer tomonidan buzilsa — redirect fallback
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/internal-error'
    ) {
      await signInWithRedirect(a, provider)
      // Sahifa yo‘naltiriladi — Promise hech qachon resolve bo‘lmasin
      await new Promise(() => {})
    }
    throw err
  }
}

/** Redirect orqali qaytganda natijani olish */
export async function firebaseGoogleRedirectResult(): Promise<User | null> {
  const a = await readyAuth()
  const result = await getRedirectResult(a)
  return result?.user ?? null
}

export async function firebaseLogout() {
  const a = await readyAuth()
  await signOut(a)
}

export function firebaseAuthErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code || ''
  const statusMessage =
    (err as { data?: { statusMessage?: string; message?: string } })?.data?.statusMessage ||
    (err as { data?: { message?: string } })?.data?.message ||
    (err as { statusMessage?: string })?.statusMessage

  if (statusMessage && !code.startsWith('auth/')) {
    return String(statusMessage).slice(0, 160)
  }

  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Kirish oynasi yopildi — qayta urinib ko‘ring'
    case 'auth/popup-blocked':
      return 'Brauzer popupni blokladi — ruxsat bering'
    case 'auth/cancelled-popup-request':
      return 'Kirish bekor qilindi'
    case 'auth/network-request-failed':
      return 'Internet aloqasi yo‘q'
    case 'auth/unauthorized-domain':
      return 'Domain Firebase’da ruxsat etilmagan (localhost qo‘shing)'
    case 'auth/operation-not-allowed':
      return 'Google kirish Firebase Console’da yoqilmagan'
    case 'auth/too-many-requests':
      return 'Juda ko‘p urinish — biroz kuting'
    case 'auth/account-exists-with-different-credential':
      return 'Bu email boshqa usul bilan ro‘yxatdan o‘tgan'
    default:
      return (err as Error)?.message?.slice(0, 160) || 'Firebase xatosi'
  }
}
