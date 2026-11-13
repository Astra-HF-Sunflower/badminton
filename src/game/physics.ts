import { DRAG, GRAVITY, GROUND, NET_TOP, NET_X, SHUTTLE_R, STEP, Side, WRAP_L, WRAP_R, WRAP_SPAN, sideSign } from './constants';
import { CourtDef, courtHalf } from './court';

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 阻力倍率：恶搞招式用它造出「速度离谱但落点照旧」的弹道 */
  dragMul?: number;
  /** 超级反弹期间：完全无视空气阻力（越弹越快） */
  star?: boolean;
}

/** 全局重力系数：新月技能会把整场压成低重力（单人游戏，同一时刻只有一个实例） */
let gravityScale = 1;
export const setGravityScale = (v: number) => {
  gravityScale = v;
};
export const getGravityScale = () => gravityScale;

/** 半隐式欧拉 + 二次阻力 */
export function stepBody(b: Body, dt: number) {
  const sp = Math.hypot(b.vx, b.vy);
  const g = GRAVITY * gravityScale;
  if (b.star) {
    // 超级反弹：没有空气，只吃重力，速度全凭弹跳往上叠
    b.vy += g * dt;
  } else {
    const drag = DRAG * (b.dragMul ?? 1);
    b.vx += -drag * sp * b.vx * dt;
    b.vy += (g - drag * sp * b.vy) * dt;
    // 重力趋近 0 时球会飘着不落地：速度掉光之后让它慢慢往下掉（「掉毛」）
    if (gravityScale < 0.4 && sp < 260) b.vy += 320 * dt;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
}

interface Trial {
  landX: number;
  /** 球确实越过了球网并且高度足够 */
  clear: boolean;
  apexY: number;
}

/** 搜索时用较粗的步长，并多留一点过网余量，换取更低的 CPU 开销 */
const SOLVE_DT = 1 / 45;
const SAFETY = 10;

function trial(x0: number, y0: number, vx: number, vy: number, side: Side, margin: number): Trial {
  const b: Body = { x: x0, y: y0, vx, vy };
  const dir = sideSign(side);
  let apex = y0;
  let crossed = false;
  for (let i = 0; i < 320; i++) {
    const px = b.x;
    const py = b.y;
    stepBody(b, SOLVE_DT);
    if (b.y < apex) apex = b.y;
    if ((px - NET_X) * dir < 0 && (b.x - NET_X) * dir >= 0) {
      const t = (NET_X - px) / (b.x - px || 1);
      if (py + (b.y - py) * t > NET_TOP - margin) return { landX: b.x, clear: false, apexY: apex };
      crossed = true;
    }
    if (b.y >= GROUND - SHUTTLE_R) break;
  }
  return { landX: b.x, clear: crossed, apexY: apex };
}

export interface SolveInput {
  x: number;
  y: number;
  side: Side;
  speed: number;
  targetX: number;
  arc: 'flat' | 'high';
  margin: number;
}

interface Pass {
  tol: number;
  /** 是否限制平射弹道不能飞得太高 */
  limitFlat: boolean;
  mults: number[];
}

/**
 * 在给定速度下反解出发射角：保证过网、落到目标点附近。
 * flat 取最平的弹道（快、压迫），high 取最高的弹道（慢、深远）。
 * 若平射弹道物理上无法到达目标（例如后场吊网前），逐步放宽限制，最终变成高吊。
 */
export function solveShot(inp: SolveInput): { vx: number; vy: number } {
  const dir = sideSign(inp.side);
  const flat = inp.arc === 'flat';
  const mults = flat ? [1, 0.85, 0.7, 0.55, 0.42, 1.15, 1.4, 1.75] : [1, 1.15, 1.35, 1.6, 1.9, 2.3, 2.8];
  const passes: Pass[] = [
    { tol: 38, limitFlat: true, mults },
    { tol: 90, limitFlat: true, mults },
    { tol: 90, limitFlat: false, mults: flat ? [1, 0.7, 0.45, 1.3] : mults },
    { tol: Infinity, limitFlat: false, mults: [1, 0.7, 1.3] },
  ];
  const flatApexLimit = Math.min(inp.y, NET_TOP - inp.margin) - 110;

  for (const pass of passes) {
    for (const m of pass.mults) {
      const speed = Math.min(inp.speed * m, 20000);
      let best: { ang: number; err: number } | null = null;
      for (let a = -62; a <= 86; a += 0.5) {
        const rad = (a * Math.PI) / 180;
        const vx = Math.cos(rad) * speed * dir;
        const vy = -Math.sin(rad) * speed;
        const r = trial(inp.x, inp.y, vx, vy, inp.side, inp.margin + SAFETY);
        if (!r.clear) continue;
        if (!flat && r.apexY < 40) continue;
        if (flat && pass.limitFlat && r.apexY < flatApexLimit) continue;
        const err = Math.abs(r.landX - inp.targetX);
        if (err > pass.tol) continue;
        if (!best) best = { ang: a, err };
        else if (pass.tol === Infinity) {
          if (err < best.err) best = { ang: a, err };
        } else if (flat ? a < best.ang : a > best.ang) best = { ang: a, err };
      }
      if (best) {
        const rad = (best.ang * Math.PI) / 180;
        return { vx: Math.cos(rad) * speed * dir, vy: -Math.sin(rad) * speed };
      }
    }
  }
  // 兜底：50° 抛射
  const rad = (50 * Math.PI) / 180;
  return { vx: Math.cos(rad) * 2200 * dir, vy: -Math.sin(rad) * 2200 };
}

/** 预测球落点与经过指定高度的位置（给 AI 用） */
export function predict(
  from: Body,
  opts: { atY?: number; maxT?: number; wrap?: boolean } = {},
): { x: number; y: number; t: number; landed: boolean } {
  const b = { ...from };
  const maxT = opts.maxT ?? 4;
  let t = 0;
  while (t < maxT) {
    stepBody(b, STEP * 2);
    if (opts.wrap) {
      if (b.x < WRAP_L) b.x += WRAP_SPAN;
      else if (b.x > WRAP_R) b.x -= WRAP_SPAN;
    }
    t += STEP * 2;
    if (b.y >= GROUND - SHUTTLE_R) return { x: b.x, y: GROUND - SHUTTLE_R, t, landed: true };
    if (opts.atY !== undefined && b.vy > 0 && b.y >= opts.atY) return { x: b.x, y: b.y, t, landed: false };
  }
  return { x: b.x, y: b.y, t, landed: false };
}

/** 目标落点：depth 0 贴网，1 贴底线（随场地大小自动缩放） */
export function landingX(side: Side, depth: number, court: CourtDef): number {
  const half = courtHalf(court);
  const near = half * 0.12;
  const far = half * 0.92;
  const dist = near + depth * (far - near);
  return NET_X + sideSign(side) * dist;
}

export interface BlastInput {
  x: number;
  y: number;
  side: 0 | 1;
  /** 期望的出手速度（用来推算「物理允许的平射基准速度」） */
  speed: number;
  court: { l: number; r: number };
  /** 必须落在对方场内（默认 true）；false 时只要求过网（超级反弹） */
  mustLand?: boolean;
  targetX?: number;
  /** 加速倍率上限：蓄力越满给得越高，越大越离谱 */
  kMax?: number;
  /** 出球后立刻进入「无视空气阻力」状态（超级反弹），过网要留更多余量 */
  free?: boolean;
}

export interface Blast {
  vx: number;
  vy: number;
  /** 阻力倍率：速度越快阻力越大，落点才不会离谱到出界 */
  dragMul: number;
}

interface BlastTrial {
  ok: boolean;
  vx: number;
  vy: number;
  /** 弹道最高点相对出手点抬升了多少（越小越平） */
  rise: number;
  land: number;
}

/** 暴力弹道的出手速度上限（再高就只是屏幕闪一下了） */
const BLAST_SPEED_MAX = 45000;

/** 先扫平射角度，再放宽到高抛 */
const FLAT_DEGS: number[] = [];
for (let d = -16; d <= 24; d += 2) FLAT_DEGS.push(d);
const WIDE_DEGS: number[] = [];
for (let d = -34; d <= 66; d += 4) WIDE_DEGS.push(d);

/**
 * 「离谱」高速出球。
 *
 * 现实里球越快飞得越远，想又快又落进场地就得上高抛 —— 一点不帅。
 * 这里换个玩法：把初速乘 k 倍、阻力只乘 2 倍左右。
 * 前 0.1 秒球是以几万 px/s 冲出去的残影（一步就过网），
 * 随即被空气拖住，慢慢飘到对方场地里 —— 又快又能算好球。
 */
export function solveBlast(inp: BlastInput): Blast {
  const dir = sideSign(inp.side);
  const mustLand = inp.mustLand !== false;
  const kMax = Math.max(1, inp.kMax ?? 4);
  const dt = 1 / 240;
  const SIM = 520;
  const wrapL = WRAP_L;
  const wrapR = WRAP_R;
  const span = WRAP_SPAN;

  const clearMargin = inp.free ? 70 : 4;
  const fire = (vx: number, vy: number, dragMul: number): BlastTrial => {
    const b: Body = { x: inp.x, y: inp.y, vx, vy, dragMul, star: inp.free };
    let apex = inp.y;
    let crossed = false;
    let land = inp.x;
    for (let i = 0; i < SIM; i++) {
      const px = b.x;
      const py = b.y;
      stepBody(b, dt);
      // 恶搞模式两侧空气墙是通的
      if (b.x < wrapL) b.x += span;
      else if (b.x > wrapR) b.x -= span;
      if (b.y < apex) apex = b.y;
      if ((px - NET_X) * (b.x - NET_X) < 0) {
        const t = (NET_X - px) / (b.x - px || 1);
        if (py + (b.y - py) * t > NET_TOP - clearMargin) return { ok: false, vx, vy, rise: 0, land: 0 };
        crossed = true;
      }
      land = b.x;
      if (b.y >= GROUND - SHUTTLE_R) break;
      if (b.y < -300) break;
    }
    const inCourt = land * dir > NET_X * dir && land >= inp.court.l && land <= inp.court.r;
    const inHalf = land * dir > NET_X * dir;
    const ok = crossed && (mustLand ? inCourt : inHalf);
    return { ok, vx, vy, rise: inp.y - apex, land };
  };

  /** 给定初速与阻力，挑一条既合法又尽量平的弹道 */
  const pick = (speed: number, dragMul: number): BlastTrial | null => {
    for (const degs of [mustLand ? FLAT_DEGS : WIDE_DEGS, WIDE_DEGS]) {
      let best: BlastTrial | null = null;
      for (const deg of degs) {
        const rad = (deg * Math.PI) / 180;
        const r = fire(Math.cos(rad) * speed * dir, -Math.sin(rad) * speed, dragMul);
        if (!r.ok) continue;
        const err = inp.targetX === undefined ? 0 : Math.abs(r.land - inp.targetX);
        if (!best) {
          best = r;
          continue;
        }
        const bestErr = inp.targetX === undefined ? 0 : Math.abs(best.land - inp.targetX);
        if (r.rise < best.rise - 12 || (Math.abs(r.rise - best.rise) <= 12 && err < bestErr)) best = r;
      }
      if (best) return best;
    }
    return null;
  };

  // 基准速度：普通阻力下能平射进对方场地的速度（跟着击球高度自动变）
  let baseSpeed = 0;
  let flatBase: BlastTrial | null = null;
  for (let tier = 0; tier < 9 && !flatBase; tier++) {
    const r = pick(inp.speed * Math.pow(0.82, tier), 1);
    if (!r) continue;
    if (r.rise <= 165 || tier >= 8) {
      flatBase = r;
      baseSpeed = Math.hypot(r.vx, r.vy);
    }
  }
  if (!flatBase) baseSpeed = inp.speed * 0.4;

  // 从满蓄力的倍率往下试，找到能成立的最高速度档
  for (let i = 0; i < 9; i++) {
    const k = kMax - (kMax - 1) * (i / 8);
    const speed = Math.min(baseSpeed * k, BLAST_SPEED_MAX);
    for (const dragMul of [2, 2.6, 3.4, 4.4, 1.6, 1.2]) {
      const r = pick(speed, dragMul);
      if (r) return { vx: r.vx, vy: r.vy, dragMul };
    }
  }
  if (flatBase) return { vx: flatBase.vx, vy: flatBase.vy, dragMul: 1 };
  const v = solveShot({
    x: inp.x, y: inp.y, side: inp.side,
    speed: inp.speed * 0.5,
    targetX: inp.targetX ?? NET_X + dir * 220,
    arc: 'flat', margin: 26,
  });
  return { ...v, dragMul: 1 };
}
