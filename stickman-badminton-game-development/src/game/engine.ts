import { AIController, DIFFICULTY_LABEL, Difficulty, Phase } from './ai';
import {
  COURT_L, COURT_R, GROUND, NET_TOP, NET_X, PLAYER, SHUTTLE_R, Side, clamp, opponent, rand, sideSign,
} from './constants';
import { Fx } from './fx';
import { Input, Keymap, P1_KEYS, P2_KEYS, SOLO_KEYS } from './input';
import { landingX, solveShot, stepBody } from './physics';
import { Intent, Player, ServeKind, Swing } from './player';
import { Banner, LandingMark, Scene, drawScene } from './render/scene';
import { sfx } from './audio';
import { SERVES, SERVE_SHORT_SHOTS, ShotId } from './shots';
import { createShuttle, Shuttle } from './shuttle';

export type Mode = 'single' | 'double';

export interface GameOptions {
  mode: Mode;
  difficulty: Difficulty;
  target: number;
}

export interface GameStatus {
  phase: 'playing' | 'paused' | 'over';
  winner: Side | null;
  score: [number, number];
  names: [string, string];
}

const MAX_SUBSTEP = 1 / 120;
const POINT_DELAY = 2.1;

/** 游戏主循环：输入 → 物理 → 判定 → 特效 → 渲染 */
export class Game implements Scene {
  time = 0;
  readonly mode: Mode;
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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    opts: GameOptions,
    private readonly onStatus: (s: GameStatus) => void,
  ) {
    this.mode = opts.mode;
    this.target = opts.target;
    this.difficultyLabel = DIFFICULTY_LABEL[opts.difficulty];
    const single = opts.mode === 'single';
    this.humanSides = [true, !single];
    this.players = [
      new Player(0, single ? '你' : 'P1', '#38bdf8', PLAYER.homeX[0]),
      new Player(1, single ? '电脑' : 'P2', '#fb7185', PLAYER.homeX[1]),
    ];
    this.keymaps = single ? [SOLO_KEYS, null] : [P1_KEYS, P2_KEYS];
    this.ai = single ? new AIController(opts.difficulty) : null;
    if (this.ai) this.players[1].speedMul = this.ai.speedMul;

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
    const pressed = this.keymaps.map((km) => (km ? { shot: this.input.takeShot(km), jump: this.input.takeJump(km) } : null));
    this.input.endFrame();
    for (let i = 0; i < n; i++) this.step(sub, i === 0 ? pressed : [null, null]);
  }

  private step(dt: number, pressed: ({ shot: ShotId | null; jump: boolean } | null)[]) {
    this.time += dt;
    const { players, shuttle: sh } = this;

    // —— 收集意图 ——
    const intents: Intent[] = [0, 1].map((i) => {
      const side = i as Side;
      const me = players[side];
      if (this.phase === 'point' || this.phase === 'over') return this.walkHome(me, this.phase === 'point' && this.pointTimer > 0.7);
      const km = this.keymaps[side];
      if (km && this.humanSides[side]) {
        const move = (this.input.isDown(km.right) ? 1 : 0) - (this.input.isDown(km.left) ? 1 : 0);
        return { move, jump: pressed[side]?.jump ?? false, shot: pressed[side]?.shot ?? null };
      }
      return this.ai!.decide(dt, me, players[opponent(side)], sh, this.phase, PLAYER.homeX[side]);
    });

    // —— 球拍对准来球 ——
    for (const p of players) {
      const sw = p.swing;
      if (sw && !sw.done && this.phase !== 'point' && sh.lastHitter !== p.side) {
        const d = Math.hypot(sh.x - p.shoulder.x, sh.y - p.shoulder.y);
        if (d < 300) sw.aim = { x: sh.x, y: sh.y };
      }
    }

    // —— 玩家更新 ——
    for (const p of players) {
      p.update(dt, intents[p.side], (id) => this.canSwing(p.side, id));
      this.handlePlayerEvents(p);
    }

    // —— 球 ——
    if (this.phase === 'serve') this.holdShuttle(dt);
    else if (this.phase === 'rally') this.stepShuttle(dt);
    this.checkHits();

    // —— 辅助动画 ——
    this.fx.update(dt);
    this.netVel += (-this.netSway * 220 - this.netVel * 5) * dt;
    this.netSway += this.netVel * dt;
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

  private walkHome(p: Player, go: boolean): Intent {
    const dx = PLAYER.homeX[p.side] - p.x;
    return { move: go && Math.abs(dx) > 8 ? clamp(dx / 70, -0.7, 0.7) : 0, jump: false, shot: null };
  }

  private canSwing(side: Side, id: ShotId): ServeKind | null | false {
    if (this.phase === 'point' || this.phase === 'over') return false;
    if (this.phase === 'serve') {
      if (this.shuttle.held !== side) return false;
      return SERVE_SHORT_SHOTS.includes(id) ? 'short' : 'high';
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
    sh.trail.length = 0;
    sh.vx = 0;
    sh.vy = 0;
    sh.spin = 0;
    for (const p of this.players) {
      if (Math.abs(p.x - PLAYER.homeX[p.side]) > 90) p.x = PLAYER.homeX[p.side];
      p.swing = null;
      p.buffered = null;
    }
    this.ai?.resetRally();
    this.holdShuttle(0);
    sh.angle = Math.PI / 2;
  }

  private holdShuttle(dt: number) {
    const sh = this.shuttle;
    if (sh.held === null) return;
    const p = this.players[sh.held];
    sh.x = p.x + p.facing * 54;
    sh.y = GROUND - 118 - p.z;
    sh.angle += (Math.PI / 2 - sh.angle) * Math.min(1, dt * 12);
  }

  private stepShuttle(dt: number) {
    const sh = this.shuttle;
    const px = sh.x;
    const py = sh.y;
    stepBody(sh, dt);

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

    // 过网 / 触网
    if (px < NET_X !== sh.x < NET_X) {
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
    this.fxTick += dt;
    if (this.fxTick > 0.018 && sh.lastShot && speed > 140) {
      this.fxTick = 0;
      this.fx.trail(sh.lastShot.fx, sh.lastShot.color, sh.x, sh.y, sh.vx, sh.vy);
    }

    // 落地
    if (sh.y >= GROUND - SHUTTLE_R || sh.x < -300 || sh.x > 1900) {
      sh.y = Math.min(sh.y, GROUND - SHUTTLE_R);
      this.land();
    }
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
      if (sh.lastHitter === p.side) continue;
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
    const height = GROUND - sh.y;
    const inZone = height >= shot.zone[0] - 10 && height <= shot.zone[1] + 10;
    const poor = !serve && !inZone;
    const perfect = !serve && inZone && dist >= 55 && dist <= 128;

    // 落点：基础深度 + 方向键微调 + 品质误差
    let depth = serve ? SERVES[serve].depth : shot.depth;
    if (!serve && (shot.id === 'smash' || shot.id === 'jumpSmash' || shot.id === 'cut')) depth += rand(-0.1, 0.1);
    depth += clamp(p.moveInput * p.facing, -1, 1) * 0.1;
    const jitter = serve || perfect ? 0 : poor ? rand(-150, 150) : rand(-26, 26);
    const targetX = landingX(p.side, clamp(depth, 0.02, 1.04)) + jitter;
    const prof = serve ? SERVES[serve] : shot;
    const v = solveShot({
      x: sh.x, y: sh.y, side: p.side, speed: prof.speed * (poor ? 0.85 : 1), targetX, arc: prof.arc, margin: prof.margin,
    });

    sh.vx = v.vx;
    sh.vy = v.vy;
    sh.held = null;
    sh.lastHitter = p.side;
    sh.lastShot = serve ? null : shot;
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
    const inBounds = x >= COURT_L && x <= COURT_R;
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
        points = sh.poor ? 1 : shot.points + (sh.perfect ? 1 : 0);
        title = `${shot.name}得分!`;
        sub = `+${points} 分${sh.perfect ? ' · 完美击球' : sh.poor ? ' · 勉强回球' : ''}`;
        color = shot.color;
      } else {
        title = '发球得分!';
        sub = '+1 分';
        color = '#ffffff';
      }
    }

    this.score[winner] += points;
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
