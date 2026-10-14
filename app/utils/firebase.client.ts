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
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth'
import { getDatabase, type Database } from 'firebase/database'

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Database | null = null
let persistenceReady: Promise<void> | null = null

function readFirebasePublic() {
  const c = useRuntimeConfig().public
  // Vercel ba'zan nomlarni string sifatida beradi — trim
  const apiKey = String(c.firebaseApiKey || '').trim()
  const projectId = String(c.firebaseProjectId || '').trim()
  const authDomain = String(c.firebaseAuthDomain || '').trim()
  const storageBucket = String(c.firebaseStorageBucket || '').trim()
  const messagingSenderId = String(c.firebaseMessagingSenderId || '').trim()
  const appId = String(c.firebaseAppId || '').trim()
  const measurementId = String(c.firebaseMeasurementId || '').trim()
  const databaseURL = String(c.firebaseDatabaseURL || '').trim()

  return {
    apiKey,
    projectId,
    authDomain,
    storageBucket,
    messagingSenderId,
    appId,
    measurementId,
    databaseURL,
  }
}

function ensureApp(): FirebaseApp {
  if (app) return app
  const c = readFirebasePublic()

  if (!c.apiKey || !c.projectId || !c.appId) {
    const missing = [
      !c.apiKey && 'NUXT_PUBLIC_FIREBASE_API_KEY',
      !c.projectId && 'NUXT_PUBLIC_FIREBASE_PROJECT_ID',
      !c.appId && 'NUXT_PUBLIC_FIREBASE_APP_ID',
    ].filter(Boolean)
    throw new Error(
      `Firebase sozlamalari topilmadi. Vercel → Settings → Environment Variables ga qo'shing: ${missing.join(', ')}`,
    )
  }

  const firebaseConfig = {
    apiKey: c.apiKey,
    authDomain: c.authDomain || `${c.projectId}.firebaseapp.com`,
    projectId: c.projectId,
    storageBucket: c.storageBucket || `${c.projectId}.appspot.com`,
    messagingSenderId: c.messagingSenderId,
    appId: c.appId,
    measurementId: c.measurementId || undefined,
    databaseURL: c.databaseURL || `https://${c.projectId}-default-rtdb.firebaseio.com`,
  }

  app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig)
  return app
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth
  auth = getAuth(ensureApp())
  persistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => {})
  return auth
}

export function getFirebaseDatabase(): Database {
  if (db) return db
  ensureApp()
  getFirebaseAuth()
  db = getDatabase(app!)
  return db
}

/** Cookie sessiya bor, lekin Firebase Auth hali restore bo‘lmagan bo‘lishi mumkin */
export function waitForFirebaseUser(timeoutMs = 8000): Promise<User> {
  const a = getFirebaseAuth()
  if (a.currentUser) return Promise.resolve(a.currentUser)

  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      unsub()
      reject(new Error('Firebase sessiya topilmadi — qayta kiring'))
    }, timeoutMs)
    const unsub = onAuthStateChanged(a, (u) => {
      if (!u) return
      clearTimeout(t)
      unsub()
      resolve(u)
    })
  })
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

    // Foydalanuvchi oynani yopdi — redirect qilmaslik (loading qotib qolmasin)
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw err
    }

    // Popup bloklangan / COOP buzgan — redirect
    if (code === 'auth/popup-blocked' || code === 'auth/internal-error') {
      await signInWithRedirect(a, provider)
      // Brauzer Google’ga o‘tishi kerak; o‘tmasa — loadingni ochish uchun xato
      await new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            Object.assign(new Error('Google redirect ishlamadi — qayta urinib ko‘ring'), {
              code: 'auth/redirect-failed',
            }),
          )
        }, 10_000)
      })
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
      return 'Brauzer popupni blokladi — ruxsat bering yoki qayta bosing'
    case 'auth/cancelled-popup-request':
      return 'Kirish bekor qilindi'
    case 'auth/redirect-failed':
      return 'Google sahifasiga o‘tib bo‘lmadi — qayta urinib ko‘ring'
    case 'auth/network-request-failed':
      return 'Internet aloqasi yo‘q'
    case 'auth/unauthorized-domain':
      return 'Domain Firebase’da ruxsat etilmagan (localhost + vercel.app qo‘shing)'
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
