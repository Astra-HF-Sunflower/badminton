/** 角色与专属技能 */

export type CharacterId = 'none' | 'world' | 'crescent' | 'heaven';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  en: string;
  color: string;
  /** 技能名 */
  skill: string;
  desc: string;
  /** 技能持续时间（秒） */
  duration: number;
  /** 技能冷却（秒，从发动开始算） */
  cooldown: number;
}

/** 每个玩家的技能状态 */
export interface SkillState {
  /** 剩余持续时间 */
  active: number;
  /** 剩余冷却 */
  cooldown: number;
  /** 世界：时间停止期间积攒的挥拍次数 */
  accum: number;
  /** 天堂制造：当前倍率 */
  level: number;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'none',
    name: '无名',
    en: 'Rookie',
    color: '#94a3b8',
    skill: '无技能',
    desc: '没有特殊能力，纯靠手法和跑位',
    duration: 0,
    cooldown: 0,
  },
  {
    id: 'world',
    name: '世界',
    en: 'The World',
    color: '#a78bfa',
    skill: '时间停止',
    desc: '暂停时间 5 秒：球和对手都被冻住，你可以连续挥拍蓄力，时间恢复的瞬间全部倾泻而出',
    duration: 5,
    cooldown: 24,
  },
  {
    id: 'crescent',
    name: '新月',
    en: 'Crescent',
    color: '#67e8f9',
    skill: '失重',
    desc: '30 秒低重力：人和球都开始漂浮，球落地依旧判负',
    duration: 30,
    cooldown: 36,
  },
  {
    id: 'heaven',
    name: '天堂制造',
    en: 'Made in Heaven',
    color: '#fbbf24',
    skill: '时间加速',
    desc: '30 秒加速时间，可切换 ×2 / ×4 / ×5：你的移动和球速一起变快，对手不受影响',
    duration: 30,
    cooldown: 36,
  },
];

export const CHARACTER_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c])) as Record<CharacterId, CharacterDef>;
export const characterOf = (id: CharacterId): CharacterDef => CHARACTER_BY_ID[id];

/** 技能按键：单人 / P1 用 Q，双人 P2 用右 Shift */
export const SKILL_KEYS: [string[], string[]] = [['KeyQ'], ['ShiftRight']];
/** 恶搞模式「接球」按键：P1 用 C，P2 用小键盘回车 */
export const CATCH_KEYS: [string[], string[]] = [['KeyC'], ['NumpadEnter']];

/** 天堂制造可切换的加速倍率 */
export const HEAVEN_LEVELS = [2, 4, 5];

/** 失重时的重力系数 */
export const CRESCENT_GRAVITY = 0.34;

export const skillKeyLabel = (side: 0 | 1): string => (side === 0 ? 'Q' : '右 Shift');
export const catchKeyLabel = (side: 0 | 1): string => (side === 0 ? 'C' : '小键盘 Enter');
