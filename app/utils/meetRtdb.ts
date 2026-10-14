import {
  get,
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  set,
  update,
  type Database,
  type Unsubscribe,
} from 'firebase/database'
import { getFirebaseDatabase } from '~/utils/firebase.client'

export type MeetPartner = { id: string; name: string }

export type MeetMatched = {
  roomId: string
  partner: MeetPartner
  initiator: boolean
}

export type MeetChatPayload = {
  text?: string
  stickerId?: string
  from: string
  ts: number
  echo?: boolean
}

type WaitingEntry = {
  name: string
  ts: number
  claimedBy?: string
  claimerName?: string
  roomId?: string
}

function newRoomId() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `r_${b64}`
}

export class MeetRtdbSession {
  private db: Database
  private uid: string
  private name: string
  private roomId: string | null = null
  private unsubs: Unsubscribe[] = []
  private disconnectOps: Array<{ cancel: () => Promise<void> }> = []

  onSearching: (() => void) | null = null
  onMatched: ((m: MeetMatched) => void) | null = null
  onPartnerLeft: (() => void) | null = null
  onSignal: ((data: Record<string, unknown>) => void) | null = null
  onChat: ((msg: MeetChatPayload) => void) | null = null

  constructor(uid: string, name: string) {
    this.db = getFirebaseDatabase()
    this.uid = uid
    this.name = name.slice(0, 40)
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

  async leaveQueue() {
    await remove(ref(this.db, `waiting/${this.uid}`)).catch(() => {})
  }

  async find() {
    await this.leaveRoomLocal(false)
    await this.leaveQueue()
    this.clearListeners()
    await this.clearDisconnect()

    const waitingSnap = await get(ref(this.db, 'waiting'))
    const all = (waitingSnap.val() || {}) as Record<string, WaitingEntry>
    const candidates = Object.entries(all)
      .filter(([id, v]) => id !== this.uid && v && !v.claimedBy && typeof v.name === 'string')
      .sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0))

    for (const [otherId, other] of candidates) {
      const roomId = newRoomId()
      const result = await runTransaction(ref(this.db, `waiting/${otherId}`), (cur) => {
        if (!cur || typeof cur !== 'object') return
        const c = cur as WaitingEntry
        if (c.claimedBy) return
        return {
          name: c.name,
          ts: c.ts,
          claimedBy: this.uid,
          claimerName: this.name,
          roomId,
        }
      })

      const val = result.snapshot.val() as WaitingEntry | null
      if (!result.committed || !val || val.claimedBy !== this.uid || !val.roomId) continue

      await set(ref(this.db, `rooms/${val.roomId}`), {
        a: this.uid,
        b: otherId,
        aName: this.name,
        bName: other.name,
        createdAt: Date.now(),
        status: 'active',
      })

      // Kutayotgan tomon claimedBy ni o'zi o'qiydi va waiting ni tozalaydi
      await remove(ref(this.db, `waiting/${this.uid}`)).catch(() => {})

      await this.enterRoom(val.roomId, { id: otherId, name: other.name }, true)
      return
    }

    const myRef = ref(this.db, `waiting/${this.uid}`)
    await set(myRef, { name: this.name, ts: Date.now() })
    const disc = onDisconnect(myRef)
    await disc.remove()
    this.disconnectOps.push(disc)

    this.onSearching?.()

    this.track(
      onValue(myRef, async (snap) => {
        const v = snap.val() as WaitingEntry | null
        if (!v?.claimedBy || !v.roomId) return
        const partner: MeetPartner = {
          id: v.claimedBy,
          name: String(v.claimerName || 'User').slice(0, 40),
        }
        await remove(myRef).catch(() => {})
        await this.enterRoom(v.roomId, partner, false)
      }),
    )
  }

  private async enterRoom(roomId: string, partner: MeetPartner, initiator: boolean) {
    this.clearListeners()
    await this.clearDisconnect()
    this.roomId = roomId

    const presenceRef = ref(this.db, `rooms/${roomId}/presence/${this.uid}`)
    await set(presenceRef, { online: true, name: this.name, ts: Date.now() })
    const disc = onDisconnect(presenceRef)
    await disc.set({ online: false, name: this.name, ts: Date.now() })
    this.disconnectOps.push(disc)

    const partnerPresence = ref(this.db, `rooms/${roomId}/presence/${partner.id}`)
    this.track(
      onValue(partnerPresence, (snap) => {
        const v = snap.val() as { online?: boolean } | null
        if (v && v.online === false) {
          this.onPartnerLeft?.()
        }
      }),
    )

    const signalsRef = ref(this.db, `rooms/${roomId}/signals`)
    this.track(
      onChildAdded(signalsRef, (snap) => {
        const v = snap.val() as { from?: string; data?: Record<string, unknown> } | null
        if (!v || v.from === this.uid || !v.data || typeof v.data !== 'object') return
        this.onSignal?.(v.data)
      }),
    )

    const chatRef = ref(this.db, `rooms/${roomId}/chat`)
    this.track(
      onChildAdded(chatRef, (snap) => {
        const v = snap.val() as MeetChatPayload | null
        if (!v || typeof v.from !== 'string') return
        this.onChat?.({
          ...v,
          echo: v.from === this.uid,
        })
      }),
    )

    this.onMatched?.({ roomId, partner, initiator })
  }

  async sendSignal(data: Record<string, unknown>) {
    if (!this.roomId) return
    await push(ref(this.db, `rooms/${this.roomId}/signals`), {
      from: this.uid,
      data,
      ts: Date.now(),
    })
  }

  async sendChat(text: string) {
    if (!this.roomId) return false
    await push(ref(this.db, `rooms/${this.roomId}/chat`), {
      from: this.uid,
      text,
      ts: Date.now(),
    })
    return true
  }

  async sendSticker(stickerId: string) {
    if (!this.roomId) return false
    await push(ref(this.db, `rooms/${this.roomId}/chat`), {
      from: this.uid,
      stickerId,
      ts: Date.now(),
    })
    return true
  }

  private async leaveRoomLocal(notify: boolean) {
    const roomId = this.roomId
    this.roomId = null
    this.clearListeners()
    await this.clearDisconnect()
    if (!roomId) return
    if (notify) {
      await update(ref(this.db, `rooms/${roomId}/presence/${this.uid}`), {
        online: false,
        ts: Date.now(),
      }).catch(() => {})
    }
  }

  async next() {
    await this.leaveRoomLocal(true)
    await this.find()
  }

  async leave() {
    await this.leaveRoomLocal(true)
    await this.leaveQueue()
  }

  async dispose() {
    await this.leave()
  }
}
