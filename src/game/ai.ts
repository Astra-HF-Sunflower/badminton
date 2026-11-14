import { GROUND, NET_X, PLAYER, clamp, rand } from './constants';
import { COURT_BY_ID, CourtDef } from './court';
import type { Intent, Player } from './player';
import { landingX, predict } from './physics';
import { PlayStyle, SHOT_BY_ID, ShotId, shotIdsFor } from './shots';
import type { Shuttle } from './shuttle';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Phase = 'serve' | 'rally' | 'point' | 'over';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: '轻松', normal: '标准', hard: '地狱' };

interface Cfg {
  speed: number;
  react: number;
  err: number;
  /** 进攻欲望：越高越敢打杀球 / 跳杀 */
  attack: number;
}
const CFG: Record<Difficulty, Cfg> = {
  easy: { speed: 0.7, react: 0.3, err: 80, attack: 0.35 },
  normal: { speed: 0.88, react: 0.16, err: 38, attack: 0.6 },
  hard: { speed: 1.0, react: 0.08, err: 14, attack: 0.85 },
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

/** 对方杀球时只能用来防守的球 */
const DEFENSIVE = new Set<ShotId>(['lift', 'drive', 'net', 'flick', 'clear']);

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
  /** 蓄力球计划松手的时间点 */
  private releaseAt: number | null = null;
  /** 这一拍是否已经在处理（用来锁定「一拍只选一次球路」） */
  private wasIncoming = false;
  /** 上一拍 / 上上拍用的球，用来避免连续重复 */
  private lastShot: ShotId | null = null;
  private prevShot: ShotId | null = null;
  /** 最近几拍的球路，用来越打越换花样 */
  private history: ShotId[] = [];
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
    this.releaseAt = null;
    this.replan = 0;
    this.wasIncoming = false;
    this.lastShot = null;
    this.prevShot = null;
    this.history.length = 0;
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
    court: CourtDef = COURT_BY_ID.medium,
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
    // 新的一拍：球路只在这一刻决定，后面只微调跑位（不然会一直重摇）
    if (incoming && !this.wasIncoming) {
      this.plan = null;
      this.replan = 0;
    }
    this.wasIncoming = incoming;

    // —— 蓄力进行中：只管理松手时机，绝不半途丢掉 ——
    if (me.charge) {
      const rel = this.releaseAt;
      const done = rel === null || this.clock >= rel;
      intent.charge = { shot: me.charge.shot, held: !done };
      if (done) {
        this.releaseAt = null;
        this.plan = null;
        this.replan = 0.3;
      } else if (this.plan) {
        goTo(this.plan.x - f * 56);
      }
      return intent;
    }

    if (!incoming) {
      this.plan = null;
      this.replan = 0;
      // 回到中场：对手在后场就往后站半步，对手压上来就往前顶
      const oppNetDist = Math.abs(opp.x - NET_X);
      const shift = oppNetDist > 430 ? -40 : oppNetDist < 250 ? 40 : 0;
      const rest = homeX + shift * f + (shuttle.lastHitter === me.side ? f * 40 : 0);
      if (this.idleX === null) this.idleX = rest;
      this.idleX += (rest - this.idleX) * Math.min(1, dt * 3);
      goTo(this.idleX);
      return intent;
    }

    this.replan -= dt;
    if (this.replan <= 0 || !this.plan) {
      this.replan = this.cfg.react;
      const keep = this.plan?.shot;
      // 先试着沿用已经选好的球路（跑位更连贯），实在打不到再重选
      this.plan = (keep ? this.makePlan(me, shuttle, opp, court, keep) : null) ?? this.makePlan(me, shuttle, opp, court);
    }
    const plan = this.plan;
    if (plan) {
      goTo(plan.x - f * 56);
      const left = plan.t - (this.clock - plan.stamp);
      const shot = SHOT_BY_ID[plan.shot];
      const strikeTotal = shot.delay + shot.duration * shot.strike;
      const aligned = Math.abs(me.x - (plan.x - f * 56)) < 80;

      // 需要蓄力的球：提前按住，到出手点松手
      const chargeNeed = shot.charge ? plan.charge ?? 0.6 : 0;
      if (!me.swing && left <= strikeTotal + chargeNeed && left > -0.12 && aligned) {
        if (shot.charge && left > strikeTotal + 0.02) {
          this.releaseAt = this.clock + (left - strikeTotal);
          intent.charge = { shot: plan.shot, held: true };
        } else {
          // 来不及蓄力就直接拍出去（力量 1）
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

  /**
   * 选球：先按「能不能在最佳高度够到 / 跑不跑得到」筛掉打不成的，
   * 再按场上形势打分 —— 打空档、别重复、别乱跳杀。
   */
  private makePlan(me: Player, s: Shuttle, opp: Player, court: CourtDef, force?: ShotId): Plan | null {
    const netDist = Math.abs(me.x - NET_X);
    const near = netDist < 210;
    const deep = netDist > 430;
    const rel = GROUND - s.y;
    const fastIncoming = Math.hypot(s.vx, s.vy) > 1500 && s.vy > 0;

    // 恶搞模式：一拍里偶尔来一发暴走三招（不再每帧重摇）
    if (!force && this.meme && Math.random() < 0.3) {
      const list: [ShotId, number][] = [];
      if (rel > 300) list.push(['thunderSmash', 2]);
      if (rel > 150) list.push(['shockwave', 3]);
      list.push(['superRebound', 2], ['smash', 1.5]);
      const wild = this.planFor(me, s, this.choose(list));
      if (wild) {
        this.prevShot = this.lastShot;
        this.lastShot = wild.shot;
        this.history.push(wild.shot);
        if (this.history.length > 6) this.history.shift();
        return wild;
      }
    }

    const ids = force ? [force] : [...this.allowed];
    let best: { plan: Plan; score: number } | null = null;
    for (const raw of ids) {
      const id = this.resolve(raw);
      // 对方杀过来的快球：先想着接住，别在下面组织进攻
      if (fastIncoming && !DEFENSIVE.has(id)) continue;
      // 跳杀要有高度、也别在网前硬跳
      if (id === 'jumpSmash' && (rel < 300 || near)) continue;
      const plan = this.planFor(me, s, id);
      if (!plan) continue;
      const score = this.rateShot(plan.shot, me, opp, court, { near, deep, rel, fastIncoming });
      if (!best || score > best.score) best = { plan, score };
    }
    if (best) {
      if (!force) {
        this.prevShot = this.lastShot;
        this.lastShot = best.plan.shot;
        this.history.push(best.plan.shot);
        if (this.history.length > 6) this.history.shift();
      }
      return best.plan;
    }

    // 兜底：球已经很低了，就近挑起来救
    const at = clamp(rel - 12, 12, 80);
    for (const id of ['lift', 'drive', 'net', 'clear', 'smash'] as ShotId[]) {
      const p = this.planFor(me, s, id, at);
      if (p) return p;
    }
    return null;
  }

  /** 为某一招算出「什么时候、跑到哪儿」去打；够不到就返回 null */
  private planFor(me: Player, s: Shuttle, id: ShotId, relY?: number): Plan | null {
    const shot = this.resolve(id);
    if ((this.cool?.get(shot) ?? 0) > 0) return null; // 还在冷却
    const def = SHOT_BY_ID[shot];
    // 击球点高度：别等太高 —— 不打跳杀的话，肩膀以上的球根本够不到
    const maxRy = shot === 'jumpSmash' ? 430 : 250;
    const ideal = def.zone[0] + (def.zone[1] - def.zone[0]) * 0.62;
    const ry = clamp(relY ?? ideal, 12, maxRy);
    const r = predict(s, { atY: GROUND - ry, maxT: 3.3, wrap: this.meme });
    // 这个高度已经错过了（球早就掉到下面去了）
    if (Math.abs(r.y - (GROUND - ry)) > 26) return null;
    if ((r.x - NET_X) * me.facing > -20) return null; // 球不会落到自己半场
    const x = clamp(r.x + rand(-this.cfg.err, this.cfg.err), me.minX, me.maxX);
    // 跑得到吗
    const reach = r.t * PLAYER.speed * this.cfg.speed * 0.92 + 46;
    if (Math.abs(x - me.x) > reach) return null;
    return {
      shot,
      x,
      y: r.y,
      t: r.t,
      stamp: this.clock,
      charge: def.charge ? rand(0.4, def.charge) : undefined,
    };
  }

  /**
   * 给一招打分。像运动员那样综合考虑：
   * 空档在哪（对手要跑多远）、自己在哪、这球有多高、上一拍用的什么。
   */
  private rateShot(
    id: ShotId,
    me: Player,
    opp: Player,
    court: CourtDef,
    ctx: { near: boolean; deep: boolean; rel: number; fastIncoming: boolean },
  ): number {
    const def = SHOT_BY_ID[id];
    const land = landingX(me.side, def.depth, court);
    // 1) 空档：让对手跑起来（权重别太大，不然永远只打同一个角）
    let score = Math.min(Math.abs(opp.x - land), 700) * 0.28;

    // 2) 对手站位：他压上来就推底线，他退到底线就放网前
    const oppNetDist = Math.abs(opp.x - NET_X);
    if (oppNetDist < 250) score += def.depth > 0.72 ? 52 : -30;
    else if (oppNetDist > 470) score += def.depth < 0.34 ? 52 : -12;

    // 3) 这球有多高，决定能组织什么球路
    if (ctx.rel > 300) {
      if (id === 'smash') score += 24 + this.cfg.attack * 26;
      if (id === 'jumpSmash') score += this.cfg.attack * 34 - 26;
      if (id === 'drop' || id === 'cut') score += 18;
      if (id === 'clear') score += 10;
      if (id === 'net' || id === 'lift') score -= 14;
    } else if (ctx.rel < 150) {
      if (id === 'net' || id === 'lift') score += 22;
      if (id === 'drive') score += 10;
      if (id === 'smash' || id === 'jumpSmash') score -= 40;
    }

    // 4) 自己的位置：网前别抡重杀，后场别硬放小球
    if (ctx.near && (id === 'jumpSmash' || id === 'smash' || id === 'clear')) score -= 55;
    if (ctx.deep && (id === 'net' || id === 'flick')) score -= 45;

    // 5) 防守球先求稳
    if (ctx.fastIncoming) score += id === 'lift' ? 50 : id === 'drive' ? 25 : -20;

    // 6) 变化：别连着打同一招，也别反复用同一个套路
    if (id === this.lastShot) score -= 105;
    if (id === this.prevShot) score -= 26;
    score -= this.history.filter((h) => h === id).length * 26;

    // 一点随机，看起来才像人
    return score + rand(-18, 18);
  }
}
