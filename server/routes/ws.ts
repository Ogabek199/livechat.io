import { getQuery } from 'h3'
import { COOKIE, verifySessionToken } from '../utils/session'
import { sanitizeText } from '../utils/sanitize'
import { isValidStickerId } from '../../shared/stickers'
import {
  enqueue,
  getPeer,
  leaveQueue,
  leaveRoom,
  partnerOf,
  registerPeer,
  sendTo,
  unregisterPeer,
} from '../utils/matchmaking'

function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) {
      try {
        return decodeURIComponent(rest.join('=') || '')
      } catch {
        return rest.join('=') || ''
      }
    }
  }
  return undefined
}

type InMsg =
  | { type: 'find' }
  | { type: 'leave' }
  | { type: 'next' }
  | { type: 'chat'; text: string }
  | { type: 'sticker'; stickerId: string }
  | { type: 'signal'; data: unknown }
  | { type: 'ping' }

const rate = new Map<string, { count: number; reset: number }>()

function allowRate(userId: string, limit = 30, windowMs = 10_000) {
  const now = Date.now()
  const cur = rate.get(userId)
  if (!cur || now > cur.reset) {
    rate.set(userId, { count: 1, reset: now + windowMs })
    return true
  }
  if (cur.count >= limit) return false
  cur.count += 1
  return true
}

function parseMsg(raw: unknown): InMsg | null {
  try {
    let text: string
    if (typeof raw === 'string') text = raw
    else if (raw && typeof raw === 'object' && 'text' in raw && typeof (raw as { text: unknown }).text === 'function') {
      text = String((raw as { text: () => string }).text())
    } else text = String(raw)

    const data = JSON.parse(text) as InMsg
    if (!data || typeof data !== 'object' || typeof (data as { type?: string }).type !== 'string') return null
    return data
  } catch {
    return null
  }
}

function authFromPeer(peer: { request?: Request }): ReturnType<typeof verifySessionToken> {
  const req = peer.request
  if (!req) return null

  // 1) httpOnly cookie (URL da token yo'q)
  const cookieHeader = req.headers.get('cookie') || ''
  const fromCookie = verifySessionToken(readCookie(cookieHeader, COOKIE))
  if (fromCookie) return fromCookie

  // 2) Query token (cookie WS ga o'tmasa)
  try {
    const url = req.url || ''
    const q = getQuery(url.includes('?') ? '?' + url.split('?')[1] : '')
    const t = typeof q.t === 'string' ? q.t : ''
    return verifySessionToken(t)
  } catch {
    return null
  }
}

function notifyPartnerLeft(userId: string) {
  const partnerId = leaveRoom(userId)
  if (partnerId) sendTo(partnerId, { type: 'partner_left' })
}

function tryMatch(userId: string) {
  const result = enqueue(userId)
  if (!result.matched) {
    sendTo(userId, { type: 'searching' })
    return
  }

  const self = getPeer(userId)!
  sendTo(userId, {
    type: 'matched',
    roomId: result.roomId,
    partner: { id: result.partnerId, name: result.partnerName },
    initiator: true,
  })
  sendTo(result.partnerId, {
    type: 'matched',
    roomId: result.roomId,
    partner: { id: userId, name: self.name },
    initiator: false,
  })
}

export default defineWebSocketHandler({
  open(peer) {
    const user = authFromPeer(peer)
    if (!user) {
      peer.send(JSON.stringify({ type: 'error', code: 'unauthorized' }))
      peer.close(4401, 'Unauthorized')
      return
    }

    ;(peer as { _uid?: string })._uid = user.id
    registerPeer(user.id, user.name, peer)
    peer.send(JSON.stringify({ type: 'ready', user: { id: user.id, name: user.name } }))
  },

  message(peer, message) {
    const userId = (peer as { _uid?: string })._uid
    if (!userId) return

    if (!allowRate(userId)) {
      peer.send(JSON.stringify({ type: 'error', code: 'rate_limited' }))
      return
    }

    const msg = parseMsg(message)
    if (!msg) return

    switch (msg.type) {
      case 'ping':
        peer.send(JSON.stringify({ type: 'pong' }))
        break
      case 'find':
      case 'next':
        notifyPartnerLeft(userId)
        leaveQueue(userId)
        tryMatch(userId)
        break
      case 'leave':
        leaveQueue(userId)
        notifyPartnerLeft(userId)
        peer.send(JSON.stringify({ type: 'idle' }))
        break
      case 'chat': {
        const text = sanitizeText(msg.text, 500)
        if (!text) return
        const partner = partnerOf(userId)
        if (!partner) return
        const payload = {
          type: 'chat',
          text,
          from: userId,
          at: Date.now(),
        }
        sendTo(partner.userId, payload)
        peer.send(JSON.stringify({ ...payload, echo: true }))
        break
      }
      case 'sticker': {
        if (!isValidStickerId(msg.stickerId)) return
        const partner = partnerOf(userId)
        if (!partner) return
        const payload = {
          type: 'sticker',
          stickerId: msg.stickerId,
          from: userId,
          at: Date.now(),
        }
        sendTo(partner.userId, payload)
        peer.send(JSON.stringify({ ...payload, echo: true }))
        break
      }
      case 'signal': {
        const partner = partnerOf(userId)
        if (!partner) return
        if (msg.data === null || typeof msg.data !== 'object') return
        sendTo(partner.userId, { type: 'signal', data: msg.data, from: userId })
        break
      }
      default:
        break
    }
  },

  close(peer) {
    const userId = (peer as { _uid?: string })._uid
    if (!userId) return
    notifyPartnerLeft(userId)
    unregisterPeer(userId)
  },
})
