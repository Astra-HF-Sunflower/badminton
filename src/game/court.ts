import { NET_X, Side, sideSign } from './constants';

/**
 * 场地大小
 * 网恒在正中，只改两侧边线的位置；玩家活动范围、AI 落点预测、球场绘制
 * 全部从这里读，所以换场地不用改任何其它逻辑。
 */
export type CourtSize = 'small' | 'medium' | 'large';

export interface CourtDef {
  id: CourtSize;
  label: string;
  sub: string;
  desc: string;
  /** 左 / 右边线（世界坐标） */
  l: number;
  r: number;
}

export const COURTS: CourtDef[] = [
  { id: 'small', label: '小场地', sub: '网前缠斗', desc: '半场更窄，来回飞快，全靠网前手感', l: 420, r: 1180 },
  { id: 'medium', label: '中场地', sub: '标准', desc: '标准半场，攻守均衡', l: 250, r: 1350 },
  { id: 'large', label: '大场地', sub: '跑起来', desc: '半场更宽，球路更容易拉到底线', l: 80, r: 1520 },
];

export const COURT_BY_ID = Object.fromEntries(COURTS.map((c) => [c.id, c])) as Record<CourtSize, CourtDef>;
export const courtOf = (id: CourtSize): CourtDef => COURT_BY_ID[id];

/** 半场宽度（网到底线） */
export const courtHalf = (c: CourtDef): number => (c.r - c.l) / 2;

/** 球员默认站位：在自己半场、离网 73% 半场宽处 */
export const courtHomeX = (c: CourtDef, side: Side): number => NET_X - sideSign(side) * courtHalf(c) * 0.73;
