import { createRemoteJWKSet, jwtVerify } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

export type FirebaseClaims = {
  uid: string
  email?: string
  name?: string
  picture?: string
  firebase?: { sign_in_provider?: string }
}

export async function verifyFirebaseIdToken(idToken: string, projectId: string): Promise<FirebaseClaims> {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 16_384) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid token' })
  }
  if (!projectId) {
    throw createError({ statusCode: 500, statusMessage: 'Firebase project not configured' })
  }

  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      clockTolerance: 60,
    })

    const uid = String(payload.sub || '')
    if (!uid || uid.length > 128) {
      throw new Error('missing uid')
    }

    return {
      uid,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
      firebase: payload.firebase as FirebaseClaims['firebase'],
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'verify failed'
    console.error('[firebaseToken]', msg)
    throw createError({ statusCode: 401, statusMessage: 'Firebase token invalid' })
  }
}
