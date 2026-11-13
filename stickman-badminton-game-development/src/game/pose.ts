import { GROUND, PLAYER, clamp, lerp, smooth } from './constants';
import { readyPose, sampleSwing, ArmPose } from './swings';
import type { Player } from './player';

export interface Vec {
  x: number;
  y: number;
}

export interface Pose {
  hip: Vec;
  shoulder: Vec;
  head: Vec;
  elbowR: Vec;
  handR: Vec;
  racketHead: Vec;
  racketAngle: number; // 世界坐标下球拍朝向
  elbowL: Vec;
  handL: Vec;
  kneeA: Vec;
  footA: Vec;
  kneeB: Vec;
  footB: Vec;
}

export const ARM_UPPER = 36;
export const ARM_FORE = 34;
const THIGH = PLAYER.legLen / 2;
const T = PLAYER.torso;
const TAU = Math.PI * 2;

const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/** 两节骨骼 IK，prefer 决定选择哪一个关节解（膝盖朝前 / 肘部朝下） */
function ik(a: Vec, t: Vec, l1: number, l2: number, prefer: (k: Vec) => number) {
  const dx = t.x - a.x;
  const dy = t.y - a.y;
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.01);
  const base = Math.atan2(dy, dx);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  let best: Vec | null = null;
  for (const s of [1, -1]) {
    const k = { x: a.x + Math.cos(base + s * A) * l1, y: a.y + Math.sin(base + s * A) * l1 };
    if (!best || prefer(k) > prefer(best)) best = k;
  }
  return { mid: best as Vec, end: { x: a.x + Math.cos(base) * d, y: a.y + Math.sin(base) * d } };
}

/** 球拍对准来球的权重：击球瞬间附近为 1 */
export function aimWeight(u: number, strike: number) {
  return smooth(1 - Math.max(0, Math.abs(u - strike) - 0.04) / 0.14);
}

export function computePose(p: Player, dt: number): Pose {
  const f = p.facing;
  const sw = p.swing;
  const run = clamp(Math.abs(p.vx) / PLAYER.speed, 0, 1);
  const air = p.z > 1;

  let arm: ArmPose;
  let u = -1;
  if (sw && sw.t >= 0) {
    u = sw.t / sw.dur;
    arm = sampleSwing(sw.key, u);
  } else {
    arm = readyPose();
    arm.os += Math.sin(p.runPhase) * run * 0.9;
    arm.sh += Math.sin(p.runPhase + 1) * run * 0.12;
    arm.lean += Math.sin(p.time * 2.2) * 0.012;
    if (sw) arm.crouch += 12; // 起跳蓄力
  }

  // —— 身体 ——
  const leanTarget = arm.lean + clamp((p.vx * f) / PLAYER.speed, -1, 1) * 0.12 + (air ? -clamp(p.vz / 2500, -0.2, 0.2) : 0);
  const crouchTarget = arm.crouch + p.landSquash * 18 + (air ? 0 : run * 4);
  const k = 1 - Math.exp(-dt * 24);
  p.leanSm = lerp(p.leanSm, leanTarget, k);
  p.crouchSm = lerp(p.crouchSm, crouchTarget, k);

  const hip = { x: p.x, y: GROUND - p.z - PLAYER.legLen + p.crouchSm };
  const shoulder = { x: hip.x + Math.sin(p.leanSm) * f * T, y: hip.y - Math.cos(p.leanSm) * T };
  const head = { x: shoulder.x + Math.sin(p.leanSm) * f * 26, y: shoulder.y - Math.cos(p.leanSm) * 26 };

  // —— 持拍手臂（击球瞬间用 IK 让球拍精确触到球）——
  let { sh, el, wr } = arm;
  if (sw && sw.aim && u >= 0) {
    const w = aimWeight(u, sw.strike);
    if (w > 0) {
      const dx = (sw.aim.x - shoulder.x) * f;
      const dy = sw.aim.y - shoulder.y;
      const L = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const handD = clamp(L - PLAYER.racketCenter, 14, ARM_UPPER + ARM_FORE - 1);
      const r = ik({ x: 0, y: 0 }, { x: Math.cos(ang) * handD, y: Math.sin(ang) * handD }, ARM_UPPER, ARM_FORE, (q) => q.y);
      const shA = Math.atan2(r.mid.y, r.mid.x);
      const faA = Math.atan2(r.end.y - r.mid.y, r.end.x - r.mid.x);
      sh += wrap(shA - sh) * w;
      el += wrap(wrap(faA - shA) - el) * w;
      wr += wrap(wrap(ang - faA) - wr) * w;
    }
  }
  const dirOf = (a: number): Vec => ({ x: Math.cos(a) * f, y: Math.sin(a) });
  const dSh = dirOf(sh);
  const elbowR = { x: shoulder.x + dSh.x * ARM_UPPER, y: shoulder.y + dSh.y * ARM_UPPER };
  const dFa = dirOf(sh + el);
  const handR = { x: elbowR.x + dFa.x * ARM_FORE, y: elbowR.y + dFa.y * ARM_FORE };
  const rk = sh + el + wr;
  const dRk = dirOf(rk);
  const racketHead = { x: handR.x + dRk.x * PLAYER.racketCenter, y: handR.y + dRk.y * PLAYER.racketCenter };
  const racketAngle = Math.atan2(dRk.y, dRk.x);

  // —— 另一只手 ——
  const dOs = dirOf(arm.os);
  const elbowL = { x: shoulder.x + dOs.x * ARM_UPPER, y: shoulder.y + dOs.y * ARM_UPPER };
  const dOe = dirOf(arm.os + arm.oe);
  const handL = { x: elbowL.x + dOe.x * ARM_FORE, y: elbowL.y + dOe.y * ARM_FORE };

  // —— 腿 ——
  const lunge = Math.max(0, p.crouchSm - 10) * 0.9;
  let tA: Vec;
  let tB: Vec;
  if (!air) {
    const stride = 46 * run;
    const lift = 24 * run;
    const idleA = hip.x + f * (16 + lunge);
    const idleB = hip.x - f * (16 + lunge * 0.55);
    const ph = p.runPhase;
    const runA = hip.x + f * Math.sin(ph) * stride;
    const runB = hip.x + f * Math.sin(ph + Math.PI) * stride;
    tA = { x: lerp(idleA, runA, run), y: GROUND - Math.max(0, Math.cos(ph)) * lift * run };
    tB = { x: lerp(idleB, runB, run), y: GROUND - Math.max(0, Math.cos(ph + Math.PI)) * lift * run };
  } else {
    const ext = clamp(0.5 - p.vz / 2200, 0.32, 0.95);
    const len = PLAYER.legLen * ext;
    const scissor = sw && u > 0.25 && u < 0.7 ? 1 : 0; // 杀球时双腿前后交叉
    tA = { x: hip.x + f * (20 + scissor * 14), y: hip.y + len };
    tB = { x: hip.x - f * (18 + scissor * 24), y: hip.y + len * (0.9 - scissor * 0.12) };
  }
  const legPref = (q: Vec) => (q.x - hip.x) * f;
  const la = ik(hip, tA, THIGH, THIGH, legPref);
  const lb = ik(hip, tB, THIGH, THIGH, legPref);

  return {
    hip, shoulder, head, elbowR, handR, racketHead, racketAngle, elbowL, handL,
    kneeA: la.mid, footA: la.end, kneeB: lb.mid, footB: lb.end,
  };
}
