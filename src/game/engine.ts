import { AIController, DIFFICULTY_LABEL, Difficulty, Phase } from './ai';
import {
  CATCH_KEYS, CRESCENT_GRAVITIES, CharacterId, HEAVEN_LEVELS, SKILL_KEYS, SkillState, characterOf,
} from './characters';
import { GROUND, NET_TOP, NET_X, PLAYER, SHUTTLE_R, Side, WRAP_L, WRAP_R, WRAP_SPAN, clamp, opponent, rand, sideSign } from './constants';
import { CourtDef, CourtSize, courtHomeX, courtOf } from './court';
import { Fx } from './fx';
import { Input, Keymap, p1Keys, p2Keys, soloKeys } from './input';
import { landingX, setGravityScale, solveBlast, solveShot, stepBody } from './physics';
import { Intent, Player, ServeKind, Swing } from './player';
import { Banner, LandingMark, Scene, drawScene } from './render/scene';
import { sfx } from './audio';
import { PlayStyle, SERVES, SHOT_BY_ID, ShotDef, ShotId, playStyleOf, serveShortShots, shotsFor } from './shots';
import { createShuttle, Shuttle } from './shuttle';

export type Mode = 'single' | 'double';

/** 接球：球必须落在手掌这么近的范围里 */
const CATCH_R = 38;
/** 超级反弹期间的速度上限（再高就只是在屏幕上闪了） */
const REBOUND_MAX = 12000;
/** 超级反弹出手时先压一下，留出「越弹越快」的空间 */
const REBOUND_LAUNCH = 6200;

export type { SkillState };

export interface GameOptions {
  mode: Mode;
  /** 双方角色 */
  characters: [CharacterId, CharacterId];
  /** 普通模式（4 种基础击球）/ 专业模式（9 种进阶击球）/ 恶搞模式（暴走三招） */
  style: PlayStyle;
  /** 场地大小：小 / 中 / 大 */
  court: CourtSize;
  difficulty: Difficulty;
  target: number;
}

export interface GameStatus {
  phase: 'playing' | 'paused' | 'over';
  winner: Side | null;
  score: [number, number];
  names: [string, string];
  style: PlayStyle;
  styleLabel: string;
  courtLabel: string;
  skill: string;
}

interface Pressed {
  shot: ShotId | null;
  jump: boolean;
  skill: boolean;
  catch: boolean;
}

const MAX_SUBSTEP = 1 / 120;
const POINT_DELAY = 2.1;

/** 游戏主循环：输入 → 物理 → 判定 → 特效 → 渲染 */
export class Game implements Scene {
  time = 0;
  readonly mode: Mode;
  readonly style: PlayStyle;
  readonly styleLabel: string;
  readonly court: CourtDef;
  readonly courtLabel: string;
  /** 双方默认站位（随场地宽度变化） */
  readonly homeX: [number, number];
  /** 双方各类击球的出手次数，用于头顶的「招式占比」 */
  readonly usage: [Map<ShotId, number>, Map<ShotId, number>] = [new Map(), new Map()];
  /** 双方招式冷却（秒） */
  readonly cooldown: [Map<ShotId, number>, Map<ShotId, number>] = [new Map(), new Map()];
  readonly characters: [CharacterId, CharacterId];
  readonly skills: [SkillState, SkillState] = [
    { active: 0, cooldown: 0, accum: 0, level: HEAVEN_LEVELS[0] },
    { active: 0, cooldown: 0, accum: 0, level: HEAVEN_LEVELS[0] },
  ];
  /** 时间停止：发动者与已持续秒数 */
  timeStop: { side: Side; t: number; total: number } | null = null;
  /** 当前重力系数（1 = 正常） */
  gravity = 1;
  /** 本玩法模式下可用的击球（HUD / 触屏按钮据此渲染） */
  readonly shots: ShotDef[];
  readonly difficultyLabel: string;
  phase: Phase = 'serve';
  readonly players: [Player, Player];
  readonly humanSides: [boolean, boolean];
  readonly shuttle: Shuttle = createShuttle();
  readonly fx = new Fx();
  score: [number, number] = [0, 0];
  scorePop: [number, number] = [0, 0];
  readonly target: number;
  server: Side = 0;
  rally = 0;
  banner: Banner | null = null;
  netSway = 0;
  /** 失重时球网的漂浮偏移 */
  netLift = 0;
  excite = 0;
  marks: LandingMark[] = [];
  used = new Map<string, number>();

  private netVel = 0;
  private readonly input = new Input();
  private readonly keymaps: [Keymap, Keymap | null];
  private readonly ai: AIController | null;
  private raf = 0;
  private last = 0;
  private cw = 0;
  private ch = 0;
  private dpr = 1;
  private paused = false;
  private over = false;
  private winner: Side | null = null;
  private hitStop = 0;
  private slowTimer = 0;
  private timeScale = 1;
  private pointTimer = 0;
  private fxTick = 0;
  private netTouched = false;
  private chargeMaxed = false;
  private maxedBonus = 0;
  private catchLock: [number, number] = [0, 0];
  /** 超级反弹的「歪一下」计时 */
  private chaosTurn = 0;
  /** 当前蓄力档位（0~4） */
  private chargeStage = 0;
  private readonly baseSpeedMul: [number, number] = [1, 1];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    opts: GameOptions,
    private readonly onStatus: (s: GameStatus) => void,
  ) {
    this.mode = opts.mode;
    this.style = opts.style;
    this.styleLabel = playStyleOf(opts.style).label;
    this.shots = shotsFor(opts.style);
    this.court = courtOf(opts.court);
    this.courtLabel = this.court.label;
    this.homeX = [courtHomeX(this.court, 0), courtHomeX(this.court, 1)];
    this.target = opts.target;
    this.difficultyLabel = DIFFICULTY_LABEL[opts.difficulty];
    const single = opts.mode === 'single';
    this.humanSides = [true, !single];
    // 角色技能是恶搞模式专属
    this.characters = opts.style === 'meme' ? opts.characters ?? ['none', 'none'] : ['none', 'none'];
    this.players = [
      new Player(0, single ? '你' : 'P1', '#38bdf8', this.homeX[0], this.court),
      new Player(1, single ? '电脑' : 'P2', '#fb7185', this.homeX[1], this.court),
    ];
    this.keymaps = single ? [soloKeys(opts.style), null] : [p1Keys(opts.style), p2Keys(opts.style)];
    this.ai = single ? new AIController(opts.difficulty, opts.style) : null;
    if (this.ai) this.players[1].speedMul = this.ai.speedMul;
    this.baseSpeedMul = [this.players[0].speedMul, this.players[1].speedMul];

    this.input.onSystemKey = () => this.togglePause();
    this.input.attach();
    window.addEventListener('resize', this.resize);
    window.addEventListener('blur', this.onBlur);
    this.resize();
    this.startServe();
    this.emit();
    sfx.init();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ————————————————— 生命周期 —————————————————

  destroy() {
    setGravityScale(1);
    cancelAnimationFrame(this.raf);
    this.input.detach();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('blur', this.onBlur);
  }

  /** 触屏虚拟键 */
  virtualKey(code: string, down: boolean) {
    this.input.setDown(code, down);
  }

  togglePause() {
    this.setPaused(!this.paused);
  }

  setPaused(p: boolean) {
    if (this.over) return;
    this.paused = p;
    this.last = performance.now();
    this.emit();
  }

  private onBlur = () => {
    if (!this.over) this.setPaused(true);
  };

  private resize = () => {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = this.canvas.clientWidth;
    this.ch = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
  };

  private emit() {
    this.onStatus({
      phase: this.over ? 'over' : this.paused ? 'paused' : 'playing',
      winner: this.winner,
      score: [...this.score],
      names: [this.players[0].name, this.players[1].name],
      style: this.style,
      styleLabel: this.styleLabel,
      courtLabel: this.courtLabel,
      skill: characterOf(this.characters[0]).skill,
    });
  }

  // ————————————————— 主循环 —————————————————

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const real = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) this.advance(real);
    const ctx = this.canvas.getContext('2d');
    if (ctx) drawScene(ctx, this, this.cw, this.ch, this.dpr);
  };

  private advance(real: number) {
    if (this.hitStop > 0) {
      this.hitStop -= real;
      return;
    }
    // 慢动作：击中重球时短暂降速再平滑恢复
    if (this.slowTimer > 0) {
      this.slowTimer -= real;
      this.timeScale += (0.28 - this.timeScale) * Math.min(1, real * 30);
    } else this.timeScale += (1 - this.timeScale) * Math.min(1, real * 7);

    const dt = real * this.timeScale;
    const n = Math.max(1, Math.ceil(dt / MAX_SUBSTEP));
    const sub = dt / n;

    // 按键事件只在本帧第一个子步消耗
    const pressed: (Pressed | null)[] = this.keymaps.map((km, i) =>
      km
        ? {
            shot: this.input.takeShot(km),
            jump: this.input.takeJump(km),
            skill: this.input.take(SKILL_KEYS[i as Side]),
            catch: this.input.take(CATCH_KEYS[i as Side]),
          }
        : null,
    );
    this.input.endFrame();
    for (let i = 0; i < n; i++) this.step(sub, i === 0 ? pressed : [null, null]);
  }

  private step(dt: number, pressed: (Pressed | null)[]) {
    this.time += dt;
    const { players, shuttle: sh } = this;
    this.updateSkills(dt);

    // —— 技能 / 接球（只有人类玩家会按） ——
    for (const side of [0, 1] as Side[]) {
      if (!this.humanSides[side]) continue;
      const pr = pressed[side];
      if (pr?.skill) this.activateSkill(side);
      if (pr?.catch) this.tryCatch(side);
    }

    // 时间停止时，另一方完全冻住
    const frozenSide: Side | null = this.timeStop ? opponent(this.timeStop.side) : null;

    // —— 收集意图 ——
    const intents: Intent[] = [0, 1].map((i) => {
      const side = i as Side;
      const me = players[side];
      if (side === frozenSide) return { move: 0, jump: false, shot: null, charge: null };
      if (this.phase === 'point' || this.phase === 'over') return this.walkHome(me, this.phase === 'point' && this.pointTimer > 0.7);
      const km = this.keymaps[side];
      if (km && this.humanSides[side]) {
        const move = (this.input.isDown(km.right) ? 1 : 0) - (this.input.isDown(km.left) ? 1 : 0);
        const charge = this.chargeIntent(km);
        const rawShot = pressed[side]?.shot ?? null;
        // 蓄力球交给长按逻辑处理，不走「按一下立刻挥拍」
        const shot = charge && rawShot === charge.shot ? null : rawShot;
        return { move, jump: pressed[side]?.jump ?? false, shot, charge };
      }
      return this.ai!.decide(dt, me, players[opponent(side)], sh, this.phase, this.homeX[side], this.cooldown[side]);
    });

    // —— 球拍对准来球 ——
    for (const p of players) {
      const sw = p.swing;
      if (sw && !sw.done && this.phase !== 'point' && sh.lastHitter !== p.side) {
        const d = Math.hypot(sh.x - p.shoulder.x, sh.y - p.shoulder.y);
        if (d < 300) sw.aim = { x: sh.x, y: sh.y };
      }
    }

    // —— 玩家更新（被时间停止的一方跳过） ——
    for (const p of players) {
      if (p.side === frozenSide) continue;
      p.update(dt, intents[p.side], (id) => this.canSwing(p.side, id));
      this.handlePlayerEvents(p);
      this.chargeFx(p, dt);
    }

    // —— 球 ——
    if (this.phase === 'serve') this.holdShuttle(dt);
    else if (this.phase === 'rally' && !this.timeStop) this.stepShuttle(dt);
    else if (this.timeStop) this.timeStopFx(dt);
    this.checkHits();

    // —— 辅助动画 ——
    this.fx.update(dt);
    this.netVel += (-this.netSway * 220 - this.netVel * 5) * dt;
    this.netSway += this.netVel * dt;
    const floaty = this.gravity < 0.95 ? 1 - this.gravity : 0;
    const liftTarget = floaty > 0 ? Math.sin(this.time * 1.15) * (26 + floaty * 60) - 12 - floaty * 26 : 0;
    this.netLift += (liftTarget - this.netLift) * Math.min(1, dt * 3);
    this.excite = Math.max(0, this.excite - dt * 0.35);
    this.scorePop = [Math.max(0, this.scorePop[0] - dt * 2.6), Math.max(0, this.scorePop[1] - dt * 2.6)];
    for (const m of this.marks) m.age += dt;
    this.marks = this.marks.filter((m) => m.age < 1.6);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > 1.95) this.banner = null;
    }
    if (this.phase === 'point') this.updatePoint(dt);
  }

  /** 找出该键位表里「需要长按蓄力」的球 */
  private chargeIntent(km: Keymap) {
    for (const [key, id] of km.shots) {
      if (!SHOT_BY_ID[id].charge) continue;
      return { shot: id, held: this.input.held([key]) };
    }
    return null;
  }

  /** 技能 / 冷却 / 重力 / 时间流速 */
  private updateSkills(dt: number) {
    const sides: Side[] = [0, 1];
    for (const side of sides) {
      const m = this.cooldown[side];
      for (const [id, t] of [...m]) {
        const nt = t - dt;
        if (nt <= 0) m.delete(id);
        else m.set(id, nt);
      }
      if (this.catchLock[side] > 0) this.catchLock[side] = Math.max(0, this.catchLock[side] - dt);

      const st = this.skills[side];
      if (st.cooldown > 0) st.cooldown = Math.max(0, st.cooldown - dt);
      if (st.active > 0) {
        st.active = Math.max(0, st.active - dt);
        if (st.active === 0) this.endSkill(side);
      }
    }

    // 新月：低重力
    let g = 1;
    for (const side of sides) {
      if (this.characters[side] === 'crescent' && this.skills[side].active > 0) g = this.skills[side].level;
    }
    if (g !== this.gravity) {
      this.gravity = g;
      setGravityScale(g);
    }

    // 天堂制造：只加速本人（移动 + 挥拍动作）
    for (const side of sides) {
      const st = this.skills[side];
      const on = this.characters[side] === 'heaven' && st.active > 0;
      this.players[side].speedMul = this.baseSpeedMul[side] * (on ? st.level : 1);
      this.players[side].animSpeed = on ? st.level : 1;
    }

    if (this.timeStop) this.timeStop.t += dt;
  }

  /** 球的时间流速：只加速天堂制造本人打出去的球，对方来的球保持原速 */
  private timeFlow(): number {
    const side = this.shuttle.lastHitter;
    if (side === null) return 1;
    const st = this.skills[side];
    return this.characters[side] === 'heaven' && st.active > 0 ? st.level : 1;
  }

  /** 发动技能（天堂制造在持续期间再按一次切换倍率） */
  private activateSkill(side: Side) {
    const c = characterOf(this.characters[side]);
    const st = this.skills[side];
    const p = this.players[side];
    if (c.id === 'none') return;

    if (st.active > 0) {
      if (c.id === 'heaven') {
        st.level = HEAVEN_LEVELS[(HEAVEN_LEVELS.indexOf(st.level) + 1) % HEAVEN_LEVELS.length];
        this.fx.text(p.x, p.pose.head.y - 96, `×${st.level}`, c.color, 46, 1);
        this.fx.ring(p.x, GROUND - 100, c.color, 150, 0.5);
        sfx.skill();
      } else if (c.id === 'crescent') {
        // 自由操控重力：0 → 1 → 5 → 8 → 10 → 0 …
        const list = CRESCENT_GRAVITIES;
        st.level = list[(list.indexOf(st.level) + 1) % list.length];
        this.fx.text(p.x, p.pose.head.y - 96, `重力 ×${st.level}`, c.color, 34, 1.1);
        this.fx.ring(p.x, GROUND - 100, c.color, 150, 0.5);
        this.fx.flash = 0.6;
        this.fx.flashColor = '#67e8f9';
        sfx.skill();
      }
      return;
    }
    if (st.cooldown > 0 || this.phase === 'over') return;

    st.active = c.duration;
    st.cooldown = c.cooldown;
    st.accum = 0;
    if (c.id === 'crescent') st.level = (c.gravities ?? CRESCENT_GRAVITIES)[0];
    sfx.skill();
    this.fx.ring(p.x, GROUND - 100, c.color, 220, 0.7);
    this.fx.sparks(p.x, GROUND - 110, c.color, 26, 520, { angle: -Math.PI / 2, spread: 1.6 });
    this.fx.text(p.x, p.pose.head.y - 100, c.skill, c.color, 40, 1.2);
    this.excite = Math.min(1, this.excite + 0.3);

    if (c.id === 'crescent') {
      this.fx.text(p.x, p.pose.head.y - 60, `重力 ×${st.level} · 再按${side === 0 ? 'Q' : '右Shift'}切换`, '#67e8f9', 26, 1.4);
    }

    if (c.id === 'world') {
      this.timeStop = { side, t: 0, total: c.duration };
      this.shuttle.chaos = 0;
      this.fx.flash = 1;
      this.fx.flashColor = '#e9e4ff';
    }
  }

  /** 技能结束 */
  private endSkill(side: Side) {
    const c = characterOf(this.characters[side]);
    if (c.id === 'world' && this.timeStop?.side === side) {
      const accum = this.skills[side].accum;
      this.timeStop = null;
      this.launchTimeStopStrike(side, accum);
    }
  }

  /** 时间恢复的瞬间：把攒下的力量全部打出去 */
  private launchTimeStopStrike(side: Side, accum: number) {
    const sh = this.shuttle;
    const p = this.players[side];
    this.skills[side].accum = 0;
    if (this.phase !== 'rally' || sh.held !== null) return;

    const depth = rand(0.5, 0.95);
    const speed = 2800 + accum * 900;
    const v = solveShot({
      x: sh.x, y: sh.y, side, speed, targetX: landingX(side, depth, this.court), arc: 'flat', margin: 24,
    });
    sh.vx = v.vx;
    sh.vy = v.vy;
    sh.lastHitter = side;
    sh.lastShot = SHOT_BY_ID.thunderSmash;
    sh.perfect = accum >= 3;
    sh.poor = false;
    sh.chaos = 0;
    sh.angle = Math.atan2(v.vy, v.vx);
    this.timeStop = null;
    this.hitStop = 0.12;
    this.slowTimer = 0.5;
    this.excite = 1;
    this.fx.flash = 1;
    this.fx.flashColor = '#ffffff';
    this.fx.shake = Math.max(this.fx.shake, 26);
    this.fx.text(sh.x, sh.y - 90, '時間、動き出す！', '#a78bfa', 44, 1.6);
    this.fx.text(sh.x, sh.y - 40, accum > 0 ? `蓄力 ×${Math.max(1, accum)}` : '时停空挥', '#ffe27a', 26, 1);
    this.fx.sparks(sh.x, sh.y, '#a78bfa', 30, 700, { angle: -Math.PI / 2, spread: 1.8 });
    p.glow = 1;
    p.glowColor = '#a78bfa';
    sfx.hit('thunderSmash', true, false);
  }

  /** 接球：位置完美 + 球速合适才行 */
  private tryCatch(side: Side) {
    const p = this.players[side];
    const sh = this.shuttle;
    if (this.phase !== 'rally' || this.catchLock[side] > 0) return;
    // 只有球真的碰到手才算接住（头不行、身上也不行）
    const dHand = Math.min(
      Math.hypot(sh.x - p.pose.handL.x, sh.y - p.pose.handL.y),
      Math.hypot(sh.x - p.pose.handR.x, sh.y - p.pose.handR.y),
    );
    const speed = Math.hypot(sh.vx, sh.vy);
    const inMyHalf = (sh.x - NET_X) * p.facing < 0;
    const ok = sh.held === null && sh.lastHitter !== side && inMyHalf && sh.chaos === 0 && dHand <= CATCH_R && speed <= 2000;

    if (!ok) {
      this.catchLock[side] = 0.5;
      this.fx.text(p.x, p.pose.head.y - 46, 'MISS', '#94a3b8', 30, 0.9);
      sfx.whiff();
      return;
    }

    // 接住！变成自己的发球
    sh.vx = 0;
    sh.vy = 0;
    sh.spin = 0;
    sh.chaos = 0;
    sh.held = side;
    sh.lastShot = null;
    sh.perfect = false;
    sh.poor = false;
    sh.trail.length = 0;
    this.netTouched = false;
    this.server = side;
    this.phase = 'serve';
    this.rally = 0;
    p.swing = null;
    this.fx.ring(sh.x, sh.y, '#7cf7ff', 120, 0.6);
    this.fx.text(sh.x, sh.y - 60, '接住!', '#7cf7ff', 40, 1.2);
    this.fx.sparks(sh.x, sh.y, '#7cf7ff', 18, 380, { angle: 0, spread: 1.4 });
    this.excite = Math.min(1, this.excite + 0.3);
    sfx.catchBall();
  }

  /** 蓄力时的吸附光效 */
  private chargeFx(p: Player, dt: number) {
    if (!p.charge) {
      this.chargeMaxed = false;
      this.chargeStage = 0;
      return;
    }
    const r = p.chargeRatio;
    // 蓄力分档：每一档力度明显不同，越往上越离谱
    const stage = r >= 0.98 ? 4 : r >= 0.75 ? 3 : r >= 0.5 ? 2 : r >= 0.25 ? 1 : 0;
    if (stage > this.chargeStage && stage > 0) {
      this.chargeStage = stage;
      const labels = ['', '蓄力 25%', '蓄力 50%', '蓄力 75%', 'MAX 蓄力!'];
      const colors = ['', '#ffe9a8', '#ffcf4d', '#ffb01f', '#ffe27a'];
      this.fx.text(p.x, p.pose.head.y - 60 - stage * 10, labels[stage], colors[stage], 24 + stage * 6, 0.8);
      this.fx.ring(p.x, GROUND - 90, colors[stage], 60 + stage * 30, 0.35);
      if (stage === 4) sfx.chargeMax();
      else sfx.bounce();
    }
    p.glow = Math.max(p.glow, 0.35 + r * 0.65);
    p.glowColor = r >= 0.98 ? '#fff3b0' : '#ffd93d';
    if (Math.random() < r * 0.5 + 0.12) {
      const a = rand(0, Math.PI * 2);
      const rad = rand(40, 120) * (1 - r * 0.4);
      this.fx.sparks(p.x + Math.cos(a) * rad, GROUND - 60 + Math.sin(a) * rad * 0.6, '#ffd93d', 1, 180, { angle: -Math.PI / 2, spread: 0.7 });
    }
    if (r >= 0.98 && !this.chargeMaxed) {
      this.chargeMaxed = true;
      this.fx.text(p.x, p.pose.head.y - 60, 'MAX 蓄力!', '#ffe27a', 30, 0.9);
      this.fx.ring(p.x, GROUND - 90, '#ffd93d', 150, 0.5);
      sfx.chargeMax();
    }
    if (!p.charge) this.chargeMaxed = false;
    void dt;
  }

  /** 时间停止期间的余韵特效 */
  private timeStopFx(dt: number) {
    const ts = this.timeStop;
    if (!ts || Math.random() > dt * 26) return;
    const sh = this.shuttle;
    this.fx.sparks(sh.x, sh.y, '#a78bfa', 1, 120, { angle: -Math.PI / 2, spread: 0.6 });
  }

  private walkHome(p: Player, go: boolean): Intent {
    const dx = this.homeX[p.side] - p.x;
    return { move: go && Math.abs(dx) > 8 ? clamp(dx / 70, -0.7, 0.7) : 0, jump: false, shot: null };
  }

  private canSwing(side: Side, id: ShotId): ServeKind | null | false {
    if (this.phase === 'point' || this.phase === 'over') return false;
    if ((this.cooldown[side].get(id) ?? 0) > 0) return false; // 冷却中
    if (this.catchLock[side] > 0) return false;
    if (this.phase === 'serve') {
      if (this.shuttle.held !== side) return false;
      return serveShortShots(this.style).includes(id) ? 'short' : 'high';
    }
    return null;
  }

  private handlePlayerEvents(p: Player) {
    const e = p.events;
    if (e.jumped) {
      sfx.jump();
      this.fx.dust(p.x, 6, 0.7);
    }
    if (e.landed > 0) {
      sfx.land(clamp(e.landed / 1000, 0, 1));
      this.fx.dust(p.x, 8, 1);
    }
    if (e.step) {
      sfx.step();
      this.fx.dust(p.x - p.facing * 10, 1, 0.3, -p.facing);
    }
    if (e.swing) {
      const s: Swing = e.swing;
      sfx.swing(s.shot.id, s.dur);
      this.used.set(`${p.side}:${s.shot.id}`, this.time);
    }
  }

  // ————————————————— 球 —————————————————

  private startServe() {
    const sh = this.shuttle;
    this.phase = 'serve';
    this.rally = 0;
    this.netTouched = false;
    sh.held = this.server;
    sh.lastHitter = null;
    sh.lastShot = null;
    sh.perfect = false;
    sh.poor = false;
    sh.chaos = 0;
    sh.trail.length = 0;
    sh.vx = 0;
    sh.vy = 0;
    sh.spin = 0;
    for (const p of this.players) {
      if (Math.abs(p.x - this.homeX[p.side]) > 90) p.x = this.homeX[p.side];
      p.swing = null;
      p.buffered = null;
    }
    this.ai?.resetRally();
    this.holdShuttle(0);
    sh.angle = Math.PI / 2;
  }

  private holdShuttle(dt: number) {
    const sh = this.shuttle;
    sh.dragMul = 1;
    if (sh.held === null) return;
    const p = this.players[sh.held];
    sh.x = p.x + p.facing * 54;
    sh.y = GROUND - 118 - p.z;
    sh.angle += (Math.PI / 2 - sh.angle) * Math.min(1, dt * 12);
  }

  private stepShuttle(dt: number) {
    const sh = this.shuttle;
    const flow = this.timeFlow();
    // 球速可以飙到两万 px/s，一帧就能飞 300px：按位移切小步，免得穿网 / 穿地
    const travel = Math.hypot(sh.vx, sh.vy) * dt * flow;
    const steps = clamp(Math.ceil(travel / 26), 1, 32);
    for (let i = 0; i < steps; i++) {
      if (this.stepShuttleOnce(dt / steps, flow)) return;
    }
  }

  /** @returns 是否已经落地结算（后续小步不用再跑） */
  private stepShuttleOnce(dt: number, flow: number): boolean {
    const sh = this.shuttle;
    const px = sh.x;
    const py = sh.y;
    const jumped = sh.wrapped === true;
    sh.wrapped = false;
    stepBody(sh, dt * flow);
    this.wrapShuttle(jumped);

    // 角度：球头朝向飞行方向；击球后会先“翻转”一下
    const speed = Math.hypot(sh.vx, sh.vy);
    if (speed > 60) {
      const target = Math.atan2(sh.vy, sh.vx);
      let diff = target - sh.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      sh.angle += diff * Math.min(1, dt * 18);
    }
    sh.angle += sh.spin * dt;
    sh.spin *= Math.exp(-2.6 * dt);

    // 过网 / 触网（刚穿过空气墙的一步不算）
    if (!jumped && px < NET_X !== sh.x < NET_X) {
      const t = (NET_X - px) / (sh.x - px || 1);
      const yc = py + (sh.y - py) * t;
      const from = px < NET_X ? 1 : -1;
      if (yc > NET_TOP - 4) {
        const tape = yc < NET_TOP + 14 && Math.abs(sh.vx) > 160;
        sh.x = NET_X - from * 2;
        this.netVel += from * clamp(Math.abs(sh.vx) * 0.09, 20, 160);
        this.fx.sparks(NET_X, clamp(yc, NET_TOP, GROUND), '#ffffff', 10, 220, { angle: from > 0 ? Math.PI : 0, spread: 1.2 });
        this.fx.ring(NET_X, yc, '#ffffff', 40, 0.3);
        sfx.net();
        this.fx.shake = Math.max(this.fx.shake, 3);
        if (tape && Math.random() < 0.55) {
          sh.vx = from * Math.max(80, Math.abs(sh.vx) * 0.3);
          sh.vy = -rand(180, 300);
          sh.x = NET_X + from * 3;
          this.fx.text(NET_X, NET_TOP - 40, '擦网!', '#ffe27a', 34, 1);
        } else {
          sh.vx = -sh.vx * 0.15;
          sh.vy *= 0.3;
          this.netTouched = true;
          this.fx.text(NET_X, NET_TOP - 40, '触网', '#ff8a7a', 34, 0.9);
        }
      }
    }

    // 拖尾
    for (const t of sh.trail) t.age += dt;
    while (sh.trail.length && sh.trail[0].age > 0.34) sh.trail.shift();
    if (speed > 250) sh.trail.push({ x: sh.x, y: sh.y, age: 0 });
    while (sh.trail.length > 190) sh.trail.shift();
    this.fxTick += dt;
    if (this.fxTick > 0.018 && sh.lastShot && speed > 140) {
      this.fxTick = 0;
      this.fx.trail(sh.lastShot.fx, sh.lastShot.color, sh.x, sh.y, sh.vx, sh.vy);
    }

    // —— 超级反弹：3 秒内彻底无视物理法则 ——
    if (sh.chaos > 0) {
      sh.chaos = Math.max(0, sh.chaos - dt);
      sh.star = sh.chaos > 0;
      // 一路加速：不减速，反而越飞越快
      const grow = 1 + dt * 1.15;
      sh.vx *= grow;
      sh.vy *= grow;
      // 时不时歪一下，免得变成一条直线
      this.chaosTurn -= dt;
      if (this.chaosTurn <= 0) {
        this.chaosTurn = rand(0.06, 0.17);
        const ang = Math.atan2(sh.vy, sh.vx) + rand(-0.55, 0.55);
        const sp = Math.hypot(sh.vx, sh.vy);
        sh.vx = Math.cos(ang) * sp;
        sh.vy = Math.sin(ang) * sp;
        this.fx.sparks(sh.x, sh.y, '#7cf7ff', 3, 200, { spread: 1.4 });
      }
      if (sh.chaos === 0) {
        // 三秒到，物理法则回来了：开始正常减速，落地结算
        this.fx.text(sh.x, sh.y - 70, '物理法则回来了', '#7cf7ff', 30, 1.1);
        this.fx.ring(sh.x, sh.y, '#7cf7ff', 120, 0.5);
        sfx.bounce();
      }
      if (sh.y >= GROUND - SHUTTLE_R) {
        sh.y = GROUND - SHUTTLE_R;
        // 每弹一次不但不减速，反而更快、更歪
        sh.vy = -Math.max(Math.abs(sh.vy) * 1.07, 900);
        sh.vx = sh.vx * 1.07 + rand(-380, 380);
        const sp = Math.hypot(sh.vx, sh.vy);
        if (sp > REBOUND_MAX) {
          const k = REBOUND_MAX / sp;
          sh.vx *= k;
          sh.vy *= k;
        }
        this.fx.floorRing(sh.x, '#7cf7ff', 90);
        this.fx.sparks(sh.x, GROUND - 10, '#7cf7ff', 8, 320, { angle: -Math.PI / 2, spread: 1.5 });
        sfx.bounce();
        this.excite = Math.min(1, this.excite + 0.05);
        this.fx.shake = Math.max(this.fx.shake, 4);
      }
      if (sh.y < 90) {
        sh.y = 90;
        sh.vy = Math.abs(sh.vy) * 1.06;
        sh.vx *= 1.02;
        this.fx.sparks(sh.x, sh.y, '#7cf7ff', 6, 260, { angle: Math.PI / 2, spread: 1 });
        sfx.bounce();
      }
      // 左右两侧已经打通，交给 wrapShuttle() 处理
      if (Math.hypot(sh.vx, sh.vy) > REBOUND_MAX) {
        const k = REBOUND_MAX / Math.hypot(sh.vx, sh.vy);
        sh.vx *= k;
        sh.vy *= k;
      }
    }

    // 落地
    if (sh.chaos === 0 && (sh.y >= GROUND - SHUTTLE_R || (this.style !== 'meme' && (sh.x < -300 || sh.x > 1900)))) {
      sh.y = Math.min(sh.y, GROUND - SHUTTLE_R);
      this.land();
      return true;
    }
    return false;
  }

  /**
   * 恶搞模式：两侧空气墙打通。
   * 球从左边飞出去就从右边飞回来（速度不变，继续飞）。
   */
  private wrapShuttle(skip: boolean) {
    const sh = this.shuttle;
    if (this.style !== 'meme') return;
    if (sh.x < WRAP_L) sh.x += WRAP_SPAN;
    else if (sh.x > WRAP_R) sh.x -= WRAP_SPAN;
    else return;
    sh.wrapped = !skip;
    sh.trail.length = 0;
    const ex = sh.x < NET_X ? WRAP_L : WRAP_R;
    this.fx.ring(ex, sh.y, '#a78bfa', 70, 0.35);
    this.fx.sparks(ex, sh.y, '#a78bfa', 8, 260, { angle: sh.x < NET_X ? 0 : Math.PI, spread: 1.2 });
    this.excite = Math.min(1, this.excite + 0.04);
  }

  // ————————————————— 击球判定 —————————————————

  private checkHits() {
    const sh = this.shuttle;
    if (this.phase !== 'serve' && this.phase !== 'rally') return;
    for (const p of this.players) {
      const sw = p.swing;
      if (!sw || sw.done || sw.t < 0) continue;
      const u = sw.t / sw.dur;
      if (u < sw.strike - 0.04 || u > sw.strike + 0.16) continue;
      const timeStoppedByMe = this.timeStop?.side === p.side;
      if (sh.lastHitter === p.side && !timeStoppedByMe) continue;
      if (this.phase === 'serve' && sh.held !== p.side) continue;
      if ((sh.x - NET_X) * p.facing > 12) continue; // 不能过网击球
      const dx = sh.x - p.shoulder.x;
      const dy = sh.y - p.shoulder.y;
      const dist = Math.hypot(dx, dy);
      if (dist > PLAYER.reach || dx * p.facing < -40) continue;
      this.performHit(p, sw, dist);
    }
  }

  private performHit(p: Player, sw: Swing, dist: number) {
    const sh = this.shuttle;
    const shot = sw.shot;
    const serve = sw.serve;

    // —— 时间停止期间：球被冻住，每次挥拍都在攒力量 ——
    if (this.timeStop?.side === p.side) {
      sw.done = true;
      sw.aim = { x: sh.x, y: sh.y };
      this.skills[p.side].accum += 1;
      p.glow = 1;
      p.glowColor = '#a78bfa';
      this.fx.ring(sh.x, sh.y, '#a78bfa', 60 + this.skills[p.side].accum * 8, 0.35);
      this.fx.sparks(sh.x, sh.y, '#a78bfa', 10, 260 + this.skills[p.side].accum * 40, { angle: -Math.PI / 2, spread: 1.4 });
      this.fx.text(sh.x, sh.y - 50, `蓄力 ×${this.skills[p.side].accum}`, '#c4b5fd', 30, 0.8);
      sfx.hit('thunderSmash', true, false);
      return;
    }
    const height = GROUND - sh.y;
    const inZone = height >= shot.zone[0] - 10 && height <= shot.zone[1] + 10;
    const poor = !serve && !inZone;
    const perfect = !serve && inZone && dist >= 55 && dist <= 128;

    // 落点：基础深度 + 方向键微调 + 品质误差
    let depth = serve ? SERVES[serve].depth : shot.depth;
    if (!serve && (shot.id === 'smash' || shot.id === 'jumpSmash' || shot.id === 'cut')) depth += rand(-0.1, 0.1);
    depth += clamp(p.moveInput * p.facing, -1, 1) * 0.1;
    const jitter = serve || perfect ? 0 : poor ? rand(-150, 150) : rand(-26, 26);
    const targetX = landingX(p.side, clamp(depth, 0.02, 1.04), this.court) + jitter;
    const prof = serve ? SERVES[serve] : shot;
    const power = sw.power ?? 1;
    // 暴力弹道靠 k 倍速发力，这里不再叠力量倍率，免得两套系数互相打架
    const launchSpeed = prof.speed * (poor ? 0.85 : 1) * (serve || shot.blast ? 1 : 1 + (power - 1) * 0.8);
    // 恶搞招式里的「暴力弹道」：能打多快打多快，只要还能过网 / 落在场内
    // 蓄力比例（0~1）：蓄力越满，暴力弹道的加速倍率越高
    const ratio = serve ? 0 : clamp((power - 1) / 0.95, 0, 1);
    const [kMin, kMax] = shot.blastK ?? [3.4, 4];
    const v =
      !serve && shot.blast
        ? solveBlast({
            x: sh.x, y: sh.y, side: p.side,
            speed: launchSpeed,
            court: { l: this.court.l, r: this.court.r },
            mustLand: !shot.chaos,
            targetX,
            kMax: kMin + (kMax - kMin) * Math.pow(ratio, 0.85),
            free: !!shot.chaos,
          })
        : solveShot({
            x: sh.x, y: sh.y, side: p.side,
            speed: launchSpeed,
            targetX, arc: prof.arc, margin: prof.margin,
          });

    sh.vx = v.vx;
    sh.vy = v.vy;
    sh.dragMul = !serve && shot.blast ? (v as { dragMul?: number }).dragMul ?? 1 : 1;
    if (!serve && shot.chaos) {
      // 超级反弹靠「越弹越快」发力，出手先收着点
      const sp = Math.hypot(sh.vx, sh.vy);
      if (sp > REBOUND_LAUNCH) {
        sh.vx *= REBOUND_LAUNCH / sp;
        sh.vy *= REBOUND_LAUNCH / sp;
      }
      sh.dragMul = 1;
    }
    sh.held = null;
    sh.lastHitter = p.side;
    sh.lastShot = serve ? null : shot;
    sh.chaos = serve ? 0 : shot.chaos ?? 0;
    sh.star = sh.chaos > 0;
    sh.wrapped = false;
    if (!serve && shot.cooldown) this.cooldown[p.side].set(shot.id, shot.cooldown);
    // 招式占比统计（发球不算）
    if (!serve) {
      const tally = this.usage[p.side];
      tally.set(shot.id, (tally.get(shot.id) ?? 0) + 1);
    }
    sh.perfect = perfect;
    sh.poor = poor;
    sh.angle = Math.atan2(v.vy, v.vx) + Math.PI * 0.9; // 先翻转再朝前
    sh.spin = serve ? 0 : shot.spin * p.facing * 1.0;
    sh.trail.length = 0;
    this.phase = 'rally';
    this.rally++;
    sw.done = true;
    sw.aim = { x: sh.x, y: sh.y };

    // —— 特效与音效 ——
    const dir = sideSign(p.side);
    p.glow = 1;
    p.glowColor = serve ? '#ffffff' : shot.color;
    this.maxedBonus = sw.maxed ? 3 : 0;
    // 蓄力越满，出手的震屏 / 顿帧越凶
    if (!serve && shot.blast) {
      const heat = clamp((power - 1) / 0.95, 0, 1);
      this.fx.shake = Math.max(this.fx.shake, shot.shake * (0.6 + heat * 0.9));
      this.hitStop = Math.max(this.hitStop, shot.hitStop * (0.7 + heat * 0.8));
      if (heat > 0.3) this.slowTimer = Math.max(this.slowTimer, shot.slowmo * heat);
    }
    if (sw.maxed) {
      this.fx.flash = 1;
      this.fx.flashColor = '#fff3b0';
      this.fx.text(sh.x, sh.y - 150, 'MAX!', '#ffe27a', 52, 1.4);
      this.fx.shake = Math.max(this.fx.shake, 34);
      this.hitStop = Math.max(this.hitStop, 0.1);
      this.slowTimer = Math.max(this.slowTimer, 0.4);
    }
    if (serve) {
      sfx.serve();
      this.fx.ring(sh.x, sh.y, '#ffffff', 60, 0.35);
      this.fx.sparks(sh.x, sh.y, '#ffffff', 8, 240, { angle: dir > 0 ? 0 : Math.PI, spread: 1 });
    } else {
      sfx.hit(shot.id, perfect, poor);
      this.fx.hit(shot, sh.x, sh.y, dir, perfect, poor);
      if (shot.id === 'jumpSmash' || shot.id === 'smash') this.fx.floorRing(p.x, shot.color, shot.id === 'jumpSmash' ? 190 : 120);
      if (!poor) {
        this.hitStop = Math.max(this.hitStop, shot.hitStop);
        this.slowTimer = Math.max(this.slowTimer, shot.slowmo);
      }
      // 冲击波：把对手震退
      if (shot.push) {
        const foe = this.players[opponent(p.side)];
        foe.vx += sideSign(p.side) * shot.push;
        this.fx.ring(foe.x, GROUND - 96, shot.color, 130, 0.5);
        this.fx.text(foe.x, foe.pose.head.y - 34, '震退!', shot.color, 26, 0.85);
        this.fx.shake = Math.max(this.fx.shake, 10);
      }
      const big = shot.points >= 3;
      this.fx.text(sh.x, sh.y - 56, poor ? '勉强' : shot.name, poor ? '#aab4c8' : shot.color, big ? 46 : 34, big ? 1.2 : 0.95);
      if (perfect) this.fx.text(sh.x, sh.y - 100, 'PERFECT', '#ffe27a', 24, 0.9);
    }
    this.excite = Math.min(1, this.excite + 0.08);
  }

  // ————————————————— 得分 —————————————————

  private land() {
    const sh = this.shuttle;
    const x = sh.x;
    const hitter = sh.lastHitter;
    if (hitter === null) return;
    // 恶搞模式没有界线：落在哪半边就是哪半边的地盘，只看落地
    const inBounds = this.style === 'meme' ? true : x >= this.court.l && x <= this.court.r;
    const landSide: Side = x < NET_X ? 0 : 1;

    let winner: Side;
    let title: string;
    let sub: string;
    let color: string;
    let points = 1;
    let ok = false;
    if (landSide === hitter) {
      winner = opponent(hitter);
      title = this.netTouched ? '触网!' : '未过网!';
      sub = '+1 分';
      color = '#ff8a7a';
    } else if (!inBounds) {
      winner = opponent(hitter);
      title = '出界!';
      sub = '+1 分';
      color = '#ff8a7a';
    } else {
      winner = hitter;
      ok = true;
      const shot = sh.lastShot;
      if (shot) {
        points = sh.poor ? 1 : shot.points + (sh.perfect ? 1 : 0) + (this.maxedBonus > 0 ? this.maxedBonus : 0);
        title = `${shot.name}得分!`;
        sub = `+${points} 分${sh.perfect ? ' · 完美击球' : sh.poor ? ' · 勉强回球' : ''}`;
        color = shot.color;
      } else {
        title = '发球得分!';
        sub = '+1 分';
        color = '#ffffff';
      }
    }

    // —— 恶搞模式：得分翻倍 ——
    if (ok && this.style === 'meme') {
      points *= 2;
      sub = `+${points} 分 · 暴走加成`;
    }

    this.score[winner] += points;
    this.maxedBonus = 0;
    sh.chaos = 0;
    this.scorePop[winner] = 1;
    this.server = winner;
    this.banner = { title, sub, color, t: 0 };
    this.marks.push({ x, age: 0, ok });
    this.fx.floorRing(x, ok ? '#9be564' : '#ff5a4d', 70);
    this.fx.dust(x, 10, 1.2);
    this.fx.text(x, GROUND - 40, ok ? 'IN' : 'OUT', ok ? '#9be564' : '#ff8a7a', 26, 0.9);
    sfx.land(1);
    if (ok) sfx.point(points);
    else sfx.fault();
    if (points >= 3) this.fx.confetti(x, GROUND - 20, 22);
    this.excite = 1;

    sh.vx = 0;
    sh.vy = 0;
    sh.spin = 0;
    sh.star = false;
    sh.angle = x < NET_X ? 0.25 : 2.9;
    this.phase = 'point';
    this.pointTimer = 0;
    this.emit();
  }

  private updatePoint(dt: number) {
    this.pointTimer += dt;
    if (this.pointTimer < POINT_DELAY) return;
    const w = this.score[0] >= this.target ? 0 : this.score[1] >= this.target ? 1 : null;
    if (w !== null) {
      this.over = true;
      this.winner = w;
      this.phase = 'over';
      this.fx.confetti(this.players[w].x, GROUND - 100, 90);
      sfx.win();
      this.emit();
      return;
    }
    this.startServe();
  }
}
