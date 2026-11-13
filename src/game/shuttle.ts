import type { Side } from './constants';
import type { Body } from './physics';
import type { ShotDef } from './shots';

export interface Shuttle extends Body {
  /** 朝向（球头方向）与自旋 */
  angle: number;
  spin: number;
  /** 发球前被谁持球 */
  held: Side | null;
  lastHitter: Side | null;
  lastShot: ShotDef | null;
  perfect: boolean;
  poor: boolean;
  /** 球轨迹拖尾 */
  trail: { x: number; y: number; age: number }[];
  trailAcc: number;
  bounced: boolean;
  /** 恶搞模式「超级反弹」剩余疯狂时间（秒） */
  chaos: number;
  /** 上一步刚穿过空气墙，跳过过网判定 */
  wrapped?: boolean;
}

export const createShuttle = (): Shuttle => ({
  x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0, held: null, lastHitter: null, lastShot: null,
  perfect: false, poor: false, trail: [], trailAcc: 0, bounced: false, chaos: 0,
});
