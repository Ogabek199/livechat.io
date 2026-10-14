import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

export type SessionUser = {
  id: string
  name: string
  isAnonymous: boolean
  createdAt: string
}

const COOKIE = 'lc_session'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 kun

function secret() {
  try {
    const config = useRuntimeConfig()
    if (config.sessionSecret) return String(config.sessionSecret)
  } catch {
    // ignore outside of request context
  }
  return process.env.SESSION_SECRET || 'livechat-dev-secret-change-me'
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function createSessionToken(user: SessionUser): string {
  const body = Buffer.from(JSON.stringify(user), 'utf8').toString('base64url')
  return `${body}.${sign(body)}`
}

export function verifySessionToken(token: string | undefined): SessionUser | null {
  if (!token || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = sign(body)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const raw = Buffer.from(body, 'base64url').toString('utf8')
    const user = JSON.parse(raw) as SessionUser
    if (!user?.id || !user?.name || typeof user.isAnonymous !== 'boolean') return null
    // Firebase uid yoki ichki id
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(user.id)) return null
    return user
  } catch {
    return null
  }
}

export function setSessionCookie(event: H3Event, user: SessionUser) {
  const token = createSessionToken(user)
  setCookie(event, COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  })
  return token
}

export function clearSessionCookie(event: H3Event) {
  deleteCookie(event, COOKIE, { path: '/' })
}

export function getSessionFromEvent(event: H3Event): SessionUser | null {
  const token = getCookie(event, COOKIE)
  return verifySessionToken(token)
}

export function newUserId() {
  return `u_${randomBytes(12).toString('base64url')}`
}

export function newRoomId() {
  return `r_${randomBytes(16).toString('base64url')}`
}

export { COOKIE }
