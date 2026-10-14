import {
  get,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
  type Database,
  type Unsubscribe,
} from 'firebase/database'
import { getFirebaseDatabase } from '~/utils/firebase.client'

export type PrivatePartner = { id: string; name: string }

export type JoinRequest = { uid: string; name: string; ts: number }

export type MeetChatPayload = {
  id: string
  text?: string
  stickerId?: string
  from: string
  ts: number
  editedAt?: number
  echo?: boolean
}

const CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

function randomSegment(len: number) {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
  return out
}

/** Google Meet uslubidagi kod: xxx-yyyy-zzz */
export function generateMeetCode() {
  return `${randomSegment(3)}-${randomSegment(4)}-${randomSegment(3)}`
}

export function isValidMeetCode(code: string) {
  return /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/.test(code)
}

function newRoomId() {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `p_${b64}`
}

export class PrivateMeetSession {
  private db: Database
  private uid: string
  private name: string
  private roomId: string | null = null
  private code: string | null = null
  private isHost = false
  private unsubs: Unsubscribe[] = []
  private disconnectOps: Array<{ cancel: () => Promise<void> }> = []

  onRequest: ((r: JoinRequest) => void) | null = null
  onRequestRemoved: ((uid: string) => void) | null = null
  onApproved: ((info: { roomId: string; partner: PrivatePartner; initiator: boolean }) => void) | null = null
  onPartnerLeft: (() => void) | null = null
  onSignal: ((data: Record<string, unknown>) => void) | null = null
  onChat: ((msg: MeetChatPayload) => void) | null = null
  onChatUpdated: ((msg: MeetChatPayload) => void) | null = null
  onClosed: (() => void) | null = null

  constructor(uid: string, name: string) {
    this.db = getFirebaseDatabase()
    this.uid = uid
    this.name = name.slice(0, 40)
  }

  getRoomId() {
    return this.roomId
  }

  getCode() {
    return this.code
  }

  private track(unsub: Unsubscribe) {
    this.unsubs.push(unsub)
    return unsub
  }

  private async clearDisconnect() {
    for (const op of this.disconnectOps) {
      try {
        await op.cancel()
      } catch {
        // ignore
      }
    }
    this.disconnectOps = []
  }

  private clearListeners() {
    for (const u of this.unsubs) {
      try {
        u()
      } catch {
        // ignore
      }
    }
    this.unsubs = []
  }

  /** Host: yangi private meet yaratish */
  async create(): Promise<{ code: string; roomId: string }> {
    this.clearListeners()
    await this.clearDisconnect()

    const code = generateMeetCode()
    const roomId = newRoomId()
    this.code = code
    this.roomId = roomId
    this.isHost = true

    await set(ref(this.db, `meetCodes/${code}`), {
      roomId,
      hostId: this.uid,
      createdAt: Date.now(),
    })

    await set(ref(this.db, `privateMeets/${roomId}`), {
      code,
      hostId: this.uid,
      hostName: this.name,
      createdAt: Date.now(),
      status: 'waiting',
    })

    await set(ref(this.db, `privateMeets/${roomId}/members/${this.uid}`), {
      name: this.name,
      role: 'host',
      joinedAt: Date.now(),
    })

    const discCode = onDisconnect(ref(this.db, `meetCodes/${code}`))
    await discCode.remove()
    this.disconnectOps.push(discCode)

    const discRoom = onDisconnect(ref(this.db, `privateMeets/${roomId}/status`))
    await discRoom.set('closed')
    this.disconnectOps.push(discRoom)

    this.listenRequests(roomId)
    this.listenRoomMeta(roomId)
    await this.setPresence(roomId)

    return { code, roomId }
  }

  private listenRequests(roomId: string) {
    const reqRef = ref(this.db, `privateMeets/${roomId}/requests`)
    this.track(
      onChildAdded(reqRef, (snap) => {
        const uid = snap.key
        const v = snap.val() as { name?: string; ts?: number } | null
        if (!uid || !v?.name) return
        this.onRequest?.({ uid, name: String(v.name).slice(0, 40), ts: v.ts || Date.now() })
      }),
    )
    this.track(
      onChildRemoved(reqRef, (snap) => {
        if (snap.key) this.onRequestRemoved?.(snap.key)
      }),
    )
  }

  private listenRoomMeta(roomId: string) {
    this.track(
      onValue(ref(this.db, `privateMeets/${roomId}/status`), (snap) => {
        if (snap.val() === 'closed') this.onClosed?.()
      }),
    )
  }

  private async setPresence(roomId: string) {
    const presenceRef = ref(this.db, `privateMeets/${roomId}/presence/${this.uid}`)
    await set(presenceRef, { online: true, name: this.name, ts: Date.now() })
    const disc = onDisconnect(presenceRef)
    await disc.set({ online: false, name: this.name, ts: Date.now() })
    this.disconnectOps.push(disc)
  }

  /** Host: so‘rovni qabul qilish */
  async approve(guestUid: string, guestName: string) {
    if (!this.roomId || !this.isHost) return
    const roomId = this.roomId

    await set(ref(this.db, `privateMeets/${roomId}/members/${guestUid}`), {
      name: guestName.slice(0, 40),
      role: 'guest',
      joinedAt: Date.now(),
    })
    await remove(ref(this.db, `privateMeets/${roomId}/requests/${guestUid}`)).catch(() => {})
    await update(ref(this.db, `privateMeets/${roomId}`), {
      status: 'active',
      guestId: guestUid,
      guestName: guestName.slice(0, 40),
    })

    await this.bindCall(roomId, { id: guestUid, name: guestName }, true)
  }

  /** Host: so‘rovni rad etish */
  async reject(guestUid: string) {
    if (!this.roomId || !this.isHost) return
    await remove(ref(this.db, `privateMeets/${this.roomId}/requests/${guestUid}`)).catch(() => {})
  }

  /** Guest: kod orqali ulanish so‘rovi */
  async requestJoin(code: string): Promise<{ roomId: string; hostName: string }> {
    const normalized = code.trim().toLowerCase()
    if (!isValidMeetCode(normalized)) throw new Error('invalid-code')

    this.clearListeners()
    await this.clearDisconnect()
    this.isHost = false
    this.code = normalized

    const codeSnap = await get(ref(this.db, `meetCodes/${normalized}`))
    const codeVal = codeSnap.val() as { roomId?: string; hostId?: string } | null
    if (!codeVal?.roomId) throw new Error('not-found')

    const roomId = codeVal.roomId
    this.roomId = roomId

    const roomSnap = await get(ref(this.db, `privateMeets/${roomId}`))
    const room = roomSnap.val() as {
      hostId?: string
      hostName?: string
      status?: string
      guestId?: string
    } | null

    if (!room || room.status === 'closed') throw new Error('closed')
    if (room.hostId === this.uid) throw new Error('self')

    // Allaqachon a'zo bo‘lsa
    const memberSnap = await get(ref(this.db, `privateMeets/${roomId}/members/${this.uid}`))
    if (memberSnap.exists()) {
      const hostName = String(room.hostName || 'Host').slice(0, 40)
      await this.setPresence(roomId)
      await this.bindCall(roomId, { id: room.hostId!, name: hostName }, false)
      return { roomId, hostName }
    }

    await set(ref(this.db, `privateMeets/${roomId}/requests/${this.uid}`), {
      name: this.name,
      ts: Date.now(),
    })

    const discReq = onDisconnect(ref(this.db, `privateMeets/${roomId}/requests/${this.uid}`))
    await discReq.remove()
    this.disconnectOps.push(discReq)

    // Approve kutish
    this.track(
      onValue(ref(this.db, `privateMeets/${roomId}/members/${this.uid}`), async (snap) => {
        if (!snap.exists()) return
        const hostName = String(room.hostName || 'Host').slice(0, 40)
        await remove(ref(this.db, `privateMeets/${roomId}/requests/${this.uid}`)).catch(() => {})
        await this.clearDisconnect()
        await this.setPresence(roomId)
        await this.bindCall(roomId, { id: room.hostId!, name: hostName }, false)
      }),
    )

    this.listenRoomMeta(roomId)

    return { roomId, hostName: String(room.hostName || 'Host').slice(0, 40) }
  }

  private async bindCall(roomId: string, partner: PrivatePartner, initiator: boolean) {
    // Request listenerlarni tozalash, call listenerlarni qo‘yish
    this.clearListeners()
    // presence disconnect saqlansin — clearDisconnect qilmaymiz

    const partnerPresence = ref(this.db, `privateMeets/${roomId}/presence/${partner.id}`)
    this.track(
      onValue(partnerPresence, (snap) => {
        const v = snap.val() as { online?: boolean } | null
        if (v && v.online === false) this.onPartnerLeft?.()
      }),
    )

    this.track(
      onChildAdded(ref(this.db, `privateMeets/${roomId}/signals`), (snap) => {
        const v = snap.val() as { from?: string; data?: Record<string, unknown> } | null
        if (!v || v.from === this.uid || !v.data || typeof v.data !== 'object') return
        this.onSignal?.(v.data)
      }),
    )

    const chatRef = ref(this.db, `privateMeets/${roomId}/chat`)
    const mapChat = (snap: { key: string | null; val: () => unknown }): MeetChatPayload | null => {
      const id = snap.key
      const v = snap.val() as Omit<MeetChatPayload, 'id' | 'echo'> | null
      if (!id || !v || typeof v.from !== 'string') return null
      return { ...v, id, echo: v.from === this.uid }
    }
    this.track(
      onChildAdded(chatRef, (snap) => {
        const msg = mapChat(snap)
        if (msg) this.onChat?.(msg)
      }),
    )
    this.track(
      onChildChanged(chatRef, (snap) => {
        const msg = mapChat(snap)
        if (msg) this.onChatUpdated?.(msg)
      }),
    )

    this.listenRoomMeta(roomId)
    this.onApproved?.({ roomId, partner, initiator })
  }

  /** Host: mehmon chiqgach yana so‘rovlarni tinglash */
  async resumeHosting() {
    if (!this.roomId || !this.isHost) return
    this.clearListeners()
    await update(ref(this.db, `privateMeets/${this.roomId}`), {
      status: 'waiting',
      guestId: null,
      guestName: null,
    }).catch(() => {})
    this.listenRequests(this.roomId)
    this.listenRoomMeta(this.roomId)
  }

  async sendSignal(data: Record<string, unknown>) {
    if (!this.roomId) return
    await push(ref(this.db, `privateMeets/${this.roomId}/signals`), {
      from: this.uid,
      data,
      ts: Date.now(),
    })
  }

  async sendChat(text: string) {
    if (!this.roomId) return false
    await push(ref(this.db, `privateMeets/${this.roomId}/chat`), {
      from: this.uid,
      text,
      ts: Date.now(),
    })
    return true
  }

  async editChat(messageId: string, text: string) {
    if (!this.roomId || !messageId) return false
    const msgRef = ref(this.db, `privateMeets/${this.roomId}/chat/${messageId}`)
    const snap = await get(msgRef)
    const cur = snap.val() as { from?: string; stickerId?: string; ts?: number } | null
    if (!cur || cur.from !== this.uid || cur.stickerId || typeof cur.ts !== 'number') return false
    await update(msgRef, {
      text,
      from: this.uid,
      ts: cur.ts,
      editedAt: Date.now(),
    })
    return true
  }

  async sendSticker(stickerId: string) {
    if (!this.roomId) return false
    await push(ref(this.db, `privateMeets/${this.roomId}/chat`), {
      from: this.uid,
      stickerId,
      ts: Date.now(),
    })
    return true
  }

  async leave() {
    const roomId = this.roomId
    const code = this.code
    const wasHost = this.isHost

    if (roomId) {
      await update(ref(this.db, `privateMeets/${roomId}/presence/${this.uid}`), {
        online: false,
        ts: Date.now(),
      }).catch(() => {})
      await remove(ref(this.db, `privateMeets/${roomId}/requests/${this.uid}`)).catch(() => {})
      if (wasHost) {
        await update(ref(this.db, `privateMeets/${roomId}`), { status: 'closed' }).catch(() => {})
        if (code) await remove(ref(this.db, `meetCodes/${code}`)).catch(() => {})
      }
    }

    this.clearListeners()
    await this.clearDisconnect()
    this.roomId = null
    this.code = null
    this.isHost = false
  }
}
