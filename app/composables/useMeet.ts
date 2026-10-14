import { sanitizeText, safeDisplay } from '~/utils/sanitize'
import { isValidStickerId, stickerEmoji, type StickerId } from '~/utils/stickers'

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
  const { getWsToken } = useAuth()
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

  let ws: WebSocket | null = null
  let pc: RTCPeerConnection | null = null
  let localStream: MediaStream | null = null
  let isInitiator = false

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
      if (e.candidate && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'signal', data: { candidate: e.candidate } }))
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
      ws?.send(JSON.stringify({ type: 'signal', data: { answer } }))
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
    ws?.send(JSON.stringify({ type: 'signal', data: { offer } }))
  }

  function onWsMessage(ev: MessageEvent) {
    let raw: Record<string, unknown>
    try {
      raw = JSON.parse(String(ev.data))
    } catch {
      return
    }

    const type = String(raw.type || '')

    switch (type) {
      case 'ready':
        status.value = 'searching'
        ws?.send(JSON.stringify({ type: 'find' }))
        break
      case 'searching':
        status.value = 'searching'
        partner.value = null
        break
      case 'matched': {
        status.value = 'in_call'
        const p = raw.partner as Partner
        partner.value = { id: String(p.id), name: safeDisplay(String(p.name)) }
        isInitiator = Boolean(raw.initiator)
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
        break
      }
      case 'partner_left':
        teardownPc()
        partner.value = null
        status.value = 'searching'
        pushSystem(t('partnerLeft'))
        ws?.send(JSON.stringify({ type: 'find' }))
        break
      case 'chat': {
        const text = safeDisplay(String(raw.text || ''))
        if (!text) break
        messages.value.push({
          id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          text,
          fromMe: Boolean(raw.echo),
          time: nowTime(locale.value),
        })
        break
      }
      case 'sticker': {
        const sid = String(raw.stickerId || '')
        if (!isValidStickerId(sid)) break
        const emoji = stickerEmoji(sid)
        if (!emoji) break
        messages.value.push({
          id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          text: emoji,
          stickerId: sid,
          stickerEmoji: emoji,
          fromMe: Boolean(raw.echo),
          time: nowTime(locale.value),
        })
        break
      }
      case 'signal':
        if (raw.data && typeof raw.data === 'object') {
          void handleSignal(raw.data as Record<string, unknown>)
        }
        break
      case 'error':
        if (raw.code === 'unauthorized') {
          fail('Sessiya tugagan. Qayta kiring.')
        } else if (raw.code === 'rate_limited') {
          toast.error('Rate limit')
        }
        break
      default:
        break
    }
  }

  async function connect() {
    if (ws) return
    status.value = 'connecting'
    error.value = ''
    try {
      await ensureMedia()
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      let wsUrl = `${proto}//${location.host}/ws`
      try {
        const token = await getWsToken()
        wsUrl += `?t=${encodeURIComponent(token)}`
      } catch {
        // cookie-only
      }
      ws = new WebSocket(wsUrl)
      ws.onmessage = onWsMessage
      ws.onclose = () => {
        ws = null
        if (status.value !== 'error') status.value = 'idle'
      }
      ws.onerror = () => {
        fail('Ulanish xatosi')
      }
    } catch (e) {
      fail(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Kamera va mikrofon ruxsatini bering'
          : 'Media yoki tarmoq xatosi',
      )
    }
  }

  function sendChat(text: string) {
    const clean = sanitizeText(text, 500)
    if (!clean || !ws || ws.readyState !== WebSocket.OPEN) return false
    if (status.value !== 'in_call') return false
    ws.send(JSON.stringify({ type: 'chat', text: clean }))
    return true
  }

  function sendSticker(stickerId: StickerId) {
    if (!isValidStickerId(stickerId)) return false
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    if (status.value !== 'in_call') return false
    ws.send(JSON.stringify({ type: 'sticker', stickerId }))
    return true
  }

  function nextPartner() {
    teardownPc()
    partner.value = null
    messages.value = []
    status.value = 'searching'
    ws?.send(JSON.stringify({ type: 'next' }))
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
    ws?.send(JSON.stringify({ type: 'leave' }))
    teardownPc()
    partner.value = null
    status.value = 'idle'
    if (ws) {
      ws.close()
      ws = null
    }
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
