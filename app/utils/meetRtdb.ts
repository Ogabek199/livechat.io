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

/** Yangiroq kutuvchi eskiroqni claim qiladi — ikkala tomon bir-birini claim qilmasin */
function shouldClaimOther(otherId: string, otherTs: number, myId: string, myTs: number | null) {
  if (myTs == null) return true
  if (otherTs < myTs) return true
  if (otherTs > myTs) return false
  return otherId < myId
}

export class MeetRtdbSession {
  private db: Database
  private uid: string
  private name: string
  private roomId: string | null = null
  private myWaitTs: number | null = null
  private matched = false
  private claiming = false
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

  private async claimPartner(otherId: string, other: WaitingEntry): Promise<boolean> {
    if (this.matched || this.claiming || this.roomId) return false
    if (!shouldClaimOther(otherId, other.ts || 0, this.uid, this.myWaitTs)) return false

    this.claiming = true
    try {
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
      if (!result.committed || !val || val.claimedBy !== this.uid || !val.roomId) return false

      this.matched = true
      await set(ref(this.db, `rooms/${val.roomId}`), {
        a: this.uid,
        b: otherId,
        aName: this.name,
        bName: other.name,
        createdAt: Date.now(),
        status: 'active',
      })

      await remove(ref(this.db, `waiting/${this.uid}`)).catch(() => {})
      await this.enterRoom(val.roomId, { id: otherId, name: other.name }, true)
      return true
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

  async find() {
    await this.leaveRoomLocal(false)
    await this.leaveQueue()
    this.clearListeners()
    await this.clearDisconnect()
    this.matched = false
    this.claiming = false
    this.myWaitTs = null

    // Avval navbatdagi birovni claim qilishga urinish
    if (await this.scanAndClaim()) return

    const myTs = Date.now()
    this.myWaitTs = myTs
    const myRef = ref(this.db, `waiting/${this.uid}`)
    await set(myRef, { name: this.name, ts: myTs })
    const disc = onDisconnect(myRef)
    await disc.remove()
    this.disconnectOps.push(disc)

    this.onSearching?.()

    // Meni claim qilishdi
    this.track(
      onValue(myRef, async (snap) => {
        if (this.matched || this.roomId) return
        const v = snap.val() as WaitingEntry | null
        if (!v?.claimedBy || !v.roomId) return
        this.matched = true
        const partner: MeetPartner = {
          id: v.claimedBy,
          name: String(v.claimerName || 'User').slice(0, 40),
        }
        await remove(myRef).catch(() => {})
        await this.enterRoom(v.roomId, partner, false)
      }),
    )

    // Boshqa kutuvchi paydo bo‘lsa — claim (ikki user bir vaqtda kirganda race uchun)
    this.track(
      onChildAdded(ref(this.db, 'waiting'), (snap) => {
        if (this.matched || this.roomId) return
        const otherId = snap.key
        if (!otherId || otherId === this.uid) return
        const other = snap.val() as WaitingEntry | null
        if (!other || other.claimedBy || typeof other.name !== 'string') return
        void this.claimPartner(otherId, other)
      }),
    )

    // get() va set() orasidagi race: yana bir marta skan
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
    this.matched = false
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
