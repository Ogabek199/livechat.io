import { getSessionFromEvent, createSessionToken } from '../../utils/session'

/** WS uchun qisqa muddatli token — URL path emas, query orqali bir marta */
export default defineEventHandler((event) => {
  const user = getSessionFromEvent(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  // Cookie bilan bir xil imzolangan token (WS cookie o'tkazmaydi)
  return { token: createSessionToken(user) }
})
