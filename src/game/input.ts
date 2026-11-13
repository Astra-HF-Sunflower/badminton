import { PlayStyle, ShotId, shotsFor } from './shots';

export interface Keymap {
  left: string[];
  right: string[];
  jump: string[];
  shots: Map<string, ShotId>;
}

const shotMap = (style: PlayStyle, field: 'numpad' | 'alt', both = false) => {
  const m = new Map<string, ShotId>();
  for (const s of shotsFor(style)) {
    if (field === 'numpad' || both) m.set(s.numpad, s.id);
    if (field === 'alt' || both) m.set(s.alt, s.id);
  }
  return m;
};

/** 单人：小键盘 + 镜像键位都可用 */
export const soloKeys = (style: PlayStyle): Keymap => ({
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['KeyW', 'ArrowUp', 'Space', 'Numpad0'],
  shots: shotMap(style, 'numpad', true),
});
/** 双人 P1：WASD + UIO/JKL/M,. */
export const p1Keys = (style: PlayStyle): Keymap => ({
  left: ['KeyA'],
  right: ['KeyD'],
  jump: ['KeyW', 'Space'],
  shots: shotMap(style, 'alt'),
});
/** 双人 P2：方向键 + 数字小键盘 */
export const p2Keys = (style: PlayStyle): Keymap => ({
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  jump: ['ArrowUp', 'Numpad0'],
  shots: shotMap(style, 'numpad'),
});

const BLOCKED = /^(Arrow|Numpad|Space|Key[A-Z]|Comma|Period|Digit)/;

export class Input {
  private down = new Set<string>();
  private pressed: string[] = [];
  /** 暂停等全局按键回调 */
  onSystemKey?: (code: string) => void;

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (!e.repeat) this.onSystemKey?.(e.code);
      return;
    }
    if (BLOCKED.test(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.down.add(e.code);
    this.pressed.push(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };
  private onBlur = () => {
    this.down.clear();
  };

  attach() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }
  detach() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  /** 触屏虚拟按键使用同样的接口 */
  setDown(code: string, v: boolean) {
    if (v) {
      if (!this.down.has(code)) this.pressed.push(code);
      this.down.add(code);
    } else this.down.delete(code);
  }

  isDown(codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }

  /** 取出本帧该键位表触发的击球（只取最后一个，避免同帧乱按） */
  takeShot(map: Keymap): ShotId | null {
    let shot: ShotId | null = null;
    for (const c of this.pressed) {
      const id = map.shots.get(c);
      if (id) shot = id;
    }
    return shot;
  }
  takeJump(map: Keymap): boolean {
    return this.pressed.some((c) => map.jump.includes(c));
  }
  endFrame() {
    this.pressed.length = 0;
  }
}
