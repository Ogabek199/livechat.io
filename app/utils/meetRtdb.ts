import {
  get,
  onChildAdded,
  onChildChanged,
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
  id: string
  text?: string
  stickerId?: string
  from: string
  ts: number
  editedAt?: number
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

/** Yangiroq kutuvchi eskiroqni claim qiladi — ikkala tomon bir-birini claim qilmasin */
function shouldClaimOther(otherId: string, otherTs: number, myId: string, myTs: number | null) {
  if (myTs == null) return true
  if (otherTs < myTs) return true
  if (otherTs > myTs) return false
  return otherId < myId
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export class MeetRtdbSession {
  private db: Database
  private uid: string
  private name: string
  private roomId: string | null = null
  private myWaitTs: number | null = null
  private matched = false
  private claiming = false
  private joining = false
  private unsubs: Unsubscribe[] = []
  private disconnectOps: Array<{ cancel: () => Promise<void> }> = []

  onSearching: (() => void) | null = null
  onMatched: ((m: MeetMatched) => void) | null = null
  onPartnerLeft: (() => void) | null = null
  onSignal: ((data: Record<string, unknown>) => void) | null = null
  onChat: ((msg: MeetChatPayload) => void) | null = null
  onChatUpdated: ((msg: MeetChatPayload) => void) | null = null

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

  /** Room tayyor bo‘lguncha kutish (claim → room race uchun) */
  private async waitForRoom(roomId: string, attempts = 12): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      const snap = await get(ref(this.db, `rooms/${roomId}`))
      if (snap.exists()) return true
      await sleep(150 + i * 50)
    }
    return false
  }

  private async claimPartner(otherId: string, other: WaitingEntry): Promise<boolean> {
    if (this.matched || this.claiming || this.roomId || this.joining) return false
    if (!shouldClaimOther(otherId, other.ts || 0, this.uid, this.myWaitTs)) return false

    this.claiming = true
    const roomId = newRoomId()
    try {
      // Avval room — partner claimedBy ni ko‘rganda presence yozishi mumkin bo‘lsin
      await set(ref(this.db, `rooms/${roomId}`), {
        a: this.uid,
        b: otherId,
        aName: this.name,
        bName: other.name,
        createdAt: Date.now(),
        status: 'active',
      })

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
      if (!result.committed || !val || val.claimedBy !== this.uid || val.roomId !== roomId) {
        await remove(ref(this.db, `rooms/${roomId}`)).catch(() => {})
        return false
      }

      this.matched = true
      await remove(ref(this.db, `waiting/${this.uid}`)).catch(() => {})
      await this.enterRoom(roomId, { id: otherId, name: other.name }, true)
      return true
    } catch {
      await remove(ref(this.db, `rooms/${roomId}`)).catch(() => {})
      this.matched = false
      return false
    } finally {
      this.claiming = false
    }
  }

  private async scanAndClaim(): Promise<boolean> {
    if (this.matched || this.roomId) return false
    const waitingSnap = await get(ref(this.db, 'waiting'))
    const all = (waitingSnap.val() || {}) as Record<string, WaitingEntry>
    const candidates = Object.entries(all)
      .filter(([id, v]) => id !== this.uid && v && !v.claimedBy && typeof v.name === 'string')
      .sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0))

    for (const [otherId, other] of candidates) {
      if (await this.claimPartner(otherId, other)) return true
    }
    return false
  }

  private async acceptClaim(v: WaitingEntry) {
    if (this.matched || this.roomId || this.joining) return
    if (!v.claimedBy || !v.roomId) return

    this.joining = true
    this.matched = true
    const roomId = v.roomId
    const partner: MeetPartner = {
      id: v.claimedBy,
      name: String(v.claimerName || 'User').slice(0, 40),
    }

    try {
      await this.clearDisconnect()
      await remove(ref(this.db, `waiting/${this.uid}`)).catch(() => {})

      const ready = await this.waitForRoom(roomId)
      if (!ready) throw new Error('room-not-ready')

      await this.enterRoom(roomId, partner, false)
    } catch {
      this.matched = false
      this.joining = false
      this.roomId = null
      // Qayta navbatga
      void this.find().catch(() => {})
    } finally {
      this.joining = false
    }
  }

  async find() {
    await this.leaveRoomLocal(false)
    await this.leaveQueue()
    this.clearListeners()
    await this.clearDisconnect()
    this.matched = false
    this.claiming = false
    this.joining = false
    this.myWaitTs = null

    if (await this.scanAndClaim()) return

    const myTs = Date.now()
    this.myWaitTs = myTs
    const myRef = ref(this.db, `waiting/${this.uid}`)
    await set(myRef, { name: this.name, ts: myTs })
    const disc = onDisconnect(myRef)
    await disc.remove()
    this.disconnectOps.push(disc)

    this.onSearching?.()

    this.track(
      onValue(myRef, (snap) => {
        if (this.matched || this.roomId || this.joining) return
        const v = snap.val() as WaitingEntry | null
        if (!v?.claimedBy || !v.roomId) return
        void this.acceptClaim(v)
      }),
    )

    this.track(
      onChildAdded(ref(this.db, 'waiting'), (snap) => {
        if (this.matched || this.roomId || this.joining) return
        const otherId = snap.key
        if (!otherId || otherId === this.uid) return
        const other = snap.val() as WaitingEntry | null
        if (!other || other.claimedBy || typeof other.name !== 'string') return
        void this.claimPartner(otherId, other)
      }),
    )

    if (await this.scanAndClaim()) return
  }

  private async enterRoom(roomId: string, partner: MeetPartner, initiator: boolean) {
    this.clearListeners()
    await this.clearDisconnect()
    this.roomId = roomId
    this.myWaitTs = null

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
    const mapChat = (snap: { key: string | null; val: () => unknown }): MeetChatPayload | null => {
      const id = snap.key
      const v = snap.val() as Omit<MeetChatPayload, 'id' | 'echo'> | null
      if (!id || !v || typeof v.from !== 'string') return null
      return {
        ...v,
        id,
        echo: v.from === this.uid,
      }
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

  async editChat(messageId: string, text: string) {
    if (!this.roomId || !messageId) return false
    const msgRef = ref(this.db, `rooms/${this.roomId}/chat/${messageId}`)
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
    this.matched = false
    this.joining = false
    this.myWaitTs = null
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
