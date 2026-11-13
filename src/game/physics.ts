import { DRAG, GRAVITY, GROUND, NET_TOP, NET_X, SHUTTLE_R, STEP, Side, sideSign } from './constants';
import { CourtDef, courtHalf } from './court';

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
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
  b.vx += -DRAG * sp * b.vx * dt;
  b.vy += (GRAVITY * gravityScale - DRAG * sp * b.vy) * dt;
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
      const speed = Math.min(inp.speed * m, 5200);
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
