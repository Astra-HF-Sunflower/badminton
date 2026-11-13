import { GROUND, NET_X, clamp, rand } from './constants';
import type { Intent, Player } from './player';
import { predict } from './physics';
import { PlayStyle, SHOT_BY_ID, ShotId, shotIdsFor } from './shots';
import type { Shuttle } from './shuttle';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Phase = 'serve' | 'rally' | 'point' | 'over';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: '轻松', normal: '标准', hard: '地狱' };

interface Cfg {
  speed: number;
  react: number;
  err: number;
  jump: number;
  attack: number;
}
const CFG: Record<Difficulty, Cfg> = {
  easy: { speed: 0.7, react: 0.3, err: 80, jump: 0.1, attack: 0.3 },
  normal: { speed: 0.88, react: 0.16, err: 38, jump: 0.3, attack: 0.5 },
  hard: { speed: 1.0, react: 0.08, err: 14, jump: 0.5, attack: 0.65 },
};

interface Plan {
  shot: ShotId;
  x: number;
  y: number;
  t: number;
  stamp: number;
  /** 蓄力球：提前多久开始按住（秒） */
  charge?: number;
}

/** 普通模式没有的球被选中时，换成同一用途的基础击球 */
const SUBSTITUTE: Record<ShotId, ShotId> = {
  clear: 'clear',
  smash: 'smash',
  drive: 'drive',
  lift: 'lift',
  drop: 'drive',
  net: 'lift',
  flick: 'lift',
  jumpSmash: 'smash',
  cut: 'smash',
  thunderSmash: 'smash',
  superRebound: 'clear',
  shockwave: 'smash',
};

const pick = (list: [ShotId, number][]): ShotId => {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [id, w] of list) if ((r -= w) <= 0) return id;
  return list[0][0];
};

/** 电脑对手：预测落点 → 跑位 → 按挥拍前摇提前出手 */
export class AIController {
  private cfg: Cfg;
  private readonly allowed: Set<ShotId>;
  private readonly meme: boolean;
  /** 引擎传入的冷却表（秒） */
  private cool: Map<ShotId, number> | null = null;
  private plan: Plan | null = null;
  private replan = 0;
  private clock = 0;
  private serveWait = rand(0.9, 1.4);
  private idleX: number | null = null;

  constructor(difficulty: Difficulty, style: PlayStyle = 'pro') {
    this.cfg = CFG[difficulty];
    this.allowed = new Set(shotIdsFor(style));
    this.meme = style === 'meme';
  }

  /** 只用本玩法模式开放的击球 */
  private resolve(id: ShotId): ShotId {
    if (this.allowed.has(id)) return id;
    const alt = SUBSTITUTE[id] ?? 'clear';
    return this.allowed.has(alt) ? alt : [...this.allowed][0];
  }

  get speedMul() {
    return this.cfg.speed;
  }

  resetRally() {
    this.plan = null;
    this.replan = 0;
    this.serveWait = rand(0.9, 1.4);
  }

  decide(
    dt: number,
    me: Player,
    opp: Player,
    shuttle: Shuttle,
    phase: Phase,
    homeX: number,
    cool?: Map<ShotId, number>,
  ): Intent {
    this.cool = cool ?? null;
    this.clock += dt;
    const intent: Intent = { move: 0, jump: false, shot: null };
    const f = me.facing;
    const goTo = (x: number) => {
      const dx = x - me.x;
      intent.move = Math.abs(dx) < 6 ? 0 : clamp(dx / 34, -1, 1);
    };

    if (phase === 'serve') {
      goTo(shuttle.held === me.side ? homeX - f * 60 : homeX);
      if (shuttle.held === me.side && !me.swing) {
        this.serveWait -= dt;
        if (this.serveWait <= 0) {
          const short = this.allowed.has('drive') ? 'drive' : 'net';
          intent.shot = Math.random() < 0.6 ? 'clear' : this.resolve(short);
        }
      }
      return intent;
    }

    // 来球判定：对方击出的球，或者被「超级反弹」弹回、正飞向自己半场的球
    const onMySide = (shuttle.x - NET_X) * me.facing < 0;
    const incoming =
      phase === 'rally' &&
      shuttle.held === null &&
      (shuttle.lastHitter === opp.side || (onMySide && Math.abs(shuttle.vx) > 30));
    if (!incoming) {
      this.plan = null;
      this.replan = 0;
      // 回到中场，对手打出高球时略微后撤
      if (this.idleX === null) this.idleX = homeX;
      this.idleX += (homeX + (shuttle.lastHitter === me.side ? f * 50 : 0) - this.idleX) * Math.min(1, dt * 3);
      goTo(this.idleX);
      return intent;
    }

    this.replan -= dt;
    if (this.replan <= 0 || !this.plan) {
      this.replan = this.cfg.react;
      this.plan = this.makePlan(me, shuttle);
    }
    const plan = this.plan;
    if (plan) {
      goTo(plan.x - f * 56);
      const left = plan.t - (this.clock - plan.stamp);
      const shot = SHOT_BY_ID[plan.shot];
      const strikeTotal = shot.delay + shot.duration * shot.strike;
      const aligned = Math.abs(me.x - (plan.x - f * 56)) < 80;

      // 已经蓄力中：按到出手点松手
      if (me.charge) {
        if (left <= strikeTotal || !aligned) {
          intent.charge = { shot: me.charge.shot, held: false };
          this.plan = null;
          this.replan = 0.3;
        } else {
          intent.charge = { shot: me.charge.shot, held: true };
        }
        return intent;
      }

      // 需要蓄力的球：提前按住
      const chargeNeed = shot.charge ? plan.charge ?? 0.6 : 0;
      if (!me.swing && left <= strikeTotal + chargeNeed && left > -0.12 && aligned) {
        if (shot.charge) {
          intent.charge = { shot: plan.shot, held: left > strikeTotal };
        } else {
          intent.shot = plan.shot;
          this.plan = null;
          this.replan = 0.25;
        }
      }
    }
    return intent;
  }

  /** 冷却中的招式不选 */
  private choose(list: [ShotId, number][]): ShotId {
    const usable = list.filter(([id]) => (this.cool?.get(id) ?? 0) <= 0);
    return pick(usable.length ? usable : [['clear', 1]]);
  }

  private makePlan(me: Player, s: Shuttle): Plan | null {
    const f = me.facing;
    const err = this.cfg.err;
    const make = (id: ShotId, relY: number): Plan | null => {
      const shot = this.resolve(id);
      if ((this.cool?.get(shot) ?? 0) > 0) return null; // 还在冷却
      const r = predict(s, { atY: GROUND - relY, maxT: 3.5 });
      if ((r.x - NET_X) * f > -20) return null; // 球不会落到自己半场
      return {
        shot,
        x: clamp(r.x + rand(-err, err), me.minX, me.maxX),
        y: r.y,
        t: r.t,
        stamp: this.clock,
        charge: SHOT_BY_ID[shot].charge ? rand(0.45, 1.05) : undefined,
      };
    };
    const relEarly = GROUND - s.y;
    // 恶搞模式：按来球高度挑暴走三招（高度不够就不硬上，避免空挥）
    if (this.meme && Math.random() < 0.6) {
      const list: [ShotId, number][] = [];
      if (relEarly > 300) list.push(['thunderSmash', 3]);
      if (relEarly > 150) list.push(['shockwave', 3]);
      list.push(['superRebound', 2], ['smash', 1.5]);
      const id = this.choose(list);
      const relY = id === 'thunderSmash' ? 360 : id === 'shockwave' ? 265 : 220;
      const wild = make(id, relY);
      if (wild) return wild;
    }
    const speed = Math.hypot(s.vx, s.vy);
    const netDist = Math.abs(me.x - NET_X);
    const homeDeep = netDist > 450;
    const nearNet = netDist < 200;
    const high = s.y < GROUND - 360;
    const rel = GROUND - s.y;

    // 对方杀过来的快球：只能防守
    if (speed > 1500 && s.vy > 0) {
      return make(this.choose([['lift', 7], ['drive', 2], ['net', 1], ['flick', 1]]), 100);
    }
    // 极高的球：跳杀
    if (high && Math.random() < this.cfg.jump) return make('jumpSmash', 340);
    // 球会落到肩膀以下：挑 / 搓
    if (rel < 190 && s.vy > 0) {
      const at = clamp(rel - 8, 15, 60);
      if (nearNet) return make(this.choose([['net', 5], ['lift', 4], ['drop', 1]]), at);
      return make(this.choose([['lift', 7], ['net', 1], ['drive', 2]]), at);
    }
    const a = this.cfg.attack;
    if (homeDeep) {
      return make(this.choose([['clear', 4], ['smash', 3 * a + 1], ['drop', 3], ['cut', 2], ['flick', 1]]), 175);
    }
    if (nearNet) {
      return make(this.choose([['drop', 4], ['cut', 3], ['smash', 2 * a + 0.5], ['flick', 1]]), 175);
    }
    return make(this.choose([['smash', 4 * a + 1], ['drop', 3], ['clear', 2], ['cut', 2], ['drive', 1.5], ['flick', 1]]), 175);
  }
}
