import { NET_X, PLAYER, Side, approach, clamp, sideSign } from './constants';
import { CourtDef } from './court';
import { getGravityScale } from './physics';
import { computePose, Pose, Vec } from './pose';
import { SHOT_BY_ID, ShotDef, ShotId } from './shots';
import type { SwingKey } from './swings';

export interface Intent {
  move: number; // -1..1
  jump: boolean; // 本帧按下
  shot: ShotId | null; // 本帧按下
  /** 长按蓄力：held = 蓄力键是否按住 */
  charge?: { shot: ShotId; held: boolean } | null;
}

export type ServeKind = 'high' | 'short';

export interface Swing {
  shot: ShotDef;
  key: SwingKey;
  /** 蓄力倍率：1 = 普通，满蓄力约 1.9 */
  power: number;
  /** 是否蓄满（满蓄力额外加分/特效） */
  maxed: boolean;
  /** 负数表示起跳前摇 */
  t: number;
  dur: number;
  strike: number;
  done: boolean;
  aim: Vec | null;
  serve: ServeKind | null;
}

export interface TrailPoint extends Vec {
  age: number;
}

export class Player {
  readonly facing: 1 | -1;
  x: number;
  z = 0;
  vx = 0;
  vz = 0;
  minX: number;
  maxX: number;
  speedMul = 1;
  /** 动作速度倍率（天堂制造会让挥拍前后摇极快） */
  animSpeed = 1;
  /** 最近一次的方向输入（击球时用来微调落点深浅） */
  moveInput = 0;

  swing: Swing | null = null;
  buffered: { shot: ShotId; ttl: number } | null = null;
  /** 长按蓄力状态 */
  charge: { shot: ShotId; t: number; max: number } | null = null;
  trail: TrailPoint[] = [];

  runPhase = 0;
  leanSm = 0.1;
  crouchSm = 0;
  landSquash = 0;
  time = 0;
  pose: Pose;

  /** 每步更新后由引擎读取的事件 */
  events = { jumped: false, landed: 0, step: false, swing: null as Swing | null };
  /** 击球后短暂的发光 */
  glow = 0;
  glowColor = '#fff';

  constructor(
    readonly side: Side,
    readonly name: string,
    readonly color: string,
    startX: number,
    court: CourtDef,
  ) {
    this.facing = sideSign(side);
    this.x = startX;
    // 活动范围：从底线外一点点到网前 50px
    this.minX = side === 0 ? court.l - 70 : NET_X + 50;
    this.maxX = side === 0 ? NET_X - 50 : court.r + 70;
    this.pose = computePose(this, 0);
  }

  get busy() {
    return this.swing !== null || this.charge !== null;
  }

  /** 蓄力进度 0~1 */
  get chargeRatio() {
    return this.charge ? clamp(this.charge.t / this.charge.max, 0, 1) : 0;
  }

  reset(x: number) {
    this.x = x;
    this.vx = 0;
    this.vz = 0;
    this.z = 0;
    this.swing = null;
    this.buffered = null;
    this.charge = null;
    this.trail.length = 0;
  }

  private startSwing(shotId: ShotId, serve: ServeKind | null, power = 1, maxed = false) {
    const shot = SHOT_BY_ID[shotId];
    // 失重时挥拍会产生反作用力，可以借此控制漂浮方向
    if (getGravityScale() < 0.95) {
      this.vx -= this.facing * 300 * (0.7 + power * 0.3);
      this.vz += 190;
    }
    const delay = shot.id === 'jumpSmash' && this.z <= 1 && !serve ? shot.delay : 0;
    if (delay > 0) {
      this.vz = PLAYER.jumpV;
      this.events.jumped = true;
    }
    const key: SwingKey = serve ? (serve === 'high' ? 'serveHigh' : 'serveShort') : shot.id;
    this.swing = {
      shot,
      key,
      power,
      maxed,
      t: -delay,
      dur: (serve ? 0.44 : shot.duration) / this.animSpeed,
      strike: serve ? 0.4 : shot.strike,
      done: false,
      aim: null,
      serve,
    };
    this.events.swing = this.swing;
  }

  /** 击球按键：可在挥拍收势阶段提前衔接，否则缓冲 0.2s */
  trySwing(shotId: ShotId, serve: ServeKind | null = null) {
    if (!this.swing || this.swing.t >= this.swing.dur * 0.7) this.startSwing(shotId, serve);
    else this.buffered = { shot: shotId, ttl: 0.2 };
  }

  update(dt: number, intent: Intent, canSwing: (id: ShotId) => ServeKind | null | false) {
    this.time += dt;
    this.moveInput = intent.move;
    this.events = { jumped: false, landed: 0, step: false, swing: null };
    if (this.glow > 0) this.glow = Math.max(0, this.glow - dt * 4);

    // —— 水平移动：挥拍时降速，蓄力时几乎定身 ——
    const committed = this.charge ? 0.12 : this.swing ? (this.swing.shot.id === 'jumpSmash' ? 0.45 : 0.62) : 1;
    const target = intent.move * PLAYER.speed * this.speedMul * committed;
    this.vx = approach(this.vx, target, (this.z > 0 ? PLAYER.airAccel : PLAYER.groundAccel) * dt);
    this.x = clamp(this.x + this.vx * dt, this.minX, this.maxX);
    if (this.x === this.minX || this.x === this.maxX) this.vx *= 0.5;

    // —— 跳跃 ——
    const gScale = getGravityScale();
    const lowG = gScale < 0.95;
    if (intent.jump && this.z <= (lowG ? 2 : 0) && this.vz <= (lowG ? 80 : 0)) {
      this.vz = PLAYER.jumpV * (lowG ? 0.85 : 1);
      this.events.jumped = true;
    }
    if (lowG) {
      // 失重：人和球一起漂，围绕一个悬浮高度轻轻起伏
      const hover = 34 + Math.sin(this.time * 1.5 + this.side * 2.1) * 14;
      this.vz += ((hover - this.z) * 5.2 - this.vz * 3.0) * dt;
      this.z += this.vz * dt;
      if (this.z < 0) {
        this.z = 0;
        this.vz = Math.max(this.vz, 0);
      }
    } else if (this.z > 0 || this.vz > 0) {
      this.vz -= PLAYER.gravity * gScale * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.events.landed = -this.vz;
        this.landSquash = clamp(-this.vz / 1000, 0.2, 1);
        this.z = 0;
        this.vz = 0;
      }
    }
    this.landSquash = Math.max(0, this.landSquash - dt * 5);

    // —— 脚步 ——
    if (this.z <= 0) {
      const prev = Math.sin(this.runPhase);
      this.runPhase += this.vx * this.facing * 0.034 * dt;
      if (Math.abs(this.vx) > 200 && prev * Math.sin(this.runPhase) < 0 && Math.cos(this.runPhase) > 0) this.events.step = true;
    }

    // —— 长按蓄力 ——
    const ch = intent.charge;
    if (ch) {
      if (ch.held) {
        if (!this.charge && !this.swing && canSwing(ch.shot) !== false) {
          this.charge = { shot: ch.shot, t: 0, max: SHOT_BY_ID[ch.shot].charge ?? 0.8 };
        } else if (this.charge) {
          this.charge.t = Math.min(this.charge.max, this.charge.t + dt);
        }
      } else if (this.charge) {
        const ratio = clamp(this.charge.t / this.charge.max, 0, 1);
        const id = this.charge.shot;
        this.charge = null;
        const serve = canSwing(id);
        // 松手立刻出手，不必等蓄满
        if (ratio > 0.01 && serve !== false) this.startSwing(id, serve, 1 + ratio * 0.95, ratio >= 0.98);
      }
    } else if (this.charge) {
      this.charge = null;
    }

    // —— 击球输入 ——
    if (intent.shot && !this.charge) {
      const serve = canSwing(intent.shot);
      if (serve !== false) this.trySwing(intent.shot, serve);
    }
    if (this.swing) {
      this.swing.t += dt;
      if (this.swing.t >= this.swing.dur) this.swing = null;
    }
    if (this.buffered) {
      this.buffered.ttl -= dt;
      if (!this.swing && this.buffered.ttl > 0) {
        const b = this.buffered;
        this.buffered = null;
        const serve = canSwing(b.shot);
        if (serve !== false) this.startSwing(b.shot, serve);
      } else if (this.buffered.ttl <= 0) this.buffered = null;
    }

    this.pose = computePose(this, dt);

    // —— 拍头拖尾 ——
    for (const p of this.trail) p.age += dt;
    while (this.trail.length && this.trail[0].age > 0.28) this.trail.shift();
    const s = this.swing;
    if (s && s.t > 0 && s.t / s.dur > 0.12 && s.t / s.dur < 0.85) {
      this.trail.push({ x: this.pose.racketHead.x, y: this.pose.racketHead.y, age: 0 });
    }
  }

  /** 击球半径检测使用的肩膀位置 */
  get shoulder(): Vec {
    return this.pose.shoulder;
  }
}
