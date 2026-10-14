import { sanitizeText, safeDisplay } from '~/utils/sanitize'
import { isValidStickerId, stickerEmoji, type StickerId } from '~/utils/stickers'
import { PrivateMeetSession, type JoinRequest } from '~/utils/privateMeetRtdb'
import { waitForFirebaseUser } from '~/utils/firebase.client'

export type PrivateChatMessage = {
  id: string
  text: string
  fromMe: boolean
  time: string
  system?: boolean
  stickerId?: StickerId
  stickerEmoji?: string
  edited?: boolean
}

type Partner = { id: string; name: string }

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

function nowTime(locale: string) {
  const loc = locale === 'ru' ? 'ru-RU' : locale === 'en' ? 'en-US' : 'uz-UZ'
  return new Date().toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
}

export function usePrivateMeet() {
  const { user } = useAuth()
  const toast = useToast()
  const { t, locale } = useI18n()

  const status = ref<
    'idle' | 'creating' | 'hosting' | 'requesting' | 'waiting_approval' | 'connecting' | 'in_call' | 'error'
  >('idle')
  const meetCode = ref('')
  const meetLink = ref('')
  const partner = ref<Partner | null>(null)
  const requests = ref<JoinRequest[]>([])
  const hostName = ref('')
  const messages = ref<PrivateChatMessage[]>([])
  const error = ref('')
  const micOn = ref(true)
  const camOn = ref(true)
  const chatOpen = ref(true)

  const localVideo = ref<HTMLVideoElement | null>(null)
  const remoteVideo = ref<HTMLVideoElement | null>(null)

  let session: PrivateMeetSession | null = null
  let pc: RTCPeerConnection | null = null
  let localStream: MediaStream | null = null
  let isInitiator = false

  function fail(msg: string) {
    error.value = msg
    status.value = 'error'
    toast.error(msg)
  }

  function pushSystem(text: string) {
    messages.value.push({
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: safeDisplay(text),
      fromMe: false,
      time: nowTime(locale.value),
      system: true,
    })
  }

  function attachLocal() {
    if (localVideo.value && localStream) {
      localVideo.value.srcObject = localStream
      localVideo.value.muted = true
      void localVideo.value.play().catch(() => {})
    }
  }

  function attachRemote(stream: MediaStream) {
    if (remoteVideo.value) {
      remoteVideo.value.srcObject = stream
      void remoteVideo.value.play().catch(() => {})
    }
  }

  async function ensureMedia() {
    if (localStream) return localStream
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    })
    attachLocal()
    return localStream
  }

  function teardownPc() {
    if (pc) {
      pc.onicecandidate = null
      pc.ontrack = null
      pc.onconnectionstatechange = null
      pc.close()
      pc = null
    }
    if (remoteVideo.value) remoteVideo.value.srcObject = null
  }

  async function createPc() {
    teardownPc()
    pc = new RTCPeerConnection(ICE)
    const stream = await ensureMedia()
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream)
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && session) {
        void session.sendSignal({ candidate: e.candidate.toJSON() })
      }
    }

    pc.ontrack = (e) => {
      const [stream] = e.streams
      if (stream) attachRemote(stream)
    }

    pc.onconnectionstatechange = () => {
      if (pc?.connectionState === 'failed') {
        pushSystem(t('connectionLost'))
      }
    }

    return pc
  }

  async function handleSignal(data: Record<string, unknown>) {
    if (!pc) await createPc()
    if (!pc) return

    if (data.offer) {
      await pc.setRemoteDescription(data.offer as RTCSessionDescriptionInit)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await session?.sendSignal({ answer })
    } else if (data.answer) {
      await pc.setRemoteDescription(data.answer as RTCSessionDescriptionInit)
    } else if (data.candidate) {
      try {
        await pc.addIceCandidate(data.candidate as RTCIceCandidateInit)
      } catch {
        // ignore
      }
    }
  }

  async function startAsInitiator() {
    await createPc()
    if (!pc) return
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await session?.sendSignal({ offer })
  }

  function buildLink(code: string) {
    if (!import.meta.client) return `/meet/${code}`
    return `${window.location.origin}/meet/${code}`
  }

  function bindSession(s: PrivateMeetSession) {
    s.onRequest = (r) => {
      if (requests.value.some((x) => x.uid === r.uid)) return
      requests.value = [...requests.value, r]
      toast.info(t('joinRequestFrom', { name: safeDisplay(r.name) }))
    }
    s.onRequestRemoved = (uid) => {
      requests.value = requests.value.filter((x) => x.uid !== uid)
    }
    s.onApproved = (info) => {
      status.value = 'in_call'
      partner.value = {
        id: info.partner.id,
        name: safeDisplay(info.partner.name),
      }
      isInitiator = info.initiator
      messages.value = []
      pushSystem(t('matched', { name: partner.value.name }))
      void (async () => {
        try {
          await ensureMedia()
          if (isInitiator) await startAsInitiator()
          else await createPc()
        } catch {
          fail(t('mediaNeeded'))
        }
      })()
    }
    s.onPartnerLeft = () => {
      teardownPc()
      partner.value = null
      if (status.value === 'in_call') {
        status.value = 'hosting'
        requests.value = []
        pushSystem(t('partnerLeftPrivate'))
        void s.resumeHosting()
      }
    }
    s.onSignal = (data) => {
      void handleSignal(data)
    }
    s.onChat = (msg) => {
      if (msg.stickerId) {
        if (!isValidStickerId(msg.stickerId)) return
        const emoji = stickerEmoji(msg.stickerId)
        if (!emoji) return
        messages.value.push({
          id: msg.id,
          text: emoji,
          stickerId: msg.stickerId,
          stickerEmoji: emoji,
          fromMe: Boolean(msg.echo),
          time: nowTime(locale.value),
        })
        return
      }
      const text = safeDisplay(String(msg.text || ''))
      if (!text) return
      messages.value.push({
        id: msg.id,
        text,
        fromMe: Boolean(msg.echo),
        time: nowTime(locale.value),
        edited: Boolean(msg.editedAt),
      })
    }

    s.onChatUpdated = (msg) => {
      if (msg.stickerId) return
      const text = safeDisplay(String(msg.text || ''))
      if (!text) return
      const idx = messages.value.findIndex((m) => m.id === msg.id)
      if (idx < 0) return
      const prev = messages.value[idx]!
      messages.value[idx] = {
        ...prev,
        text,
        edited: true,
      }
    }
    s.onClosed = () => {
      if (status.value === 'waiting_approval' || status.value === 'requesting') {
        fail(t('meetClosed'))
      }
    }
  }

  async function createMeet() {
    status.value = 'creating'
    error.value = ''
    requests.value = []
    partner.value = null
    messages.value = []
    try {
      await ensureMedia()
      const fbUser = await waitForFirebaseUser()
      const displayName = String(user.value?.name || fbUser.displayName || 'User').slice(0, 40)
      const s = new PrivateMeetSession(fbUser.uid, displayName)
      bindSession(s)
      session = s
      const { code } = await s.create()
      meetCode.value = code
      meetLink.value = buildLink(code)
      status.value = 'hosting'
      pushSystem(t('privateMeetCreated'))
    } catch (e) {
      session = null
      fail(
        e instanceof Error && e.name === 'NotAllowedError'
          ? t('mediaNeeded')
          : e instanceof Error
            ? e.message.slice(0, 120)
            : t('meetCreateFailed'),
      )
    }
  }

  async function joinMeet(code: string) {
    status.value = 'requesting'
    error.value = ''
    partner.value = null
    messages.value = []
    try {
      await ensureMedia()
      const fbUser = await waitForFirebaseUser()
      const displayName = String(user.value?.name || fbUser.displayName || 'User').slice(0, 40)
      const s = new PrivateMeetSession(fbUser.uid, displayName)
      bindSession(s)
      session = s
      const info = await s.requestJoin(code)
      hostName.value = safeDisplay(info.hostName)
      meetCode.value = code.trim().toLowerCase()
      meetLink.value = buildLink(meetCode.value)
      if (status.value !== 'in_call') {
        status.value = 'waiting_approval'
      }
    } catch (e) {
      session = null
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'invalid-code') fail(t('invalidMeetCode'))
      else if (msg === 'not-found') fail(t('meetNotFound'))
      else if (msg === 'closed') fail(t('meetClosed'))
      else if (msg === 'self') fail(t('meetSelfJoin'))
      else if (e instanceof Error && e.name === 'NotAllowedError') fail(t('mediaNeeded'))
      else fail(msg.slice(0, 120) || t('meetJoinFailed'))
    }
  }

  async function approveRequest(uid: string) {
    const r = requests.value.find((x) => x.uid === uid)
    if (!r || !session) return
    try {
      await session.approve(r.uid, r.name)
      requests.value = requests.value.filter((x) => x.uid !== uid)
    } catch {
      toast.error(t('approveFailed'))
    }
  }

  async function rejectRequest(uid: string) {
    if (!session) return
    await session.reject(uid)
    requests.value = requests.value.filter((x) => x.uid !== uid)
  }

  function sendChat(text: string) {
    const clean = sanitizeText(text, 500)
    if (!clean || !session) return false
    if (status.value !== 'in_call') return false
    void session.sendChat(clean)
    return true
  }

  async function editChat(messageId: string, text: string) {
    const clean = sanitizeText(text, 500)
    if (!clean || !session || !messageId) return false
    if (status.value !== 'in_call') return false
    const msg = messages.value.find((m) => m.id === messageId)
    if (!msg || !msg.fromMe || msg.system || msg.stickerId) return false
    try {
      return await session.editChat(messageId, clean)
    } catch {
      toast.error(t('editFailed'))
      return false
    }
  }

  function sendSticker(stickerId: StickerId) {
    if (!isValidStickerId(stickerId)) return false
    if (!session) return false
    if (status.value !== 'in_call') return false
    void session.sendSticker(stickerId)
    return true
  }

  function toggleMic() {
    micOn.value = !micOn.value
    localStream?.getAudioTracks().forEach((tr) => {
      tr.enabled = micOn.value
    })
  }

  function toggleCam() {
    camOn.value = !camOn.value
    localStream?.getVideoTracks().forEach((tr) => {
      tr.enabled = camOn.value
    })
  }

  async function hangUp() {
    await session?.leave()
    session = null
    teardownPc()
    partner.value = null
    requests.value = []
    meetCode.value = ''
    meetLink.value = ''
    status.value = 'idle'
    localStream?.getTracks().forEach((tr) => tr.stop())
    localStream = null
    if (localVideo.value) localVideo.value.srcObject = null
  }

  function setVideoEls(local: HTMLVideoElement | null, remote: HTMLVideoElement | null) {
    localVideo.value = local
    remoteVideo.value = remote
    attachLocal()
    if (remote?.srcObject) void remote.play().catch(() => {})
  }

  async function copyLink() {
    if (!meetLink.value) return
    try {
      await navigator.clipboard.writeText(meetLink.value)
      toast.info(t('linkCopied'))
    } catch {
      toast.error(t('copyFailed'))
    }
  }

  onBeforeUnmount(() => {
    void hangUp()
  })

  return {
    status,
    meetCode,
    meetLink,
    partner,
    requests,
    hostName,
    messages,
    error,
    micOn,
    camOn,
    chatOpen,
    createMeet,
    joinMeet,
    approveRequest,
    rejectRequest,
    sendChat,
    editChat,
    sendSticker,
    toggleMic,
    toggleCam,
    hangUp,
    setVideoEls,
    copyLink,
  }
}
