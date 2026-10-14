import type { Peer } from 'crossws'
import { newRoomId } from './session'

export type PeerMeta = {
  userId: string
  name: string
  peer: Peer
  roomId: string | null
}

type Room = {
  id: string
  a: string
  b: string
}

const peers = new Map<string, PeerMeta>()
const waiting: string[] = []
const rooms = new Map<string, Room>()

export function registerPeer(userId: string, name: string, peer: Peer) {
  // Bitta userId uchun eski peerni yopish
  const prev = peers.get(userId)
  if (prev && prev.peer !== peer) {
    leaveQueue(userId)
    leaveRoom(userId)
  }
  peers.set(userId, { userId, name, peer, roomId: null })
}

export function unregisterPeer(userId: string) {
  leaveQueue(userId)
  leaveRoom(userId)
  peers.delete(userId)
}

export function getPeer(userId: string) {
  return peers.get(userId)
}

export function leaveQueue(userId: string) {
  const i = waiting.indexOf(userId)
  if (i >= 0) waiting.splice(i, 1)
}

export function enqueue(userId: string): { matched: false } | { matched: true; roomId: string; partnerId: string; partnerName: string } {
  leaveQueue(userId)
  leaveRoom(userId)

  const self = peers.get(userId)
  if (!self) return { matched: false }

  while (waiting.length) {
    const otherId = waiting.shift()!
    if (otherId === userId) continue
    const other = peers.get(otherId)
    if (!other || other.roomId) continue

    const roomId = newRoomId()
    rooms.set(roomId, { id: roomId, a: userId, b: otherId })
    self.roomId = roomId
    other.roomId = roomId
    return {
      matched: true,
      roomId,
      partnerId: otherId,
      partnerName: other.name,
    }
  }

  waiting.push(userId)
  return { matched: false }
}

export function leaveRoom(userId: string): string | null {
  const self = peers.get(userId)
  if (!self?.roomId) return null
  const room = rooms.get(self.roomId)
  const roomId = self.roomId
  self.roomId = null
  if (!room) return roomId

  const partnerId = room.a === userId ? room.b : room.a
  const partner = peers.get(partnerId)
  if (partner) partner.roomId = null
  rooms.delete(roomId)
  return partnerId
}

export function partnerOf(userId: string): PeerMeta | null {
  const self = peers.get(userId)
  if (!self?.roomId) return null
  const room = rooms.get(self.roomId)
  if (!room) return null
  const partnerId = room.a === userId ? room.b : room.a
  return peers.get(partnerId) || null
}

export function sendTo(userId: string, data: unknown) {
  const p = peers.get(userId)
  if (!p) return
  try {
    p.peer.send(JSON.stringify(data))
  } catch {
    // ignore
  }
}
