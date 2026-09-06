'use client'

let audioContext: AudioContext | null = null

function getAudioContext() {
  if (audioContext) return audioContext
  const AudioContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) throw new Error('Web Audio is unavailable')
  audioContext = new AudioContextClass()
  return audioContext
}

function playTone(frequency: number, startsAt: number, duration: number, volume: number) {
  try {
    const context = getAudioContext()
    void context.resume()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, startsAt)
    gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(startsAt)
    oscillator.stop(startsAt + duration + 0.02)
  } catch {
    // Audio can remain locked until the first user interaction on some mobile browsers.
  }
}

export function unlockNotificationAudio() {
  try {
    void getAudioContext().resume()
  } catch {
    // Unsupported browsers still receive visual and system notifications.
  }
}

export function playMessageTone() {
  if (typeof window === 'undefined') return
  try {
    const context = getAudioContext()
    const now = context.currentTime
    playTone(740, now, 0.1, 0.12)
    playTone(988, now + 0.11, 0.16, 0.1)
    navigator.vibrate?.(120)
  } catch {
    navigator.vibrate?.(120)
  }
}

export function startIncomingCallAlert() {
  if (typeof window === 'undefined') return () => undefined

  let stopped = false
  const ring = () => {
    if (stopped) return
    try {
      const context = getAudioContext()
      const now = context.currentTime
      playTone(440, now, 0.45, 0.16)
      playTone(554, now + 0.48, 0.45, 0.16)
      playTone(659, now + 0.96, 0.5, 0.14)
    } catch {
      // Vibration remains available when Web Audio is unsupported or locked.
    }
    navigator.vibrate?.([700, 300, 700])
  }

  ring()
  const intervalId = window.setInterval(ring, 2_400)
  return () => {
    stopped = true
    window.clearInterval(intervalId)
    navigator.vibrate?.(0)
  }
}
