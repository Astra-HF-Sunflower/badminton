import { DRAG, GRAVITY, GROUND, NET_TOP, NET_X, SHUTTLE_R, STEP, Side, sideSign } from './constants';
import { CourtDef, courtHalf } from './court';

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 阻力倍率：恶搞招式用它造出「速度离谱但落点照旧」的弹道 */
  dragMul?: number;
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
  const drag = DRAG * (b.dragMul ?? 1);
  b.vx += -drag * sp * b.vx * dt;
  b.vy += (GRAVITY * gravityScale - drag * sp * b.vy) * dt;
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
  opts: { atY?: number; maxT?: number } = {},
): { x: number; y: number; t: number; landed: boolean } {
  const b = { ...from };
  const maxT = opts.maxT ?? 4;
  let t = 0;
  while (t < maxT) {
    stepBody(b, STEP * 2);
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
  /** 期望的出手速度：会逐档下调，直到找得到能打进场地的那一条弹道 */
  speed: number;
  court: { l: number; r: number };
  /** 必须落在对方场内（默认 true）；false 时只要求过网（超级反弹） */
  mustLand?: boolean;
  targetX?: number;
}

export interface Blast {
  vx: number;
  vy: number;
  /** 阻力倍率（速度越快阻力越大，落点才不会离谱到出界） */
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

/**
 * 「离谱」高速出球。
 *
 * 现实里球速越快飞得越远，想又快又不冲出底线就得上高抛 —— 一点不帅。
 * 这里换个玩法：先把弹道算成一条正常的平射，再把初速放大 k 倍、
 * 阻力也放大 k 倍。二次阻力的尺度和初速同倍放大，落点几乎不变，
 * 但球一出手就是 k 倍速的残影，然后急速减速砸进对方场内。
 */
export function solveBlast(inp: BlastInput): Blast {
  const dir = sideSign(inp.side);
  const mustLand = inp.mustLand !== false;
  const dt = 1 / 240;
  const SIM_STEPS = 520;

  const fire = (vx: number, vy: number, dragMul: number, courtCheck: boolean): BlastTrial => {
    const b: Body = { x: inp.x, y: inp.y, vx, vy, dragMul };
    let apex = inp.y;
    let crossed = false;
    let land = inp.x;
    for (let i = 0; i < SIM_STEPS; i++) {
      const px = b.x;
      const py = b.y;
      stepBody(b, dt);
      if (b.y < apex) apex = b.y;
      if ((px - NET_X) * (b.x - NET_X) < 0) {
        const t = (NET_X - px) / (b.x - px || 1);
        if (py + (b.y - py) * t > NET_TOP - 4) return { ok: false, vx, vy, rise: 0, land: 0 };
        crossed = true;
      }
      land = b.x;
      if (b.y >= GROUND - SHUTTLE_R) break;
      if (b.x < -400 || b.x > 2400 || b.y < -200) break;
    }
    const inCourt = land * dir > NET_X * dir && land >= inp.court.l && land <= inp.court.r;
    const ok = crossed && (courtCheck ? inCourt : true);
    return { ok, vx, vy, rise: inp.y - apex, land };
  };

  /** 某速度档下、最平且落点最贴目标的一条弹道 */
  const scan = (speed: number): BlastTrial | null => {
    let best: BlastTrial | null = null;
    for (let deg = -42; deg <= 76; deg += 2) {
      const rad = (deg * Math.PI) / 180;
      const r = fire(Math.cos(rad) * speed * dir, -Math.sin(rad) * speed, 1, mustLand);
      if (!r.ok) continue;
      const err = inp.targetX === undefined ? 0 : Math.abs(r.land - inp.targetX);
      if (!best) {
        best = r;
        continue;
      }
      const bestErr = inp.targetX === undefined ? 0 : Math.abs(best.land - inp.targetX);
      if (r.rise < best.rise - 12 || (Math.abs(r.rise - best.rise) <= 12 && err < bestErr)) best = r;
    }
    return best;
  };

  let steep: BlastTrial | null = null;
  let flat: BlastTrial | null = null;
  for (let tier = 0; tier < 8 && !flat; tier++) {
    const shot = scan(inp.speed * Math.pow(0.82, tier));
    if (!shot) continue;
    if (shot.rise <= 165) {
      flat = shot;
      break;
    }
    if (!steep) steep = shot; // 先记一条高抛的兜底，继续找更平的
  }
  const base = flat ?? steep;
  if (!base) {
    const v = solveShot({
      x: inp.x, y: inp.y, side: inp.side,
      speed: inp.speed * 0.5,
      targetX: inp.targetX ?? NET_X + dir * 220,
      arc: 'flat', margin: 26,
    });
    return { ...v, dragMul: 1 };
  }
  // 逐档加速，直到「再快就飞出去」为止
  let best: Blast = { vx: base.vx, vy: base.vy, dragMul: 1 };
  for (const k of [4, 3.4, 2.8, 2.3, 1.8, 1.4, 1.2]) {
    const r = fire(base.vx * k, base.vy * k, k, mustLand);
    if (!r.ok) continue;
    best = { vx: base.vx * k, vy: base.vy * k, dragMul: k };
    break;
  }
  return best;
}
