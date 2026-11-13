/**
 * 背景音乐（BGM）
 * ————————————————————————————————————————————————
 * 这里就是「以后添加 BGM 的地方」。两种加法：
 *
 * 1) 真实音频文件（mp3 / ogg / m4a）
 *    ① 把文件放进 `public/bgm/`，例如 `public/bgm/rally.mp3`
 *    ② 在下面的 BGM_TRACKS 里加一条：
 *       { id: 'rally', title: '激战', sub: '比赛进行中', kind: 'file', src: '/bgm/rally.mp3', volume: 0.6 }
 *    → 菜单里的「背景音乐」会自动多出一个选项，无需改任何 UI 代码。
 *
 * 2) 内置合成曲（kind: 'synth'）
 *    不需要任何音频资源，用 WebAudio 实时生成，随便加。
 *
 * 注意：浏览器要求「用户交互之后」才能出声，所以真正的播放发生在第一次点击之后。
 */

export interface BgmTrack {
  id: string;
  title: string;
  /** 一句话说明，显示在菜单里 */
  sub: string;
  kind: 'synth' | 'file';
  /** kind === 'file' 时必填：public 下的绝对路径，如 '/bgm/rally.mp3' */
  src?: string;
  /** 0~1，该曲的相对音量 */
  volume?: number;
  /** kind === 'synth' 时的速度 */
  bpm?: number;
  /** kind === 'synth' 时的风格 */
  mood?: 'calm' | 'match';
}

export const BGM_TRACKS: BgmTrack[] = [
  { id: 'calm', title: '练习场', sub: '内置合成 · 轻松', kind: 'synth', mood: 'calm', bpm: 88, volume: 0.5 },
  { id: 'match', title: '决胜局', sub: '内置合成 · 紧凑', kind: 'synth', mood: 'match', bpm: 132, volume: 0.5 },
  // —— 以后加真实音乐，照这个格式追加一条即可 ——
  // { id: 'my-theme', title: '我的主题曲', sub: '自定义 · mp3', kind: 'file', src: '/bgm/my-theme.mp3', volume: 0.6 },
];

const STORE_KEY = 'badminton.bgm';

const trackById = (id: string | null) => (id ? BGM_TRACKS.find((t) => t.id === id) ?? null : null);

/* ————————————————— 内置合成曲 ————————————————— */

/** Am - F - C - G，四小节循环 */
const CHORDS: number[][] = [
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [261.63, 329.63, 392.0],
  [196.0, 246.94, 293.66],
];
const ARP = [0, 1, 2, 1, 2, 0, 1, 2];
const STEP_COUNT = 32;

class SynthLoop {
  private timer: number | null = null;
  private next = 0;
  private step = 0;
  private spb: number;
  private noise: AudioBuffer | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: GainNode,
    bpm: number,
    private readonly mood: 'calm' | 'match',
  ) {
    this.spb = 60 / bpm / 2; // 八分音符
  }

  start() {
    if (this.timer !== null) return;
    this.next = this.ctx.currentTime + 0.08;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 80);
    this.schedule();
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** 提前 0.35s 排程，避免 setInterval 抖动 */
  private schedule() {
    const horizon = this.ctx.currentTime + 0.35;
    while (this.next < horizon) {
      this.emit(this.step, this.next);
      this.next += this.spb;
      this.step = (this.step + 1) % STEP_COUNT;
    }
  }

  private emit(i: number, t: number) {
    const chord = CHORDS[Math.floor(i / 8) % CHORDS.length];
    const match = this.mood === 'match';

    // 琶音 / 主旋律
    const f = chord[ARP[i % 8]] * (match ? 2 : 2);
    this.tone(f, 0.32, t, match ? 0.05 : 0.06, 'triangle');
    if (i % 4 === 2) this.tone(f * 1.5, 0.22, t, 0.03, 'sine');

    // 贝斯
    if (i % 8 === 0 || (match && i % 8 === 6)) {
      this.pluck(chord[0] / 2, 0.7, t, match ? 0.2 : 0.16);
    }

    // 柔和铺垫
    if (i % 8 === 0) {
      for (const n of chord) this.tone(n, match ? 1.1 : 1.8, t, match ? 0.018 : 0.028, 'sine');
    }

    if (match) {
      if (i % 4 === 0) this.kick(t);
      if (i % 8 === 4) this.snare(t);
      if (i % 2 === 1) this.hat(t, 0.028);
    } else if (i % 8 === 4) {
      this.hat(t, 0.014);
    }
  }

  private tone(freq: number, dur: number, t: number, vol: number, type: OscillatorType) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pluck(freq: number, dur: number, t: number, vol: number) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.16);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.26);
  }

  private snare(t: number) {
    this.hit(t, 1700, 0.1, 0.09);
  }

  private hat(t: number, vol: number) {
    this.hit(t, 7200, 0.035, vol);
  }

  private hit(t: number, freq: number, dur: number, vol: number) {
    if (!this.noise) {
      const len = Math.floor(this.ctx.sampleRate * 0.25);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.1);
    src.stop(t + dur + 0.02);
  }
}

/* ————————————————— 播放器 ————————————————— */

class BgmPlayer {
  /** 可选的曲目表（菜单会自动渲染） */
  readonly tracks = BGM_TRACKS;
  /** 音乐总音量 0~1 */
  volume = 0.6;
  muted = false;
  currentId: string | null = null;

  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private synth: SynthLoop | null = null;
  private el: HTMLAudioElement | null = null;
  private elSource: MediaElementAudioSourceNode | null = null;
  private started = false;
  private listeners = new Set<() => void>();

  constructor() {
    this.currentId = this.load();
  }

  /* — 接入音效引擎的 AudioContext，让静音/总音量统一管理 — */
  attach(ctx: AudioContext, out: GainNode) {
    if (this.ctx === ctx) return;
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.muted ? 0 : this.volume;
    this.bus.connect(out);
    if (this.currentId && !this.started && !this.muted) this.start();
  }

  get current(): BgmTrack | null {
    return trackById(this.currentId);
  }

  /** 订阅状态变化（React 用） */
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.bus && !this.muted) this.bus.gain.value = this.volume;
    if (this.el) this.el.volume = this.muted ? 0 : this.volume * (this.current?.volume ?? 1);
    this.notify();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.bus) this.bus.gain.value = m ? 0 : this.volume;
    if (this.el) this.el.volume = m ? 0 : this.volume * (this.current?.volume ?? 1);
    // 静音期间选过曲目的话，取消静音时补上播放
    if (!m && this.currentId && !this.started && this.ctx) this.start();
    this.notify();
  }

  /** 选择曲目；传 null 表示关闭音乐 */
  play(id: string | null) {
    this.currentId = id;
    this.save();
    this.stopSound();
    this.started = false;
    if (id && this.ctx && !this.muted) this.start();
    this.notify();
  }

  /** 第一次用户交互后调用：把之前选好但因为浏览器策略没能播放的曲子接上 */
  resume() {
    if (!this.currentId || this.muted || this.started) return;
    if (this.ctx) this.start();
  }

  private start() {
    const track = this.current;
    if (!track) return;
    this.started = true;
    if (track.kind === 'file' && track.src) this.startFile(track);
    else this.startSynth(track);
  }

  private startSynth(track: BgmTrack) {
    if (!this.ctx || !this.bus) return;
    const loop = new SynthLoop(this.ctx, this.bus, track.bpm ?? 100, track.mood ?? 'calm');
    loop.start();
    this.synth = loop;
  }

  private startFile(track: BgmTrack) {
    if (!this.ctx || !this.bus || !track.src) return;
    if (!this.el) {
      this.el = new Audio();
      this.el.loop = true;
      this.el.preload = 'auto';
    }
    if (!this.elSource) {
      try {
        this.elSource = this.ctx.createMediaElementSource(this.el);
        this.elSource.connect(this.bus);
      } catch {
        /* 某些浏览器不支持，退化为直接播放 */
      }
    }
    if (!this.elSource) this.el.volume = this.muted ? 0 : this.volume * (track.volume ?? 1);
    if (this.el.src !== new URL(track.src, location.href).href) this.el.src = track.src;
    void this.el.play().catch(() => {
      this.started = false;
    });
  }

  private stopSound() {
    this.synth?.stop();
    this.synth = null;
    if (this.el) {
      this.el.pause();
      this.el.currentTime = 0;
    }
  }

  private load(): string | null {
    try {
      const v = localStorage.getItem(STORE_KEY);
      return v && (v === 'off' ? null : trackById(v) ? v : 'calm');
    } catch {
      return 'calm';
    }
  }

  private save() {
    try {
      localStorage.setItem(STORE_KEY, this.currentId ?? 'off');
    } catch {
      /* 隐私模式下忽略 */
    }
  }
}

export const bgm = new BgmPlayer();
