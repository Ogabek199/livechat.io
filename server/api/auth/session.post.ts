import { randomInt } from 'node:crypto'
import { verifyFirebaseIdToken } from '../../utils/firebaseToken'
import { setSessionCookie } from '../../utils/session'
import { sanitizeDisplayName } from '../../utils/sanitize'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ idToken?: string }>(event)
  const idToken = body?.idToken
  if (!idToken || typeof idToken !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'idToken required' })
  }

  const config = useRuntimeConfig()
  const projectId = config.public.firebaseProjectId
  const claims = await verifyFirebaseIdToken(idToken, projectId)

  const provider = claims.firebase?.sign_in_provider || ''
  const isAnonymous = provider === 'anonymous'
  const name = sanitizeDisplayName(
    claims.name || (isAnonymous ? `Anonim #${randomInt(1000, 9999)}` : claims.email?.split('@')[0] || 'User'),
  )

  // Firebase uid — URL ga chiqarilmaydi; faqat server sessiyasida
  const user = {
    id: claims.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || `u_${claims.uid.slice(0, 20)}`,
    name,
    isAnonymous,
    createdAt: new Date().toISOString(),
  }

  setSessionCookie(event, user)
  return { ok: true, user }
})
