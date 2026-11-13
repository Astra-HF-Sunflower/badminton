import { bgm } from './bgm';
import type { ShotId } from './shots';

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  to?: number;
  delay?: number;
  attack?: number;
}
interface NoiseOpts {
  type?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
  vol?: number;
  delay?: number;
}

/** 全部音效由 WebAudio 实时合成，无需任何音频资源 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  muted = false;

  /** 必须在用户手势之后调用 */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // 背景音乐共用同一套 AudioContext / 总音量
    bgm.attach(this.ctx, this.master);
  }

  /** 供 BGM 等模块复用的音频上下文（未初始化时为 null） */
  get context() {
    return this.ctx;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.value = m ? 0 : 0.9;
    bgm.setMuted(m);
  }

  private tone(freq: number, dur: number, o: ToneOpts = {}) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + dur);
    const vol = o.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, o: NoiseOpts = {}) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 2000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const vol = o.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** 挥拍破风声：越用力越尖锐 */
  swing(id: ShotId, duration: number) {
    const base: Record<ShotId, [number, number, number]> = {
      clear: [500, 1500, 0.1],
      smash: [400, 2600, 0.2],
      drop: [600, 1000, 0.05],
      drive: [800, 3000, 0.15],
      lift: [400, 1100, 0.08],
      net: [900, 1300, 0.035],
      flick: [1500, 4200, 0.12],
      jumpSmash: [300, 2800, 0.24],
      cut: [1800, 800, 0.13],
    };
    const [a, b, v] = base[id];
    this.noise(duration * 0.5, { freq: a, to: b, q: 1.4, vol: v, delay: duration * 0.08 });
  }

  hit(id: ShotId, perfect: boolean, poor: boolean) {
    const k = poor ? 0.6 : 1;
    switch (id) {
      case 'clear':
        this.noise(0.09, { freq: 2200, q: 0.9, vol: 0.5 * k });
        this.tone(430, 0.12, { to: 190, vol: 0.4 * k });
        this.tone(900, 0.2, { to: 1500, vol: 0.06, type: 'triangle' });
        break;
      case 'smash':
        this.noise(0.1, { freq: 3500, q: 0.7, vol: 0.8 * k });
        this.tone(170, 0.28, { to: 45, vol: 0.7 * k, type: 'triangle' });
        this.tone(1900, 0.06, { to: 400, vol: 0.25 * k, type: 'square' });
        break;
      case 'drop':
        this.noise(0.04, { freq: 1500, q: 1, vol: 0.28 * k });
        this.tone(720, 0.08, { to: 420, vol: 0.3 * k });
        this.tone(1400, 0.12, { to: 1800, vol: 0.05, delay: 0.03 });
        break;
      case 'drive':
        this.noise(0.07, { freq: 4200, q: 0.6, vol: 0.7 * k });
        this.tone(950, 0.09, { to: 300, vol: 0.35 * k, type: 'sawtooth' });
        break;
      case 'lift':
        this.noise(0.06, { freq: 1800, q: 1, vol: 0.4 * k });
        this.tone(280, 0.22, { to: 760, vol: 0.32 * k });
        this.tone(560, 0.22, { to: 1520, vol: 0.08, type: 'triangle' });
        break;
      case 'net':
        this.noise(0.025, { freq: 5000, q: 2, vol: 0.2 * k });
        this.tone(1400, 0.05, { to: 1050, vol: 0.2 * k, type: 'triangle' });
        this.tone(2100, 0.08, { to: 1700, vol: 0.05, delay: 0.02 });
        break;
      case 'flick':
        this.noise(0.14, { type: 'highpass', freq: 3000, to: 7500, q: 0.8, vol: 0.45 * k });
        this.tone(1250, 0.07, { to: 2600, vol: 0.2 * k, type: 'square' });
        this.tone(2600, 0.14, { to: 3600, vol: 0.05, delay: 0.03 });
        break;
      case 'jumpSmash':
        this.noise(0.13, { freq: 3200, q: 0.6, vol: 0.9 * k });
        this.tone(130, 0.5, { to: 32, vol: 0.9 * k, type: 'triangle' });
        this.tone(240, 0.22, { to: 60, vol: 0.4 * k, type: 'sawtooth' });
        this.noise(0.5, { type: 'lowpass', freq: 1800, to: 120, q: 0.5, vol: 0.55 * k, delay: 0.03 });
        break;
      case 'cut':
        this.noise(0.12, { freq: 3000, to: 900, q: 1.3, vol: 0.55 * k });
        this.tone(650, 0.1, { to: 250, vol: 0.3 * k, type: 'triangle' });
        this.tone(1750, 0.06, { to: 1100, vol: 0.12 * k, type: 'square', delay: 0.01 });
        break;
    }
    if (perfect) {
      this.tone(1568, 0.16, { vol: 0.14, delay: 0.04, type: 'triangle' });
      this.tone(2093, 0.22, { vol: 0.12, delay: 0.1, type: 'triangle' });
      this.tone(2637, 0.3, { vol: 0.08, delay: 0.16, type: 'sine' });
    }
  }

  /** 发球 */
  serve() {
    this.noise(0.05, { freq: 1800, q: 1, vol: 0.3 });
    this.tone(520, 0.1, { to: 300, vol: 0.28 });
  }

  whiff() {
    this.noise(0.12, { freq: 900, to: 400, q: 0.8, vol: 0.06 });
  }

  net() {
    this.noise(0.18, { type: 'lowpass', freq: 900, to: 200, vol: 0.5 });
    this.tone(180, 0.16, { to: 90, vol: 0.3, type: 'triangle' });
    this.tone(1800, 0.2, { to: 1200, vol: 0.05, type: 'triangle', delay: 0.02 });
  }

  land(power: number) {
    this.tone(260, 0.09, { to: 130, vol: 0.2 + power * 0.1, type: 'triangle' });
    this.noise(0.05, { freq: 900, q: 1, vol: 0.12 });
  }

  jump() {
    this.tone(220, 0.14, { to: 420, vol: 0.12, type: 'triangle' });
    this.noise(0.08, { freq: 600, q: 1, vol: 0.05 });
  }

  step() {
    this.noise(0.035, { freq: 700 + Math.random() * 300, q: 1.2, vol: 0.06 });
  }

  click() {
    this.tone(880, 0.06, { to: 1320, vol: 0.12, type: 'triangle' });
  }

  /** 得分音：分值越高，音阶越丰富 */
  point(points: number) {
    const scale = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    const n = Math.min(5, 1 + points);
    for (let i = 0; i < n; i++) {
      this.tone(scale[i], 0.28, { vol: 0.16, delay: i * 0.075, type: 'triangle' });
      this.tone(scale[i] * 2, 0.2, { vol: 0.04, delay: i * 0.075 });
    }
  }

  fault() {
    this.tone(330, 0.2, { to: 220, vol: 0.18, type: 'triangle' });
    this.tone(247, 0.3, { to: 165, vol: 0.18, type: 'triangle', delay: 0.14 });
  }

  win() {
    [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this.tone(f, 0.4, { vol: 0.2, delay: i * 0.12, type: 'triangle' });
      this.tone(f / 2, 0.4, { vol: 0.12, delay: i * 0.12, type: 'sine' });
    });
  }
}

export const sfx = new AudioEngine();
