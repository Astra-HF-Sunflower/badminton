export type ShotId =
  | 'clear'
  | 'smash'
  | 'drop'
  | 'drive'
  | 'lift'
  | 'net'
  | 'flick'
  | 'jumpSmash'
  | 'cut';

export type FxKind = 'wind' | 'fire' | 'leaf' | 'bolt' | 'bubble' | 'swirl' | 'slash' | 'thunder' | 'crescent';

/** 击球分类：basic = 普通模式可见的基础击球，pro = 专业模式追加的进阶击球 */
export type ShotTier = 'basic' | 'pro';

export interface ShotDef {
  id: ShotId;
  tier: ShotTier;
  name: string;
  en: string;
  desc: string;
  /** 小键盘按键 / 双人模式下 P1 对应的镜像按键 */
  numpad: string;
  alt: string;
  keyLabel: string;
  altLabel: string;
  /** 图例里的网格位置 */
  row: number;
  col: number;
  points: number;
  color: string;
  /** 出手初速度、落点深度(0=网前, 1=底线)、弹道形态 */
  speed: number;
  depth: number;
  arc: 'flat' | 'high';
  /** 过网余量 (px)，网前小球更贴网 */
  margin: number;
  /** 挥拍总时长、击球时刻(占比)、起跳延迟 */
  duration: number;
  strike: number;
  delay: number;
  /** 理想击球高度范围（相对脚底，px） */
  zone: [number, number];
  fx: FxKind;
  shake: number;
  hitStop: number;
  slowmo: number;
  spin: number;
}

export const SHOTS: ShotDef[] = [
  {
    id: 'clear', tier: 'basic', name: '高远球', en: 'Clear', desc: '又高又远，把对手压到底线',
    numpad: 'Numpad7', alt: 'KeyU', keyLabel: '7', altLabel: 'U', row: 0, col: 0,
    points: 1, color: '#5ec8ff', speed: 2800, depth: 0.93, arc: 'high', margin: 30,
    duration: 0.46, strike: 0.36, delay: 0, zone: [110, 420],
    fx: 'wind', shake: 0, hitStop: 0, slowmo: 0, spin: 0,
  },
  {
    id: 'smash', tier: 'basic', name: '杀球', en: 'Smash', desc: '全力下压，速度最快的得分手段',
    numpad: 'Numpad8', alt: 'KeyI', keyLabel: '8', altLabel: 'I', row: 0, col: 1,
    points: 3, color: '#ff5a4d', speed: 3300, depth: 0.58, arc: 'flat', margin: 24,
    duration: 0.44, strike: 0.38, delay: 0, zone: [150, 420],
    fx: 'fire', shake: 9, hitStop: 0.055, slowmo: 0.2, spin: 0,
  },
  {
    id: 'drop', tier: 'pro', name: '吊球', en: 'Drop', desc: '轻柔过网，落点贴近网前',
    numpad: 'Numpad9', alt: 'KeyO', keyLabel: '9', altLabel: 'O', row: 0, col: 2,
    points: 2, color: '#9be564', speed: 1050, depth: 0.16, arc: 'flat', margin: 26,
    duration: 0.46, strike: 0.36, delay: 0, zone: [110, 420],
    fx: 'leaf', shake: 0, hitStop: 0, slowmo: 0, spin: 2,
  },
  {
    id: 'drive', tier: 'basic', name: '平抽球', en: 'Drive', desc: '贴网平射，节奏极快',
    numpad: 'Numpad4', alt: 'KeyJ', keyLabel: '4', altLabel: 'J', row: 1, col: 0,
    points: 2, color: '#ffd23f', speed: 2700, depth: 0.7, arc: 'flat', margin: 22,
    duration: 0.36, strike: 0.38, delay: 0, zone: [50, 210],
    fx: 'slash', shake: 3, hitStop: 0.03, slowmo: 0, spin: 0,
  },
  {
    id: 'lift', tier: 'basic', name: '挑球', en: 'Lift', desc: '从低处挑起高球，用来防守',
    numpad: 'Numpad5', alt: 'KeyK', keyLabel: '5', altLabel: 'K', row: 1, col: 1,
    points: 1, color: '#b583ff', speed: 2500, depth: 0.95, arc: 'high', margin: 30,
    duration: 0.42, strike: 0.38, delay: 0, zone: [0, 120],
    fx: 'bubble', shake: 0, hitStop: 0, slowmo: 0, spin: 0,
  },
  {
    id: 'net', tier: 'pro', name: '搓球', en: 'Net Shot', desc: '网前细腻搓放，球翻滚过网',
    numpad: 'Numpad6', alt: 'KeyL', keyLabel: '6', altLabel: 'L', row: 1, col: 2,
    points: 2, color: '#ff7eb6', speed: 520, depth: 0.04, arc: 'flat', margin: 18,
    duration: 0.4, strike: 0.4, delay: 0, zone: [0, 150],
    fx: 'swirl', shake: 0, hitStop: 0, slowmo: 0, spin: 22,
  },
  {
    id: 'flick', tier: 'pro', name: '弹击', en: 'Flick', desc: '手腕一抖，快速突袭对方后场',
    numpad: 'Numpad1', alt: 'KeyM', keyLabel: '1', altLabel: 'M', row: 2, col: 0,
    points: 2, color: '#35f0d0', speed: 2800, depth: 0.88, arc: 'flat', margin: 24,
    duration: 0.32, strike: 0.4, delay: 0, zone: [40, 190],
    fx: 'crescent', shake: 2, hitStop: 0.02, slowmo: 0, spin: 0,
  },
  {
    id: 'jumpSmash', tier: 'pro', name: '跳杀', en: 'Jump Smash', desc: '腾空爆扣，威力最大、得分最高',
    numpad: 'Numpad2', alt: 'Comma', keyLabel: '2', altLabel: ',', row: 2, col: 1,
    points: 4, color: '#ffa31a', speed: 4000, depth: 0.52, arc: 'flat', margin: 24,
    duration: 0.42, strike: 0.4, delay: 0.14, zone: [230, 470],
    fx: 'thunder', shake: 16, hitStop: 0.085, slowmo: 0.3, spin: 0,
  },
  {
    id: 'cut', tier: 'pro', name: '劈吊', en: 'Slice', desc: '侧切拍面，急坠落在中前场',
    numpad: 'Numpad3', alt: 'Period', keyLabel: '3', altLabel: '.', row: 2, col: 2,
    points: 2, color: '#ff6bd6', speed: 1900, depth: 0.33, arc: 'flat', margin: 26,
    duration: 0.42, strike: 0.38, delay: 0, zone: [120, 420],
    fx: 'crescent', shake: 4, hitStop: 0.035, slowmo: 0, spin: 6,
  },
];

export const SHOT_BY_ID = Object.fromEntries(SHOTS.map((s) => [s.id, s])) as Record<ShotId, ShotDef>;

/** 发球：高远发球 / 网前短发球 */
export const SERVES = {
  high: { speed: 2000, depth: 0.82, arc: 'high' as const, margin: 30 },
  short: { speed: 900, depth: 0.2, arc: 'flat' as const, margin: 24 },
};

/* ————————————————— 玩法模式（普通 / 专业） ————————————————— */

export type PlayStyle = 'casual' | 'pro';

export interface PlayStyleDef {
  id: PlayStyle;
  label: string;
  en: string;
  sub: string;
  desc: string;
  /** 发球提示文案 */
  serveHint: string;
}

export const PLAYSTYLES: PlayStyleDef[] = [
  {
    id: 'casual',
    label: '普通模式',
    en: 'Casual',
    sub: '4 种基础击球',
    desc: '高远球 · 杀球 · 平抽球 · 挑球',
    serveHint: '平抽球 = 短发球 · 其余 = 高远发球',
  },
  {
    id: 'pro',
    label: '专业模式',
    en: 'Pro',
    sub: '9 种进阶击球',
    desc: '九种击球全开，增加吊球、搓球、弹击、跳杀、劈吊',
    serveHint: '搓球 / 吊球 / 劈吊 / 弹击 = 短发球 · 其余 = 高远发球',
  },
];

export const PLAYSTYLE_BY_ID = Object.fromEntries(PLAYSTYLES.map((p) => [p.id, p])) as Record<PlayStyle, PlayStyleDef>;
export const playStyleOf = (style: PlayStyle): PlayStyleDef => PLAYSTYLE_BY_ID[style];

/** 普通模式下开放的基础击球 */
export const BASIC_SHOT_IDS: ShotId[] = ['clear', 'smash', 'drive', 'lift'];

/** 该玩法模式可用的击球（顺序沿用 SHOTS，键位与专业模式一致，切模式不用重新记键位） */
export const shotsFor = (style: PlayStyle): ShotDef[] =>
  style === 'pro' ? SHOTS : SHOTS.filter((s) => s.tier === 'basic');

export const shotIdsFor = (style: PlayStyle): ShotId[] => shotsFor(style).map((s) => s.id);

/** 短发球的击球键：普通模式用平抽球，专业模式用网前手感球 */
export const SERVE_SHORT_SHOTS: ShotId[] = ['net', 'drop', 'cut', 'flick'];
export const SERVE_SHORT_SHOTS_CASUAL: ShotId[] = ['drive'];
export const serveShortShots = (style: PlayStyle): ShotId[] =>
  style === 'casual' ? SERVE_SHORT_SHOTS_CASUAL : SERVE_SHORT_SHOTS;
