/** 世界坐标系：1600 x 900 逻辑像素，y 轴向下，约 100px = 1m */
export const W = 1600;
export const H = 900;

export const GROUND = 700; // 球员脚底所在的“地面线”
export const NET_X = 800;
export const NET_H = 160;
export const NET_TOP = GROUND - NET_H;
export const COURT_L = 130;
export const COURT_R = 1470;

/** 羽毛球物理：重力 + 二次空气阻力（落地陡、出手快后迅速减速） */
export const GRAVITY = 1100;
export const DRAG = 0.0022;
export const SHUTTLE_R = 9;
export const STEP = 1 / 120; // 固定物理步长

export const PLAYER = {
  speed: 560,
  groundAccel: 3800,
  airAccel: 1700,
  jumpV: 980,
  gravity: 2700,
  /** 肩膀到球的最大击球距离 */
  reach: 142,
  legLen: 84,
  torso: 58,
  racketCenter: 58,
  homeX: [380, 1220] as const,
};

export type Side = 0 | 1;
export const opponent = (s: Side): Side => (s === 0 ? 1 : 0);
export const sideSign = (s: Side): 1 | -1 => (s === 0 ? 1 : -1);

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);
