/**
 * Flowbit's sound voices, synthesised with Web Audio (no files).
 *
 * Signal path: voice bus -> soft low-pass -> master (-6 dB) -> limiter -> out,
 * with an optional send into a tiny room made from a generated impulse. Every
 * play nudges pitch and level a little so repeats never sound machine-stamped.
 */

import { dbToGain, jitter, type SoundName } from './sound-gate'

/** Raised 18 dB on 9 Oct 2026: at -24 dB the owner could not hear the sounds. The limiter still catches peaks. */
const MASTER_DB = -6
const TONE_LOWPASS_HZ = 7800
const ROOM_SECONDS = 0.9
const ROOM_DECAY = 5
const ROOM_PREDELAY_S = 0.008
const NOISE_SECONDS = 1
const PITCH_SPREAD = 0.012
const LEVEL_SPREAD = 0.08
const LEAD_IN_S = 0.006
const SILENT = 0.0001

export type Graph = Readonly<{ ctx: AudioContext; dry: AudioNode; room: AudioNode; noise: AudioBuffer }>

export type PlayOptions = Readonly<{ on?: boolean }>

/** Builds the shared output chain once per AudioContext. */
export function createGraph(ctx: AudioContext): Graph {
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -6
  limiter.knee.value = 6
  limiter.ratio.value = 12
  limiter.attack.value = 0.002
  limiter.release.value = 0.12
  limiter.connect(ctx.destination)

  const master = ctx.createGain()
  master.gain.value = dbToGain(MASTER_DB)
  master.connect(limiter)

  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = TONE_LOWPASS_HZ
  tone.Q.value = 0.5
  tone.connect(master)

  const room = ctx.createConvolver()
  room.buffer = roomImpulse(ctx)
  room.connect(tone)

  return { ctx, dry: tone, room, noise: noiseBuffer(ctx) }
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  return buffer
}

/** A short, dark stereo room: decaying noise, pre-delayed and smoothed. */
function roomImpulse(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate
  const length = Math.floor(rate * ROOM_SECONDS)
  const predelay = Math.floor(rate * ROOM_PREDELAY_S)
  const buffer = ctx.createBuffer(2, length, rate)
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel)
    let smooth = 0
    for (let i = predelay; i < length; i += 1) {
      const t = (i - predelay) / rate
      smooth += 0.35 * (Math.random() * 2 - 1 - smooth)
      data[i] = smooth * Math.exp(-t * ROOM_DECAY)
    }
  }
  return buffer
}

/** One play: a bus with a jittered level, a start time and a pitch factor. */
type Voice = Readonly<{ ctx: AudioContext; bus: AudioNode; t0: number; pitch: number; noise: AudioBuffer }>

function openVoice(graph: Graph, send: number, seconds: number): Voice {
  const { ctx } = graph
  const bus = ctx.createGain()
  bus.gain.value = jitter(Math.random(), LEVEL_SPREAD)
  bus.connect(graph.dry)
  if (send > 0) {
    const wet = ctx.createGain()
    wet.gain.value = send
    bus.connect(wet)
    wet.connect(graph.room)
    window.setTimeout(() => wet.disconnect(), (seconds + ROOM_SECONDS + 0.2) * 1000)
  }
  window.setTimeout(() => bus.disconnect(), (seconds + ROOM_SECONDS + 0.2) * 1000)
  return { ctx, bus, t0: ctx.currentTime + LEAD_IN_S, pitch: jitter(Math.random(), PITCH_SPREAD), noise: graph.noise }
}

type Tone = Readonly<{
  f: number
  gain: number
  decay: number
  at?: number
  attack?: number
  type?: OscillatorType
  /** Start pitch as a ratio of f; settles to f over `settle` seconds. */
  from?: number
  settle?: number
}>

/** A single oscillator with a fast attack and a natural exponential decay. */
function partial(v: Voice, p: Tone): void {
  const start = v.t0 + (p.at ?? 0)
  const attack = p.attack ?? 0.002
  const end = start + attack + p.decay
  const freq = p.f * v.pitch
  const osc = v.ctx.createOscillator()
  osc.type = p.type ?? 'sine'
  osc.frequency.setValueAtTime(freq * (p.from ?? 1), start)
  if (p.from) osc.frequency.exponentialRampToValueAtTime(freq, start + (p.settle ?? 0.02))
  const env = v.ctx.createGain()
  env.gain.setValueAtTime(0, start)
  env.gain.linearRampToValueAtTime(p.gain, start + attack)
  env.gain.exponentialRampToValueAtTime(SILENT, end)
  osc.connect(env)
  env.connect(v.bus)
  osc.onended = () => env.disconnect()
  osc.start(start)
  osc.stop(end + 0.03)
}

type Breath = Readonly<{
  len: number
  gain: number
  filter: BiquadFilterType
  freq: number
  toFreq?: number
  q?: number
  at?: number
  attack?: number
  /** Seconds to the peak when the burst swells instead of snapping. */
  peak?: number
  pan?: readonly [number, number]
}>

/** A burst of filtered noise: ticks, air and breath. */
function breath(v: Voice, b: Breath): void {
  const start = v.t0 + (b.at ?? 0)
  const end = start + b.len
  const src = v.ctx.createBufferSource()
  src.buffer = v.noise
  const filter = v.ctx.createBiquadFilter()
  filter.type = b.filter
  filter.Q.value = b.q ?? 0.7
  filter.frequency.setValueAtTime(b.freq * v.pitch, start)
  if (b.toFreq) filter.frequency.exponentialRampToValueAtTime(b.toFreq * v.pitch, start + b.len * 0.7)
  const env = v.ctx.createGain()
  const peakAt = start + (b.peak ?? b.attack ?? 0.001)
  env.gain.setValueAtTime(0, start)
  env.gain.linearRampToValueAtTime(b.gain, peakAt)
  env.gain.exponentialRampToValueAtTime(SILENT, end)
  src.connect(filter)
  filter.connect(env)
  const last = panned(v, env, b.pan, start, end)
  last.connect(v.bus)
  src.onended = () => last.disconnect()
  const offset = Math.random() * Math.max(0, NOISE_SECONDS - b.len - 0.01)
  src.start(start, offset, b.len + 0.01)
}

function panned(v: Voice, node: AudioNode, pan: Breath['pan'], start: number, end: number): AudioNode {
  if (!pan || typeof v.ctx.createStereoPanner !== 'function') return node
  const panner = v.ctx.createStereoPanner()
  panner.pan.setValueAtTime(pan[0], start)
  panner.pan.linearRampToValueAtTime(pan[1], end)
  node.connect(panner)
  return panner
}

/** A soft, dry tick (~15 ms). */
function click(v: Voice): void {
  breath(v, { len: 0.015, gain: 0.9, filter: 'bandpass', freq: 3400, q: 1.2, attack: 0.0008 })
  partial(v, { f: 2050, gain: 0.1, decay: 0.012, attack: 0.0008 })
}

/** One "tok": a pitched body with a quick pitch settle plus a tiny transient. */
function tok(v: Voice, at: number, f: number, level: number): void {
  partial(v, { at, f, gain: 0.34 * level, decay: 0.045, attack: 0.001, from: 1.6, settle: 0.006 })
  partial(v, { at, f: f * 2.4, gain: 0.05 * level, decay: 0.018, attack: 0.001 })
  breath(v, { at, len: 0.008, gain: 0.35 * level, filter: 'bandpass', freq: 2600, q: 1.4 })
}

/** Two-stage tok. On rises, off falls and sits lower. */
function toggle(v: Voice, on: boolean): void {
  const [first, second] = on ? [620, 860] : [560, 410]
  tok(v, 0, first, 0.75)
  tok(v, 0.032, second, 1)
}

/** A glassy, airy open for menus and dialogs. */
function pop(v: Voice): void {
  partial(v, { f: 880, gain: 0.26, decay: 0.11, attack: 0.003, from: 0.64, settle: 0.045 })
  partial(v, { f: 880 * 2.76, gain: 0.045, decay: 0.06, attack: 0.003, from: 0.64, settle: 0.045 })
  breath(v, { len: 0.08, gain: 0.07, filter: 'highpass', freq: 3200, peak: 0.012 })
}

/** One warm note: sine body, a soft octave and a quiet triangle for colour. */
function warmNote(v: Voice, at: number, f: number, decay: number): void {
  partial(v, { at, f, gain: 0.22, decay, attack: 0.004 })
  partial(v, { at, f: f * 2, gain: 0.04, decay: decay * 0.5, attack: 0.004 })
  partial(v, { at, f, gain: 0.03, decay: decay * 0.7, attack: 0.004, type: 'triangle' })
}

/** A warm two-note rise, under 350 ms. */
function success(v: Voice): void {
  warmNote(v, 0, 587.33, 0.15)
  warmNote(v, 0.075, 783.99, 0.25)
}

/** One muted knock: a low thud with a little wood on top. */
function knock(v: Voice, at: number, f: number, level: number): void {
  partial(v, { at, f, gain: 0.5 * level, decay: 0.085, attack: 0.0015, from: 1.5, settle: 0.018 })
  partial(v, { at, f: f * 2.3, gain: 0.08 * level, decay: 0.03, attack: 0.0015 })
  breath(v, { at, len: 0.03, gain: 0.3 * level, filter: 'lowpass', freq: 700, q: 0.8 })
}

/** A muted, low double knock. */
function error(v: Voice): void {
  knock(v, 0, 196, 1)
  knock(v, 0.105, 165, 0.8)
}

/** Glass bell partials: ratio, level, decay (s). */
const BELL: readonly (readonly [number, number, number])[] = [
  [1, 0.2, 1.5],
  [1.003, 0.07, 1.2],
  [2.76, 0.05, 0.6],
  [5.4, 0.02, 0.3],
  [8.93, 0.008, 0.15],
]

/** A soft glass bell with a long, quiet tail. */
function notify(v: Voice): void {
  for (const [ratio, gain, decay] of BELL) partial(v, { f: 987.77 * ratio, gain, decay, attack: 0.004 })
}

/** A filtered-noise air sweep for page-level moments. */
function whoosh(v: Voice): void {
  breath(v, { len: 0.5, gain: 0.5, filter: 'bandpass', freq: 320, toFreq: 1900, q: 0.9, peak: 0.17, pan: [-0.35, 0.35] })
  breath(v, { len: 0.42, gain: 0.08, filter: 'highpass', freq: 4200, peak: 0.2, at: 0.03 })
}

/** Room send and rough length (s) per sound. */
const SHAPE: Readonly<Record<SoundName, readonly [number, number]>> = {
  click: [0, 0.03],
  toggle: [0.06, 0.1],
  pop: [0.22, 0.15],
  success: [0.3, 0.35],
  error: [0.08, 0.22],
  notify: [0.45, 1.6],
  whoosh: [0.2, 0.55],
}

/** Renders one sound into the graph. */
export function render(graph: Graph, name: SoundName, opts: PlayOptions = {}): void {
  const [send, seconds] = SHAPE[name]
  const v = openVoice(graph, send, seconds)
  switch (name) {
    case 'click': return click(v)
    case 'toggle': return toggle(v, opts.on ?? true)
    case 'pop': return pop(v)
    case 'success': return success(v)
    case 'error': return error(v)
    case 'notify': return notify(v)
    case 'whoosh': return whoosh(v)
  }
}
