import { sanitizeText, safeDisplay } from '~/utils/sanitize'
import { isValidStickerId, stickerEmoji, type StickerId } from '~/utils/stickers'
import { MeetRtdbSession } from '~/utils/meetRtdb'
import { waitForFirebaseUser } from '~/utils/firebase.client'

export type ChatMessage = {
  id: string
  text: string
  fromMe: boolean
  time: string
  system?: boolean
  stickerId?: StickerId
  stickerEmoji?: string
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

export function useMeet() {
  const { user } = useAuth()
  const toast = useToast()
  const { t, locale } = useI18n()

  const status = ref<'idle' | 'connecting' | 'searching' | 'in_call' | 'error'>('idle')
  const partner = ref<Partner | null>(null)
  const messages = ref<ChatMessage[]>([])
  const error = ref('')
  const micOn = ref(true)
  const camOn = ref(true)
  // Default ochiq — user "Yopish" bosmaguncha
  const chatOpen = ref(true)

  function fail(msg: string) {
    error.value = msg
    status.value = 'error'
    toast.error(msg)
  }

  const localVideo = ref<HTMLVideoElement | null>(null)
  const remoteVideo = ref<HTMLVideoElement | null>(null)

  let session: MeetRtdbSession | null = null
  let pc: RTCPeerConnection | null = null
  let localStream: MediaStream | null = null
  let isInitiator = false
  let connecting = false

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

  function bindSession(s: MeetRtdbSession) {
    s.onSearching = () => {
      status.value = 'searching'
      partner.value = null
    }

    s.onMatched = (m) => {
      status.value = 'in_call'
      partner.value = {
        id: m.partner.id,
        name: safeDisplay(m.partner.name),
      }
      isInitiator = m.initiator
      messages.value = []
      pushSystem(t('matched', { name: partner.value.name }))
      void (async () => {
        try {
          await ensureMedia()
          if (isInitiator) await startAsInitiator()
          else await createPc()
        } catch {
          fail('Kamera/mikrofon ruxsati kerak')
        }
      })()
    }

    s.onPartnerLeft = () => {
      teardownPc()
      partner.value = null
      status.value = 'searching'
      pushSystem(t('partnerLeft'))
      void s.find().catch(() => fail('Ulanish xatosi'))
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
          id: `s_${msg.ts}_${Math.random().toString(36).slice(2, 6)}`,
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
        id: `m_${msg.ts}_${Math.random().toString(36).slice(2, 6)}`,
        text,
        fromMe: Boolean(msg.echo),
        time: nowTime(locale.value),
      })
    }
  }

  async function connect() {
    if (session || connecting) return
    connecting = true
    status.value = 'connecting'
    error.value = ''
    try {
      await ensureMedia()
      const fbUser = await waitForFirebaseUser()
      const displayName = String(user.value?.name || fbUser.displayName || 'User').slice(0, 40)
      const s = new MeetRtdbSession(fbUser.uid, displayName)
      bindSession(s)
      session = s
      status.value = 'searching'
      await s.find()
    } catch (e) {
      session = null
      fail(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Kamera va mikrofon ruxsatini bering'
          : e instanceof Error && e.message
            ? e.message.slice(0, 120)
            : 'Media yoki tarmoq xatosi',
      )
    } finally {
      connecting = false
    }
  }

  function sendChat(text: string) {
    const clean = sanitizeText(text, 500)
    if (!clean || !session) return false
    if (status.value !== 'in_call') return false
    void session.sendChat(clean)
    return true
  }

  function sendSticker(stickerId: StickerId) {
    if (!isValidStickerId(stickerId)) return false
    if (!session) return false
    if (status.value !== 'in_call') return false
    void session.sendSticker(stickerId)
    return true
  }

  function nextPartner() {
    teardownPc()
    partner.value = null
    messages.value = []
    status.value = 'searching'
    void session?.next().catch(() => fail('Ulanish xatosi'))
  }

  function toggleMic() {
    micOn.value = !micOn.value
    localStream?.getAudioTracks().forEach((t) => {
      t.enabled = micOn.value
    })
  }

  function toggleCam() {
    camOn.value = !camOn.value
    localStream?.getVideoTracks().forEach((t) => {
      t.enabled = camOn.value
    })
  }

  function hangUp() {
    void session?.dispose()
    session = null
    teardownPc()
    partner.value = null
    status.value = 'idle'
    localStream?.getTracks().forEach((t) => t.stop())
    localStream = null
    if (localVideo.value) localVideo.value.srcObject = null
  }

  function setVideoEls(local: HTMLVideoElement | null, remote: HTMLVideoElement | null) {
    localVideo.value = local
    remoteVideo.value = remote
    attachLocal()
    if (remote?.srcObject) void remote.play().catch(() => {})
  }

  onBeforeUnmount(() => {
    hangUp()
  })

  return {
    status,
    partner,
    messages,
    error,
    micOn,
    camOn,
    chatOpen,
    localVideo,
    remoteVideo,
    connect,
    sendChat,
    sendSticker,
    nextPartner,
    toggleMic,
    toggleCam,
    hangUp,
    setVideoEls,
    attachLocal,
  }
}
