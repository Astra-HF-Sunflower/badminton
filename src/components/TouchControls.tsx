import type { PointerEvent } from 'react';
import type { ShotDef } from '../game/shots';

interface Props {
  onKey: (code: string, down: boolean) => void;
  /** 当前玩法模式可用的击球 */
  shots: ShotDef[];
}

function Btn({
  code, onKey, className = '', style, children,
}: {
  code: string;
  onKey: Props['onKey'];
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const down = (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onKey(code, true);
  };
  const up = (e: PointerEvent) => {
    e.preventDefault();
    onKey(code, false);
  };
  return (
    <button
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
      className={`touch-none select-none rounded-2xl border border-white/20 font-black backdrop-blur active:scale-95 active:brightness-125 ${className}`}
      style={style}
    >
      {children}
    </button>
  );
}

/** 触屏虚拟按键（仅单人模式） */
export function TouchControls({ onKey, shots }: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between p-3 sm:p-5">
      <div className="pointer-events-auto flex items-end gap-2">
        <Btn code="ArrowLeft" onKey={onKey} className="h-16 w-16 bg-white/15 text-2xl text-white">◀</Btn>
        <Btn code="ArrowRight" onKey={onKey} className="h-16 w-16 bg-white/15 text-2xl text-white">▶</Btn>
        <Btn code="ArrowUp" onKey={onKey} className="mb-12 ml-2 h-16 w-16 bg-white/15 text-sm text-white">跳</Btn>
        <Btn code="KeyC" onKey={onKey} className="mb-12 ml-2 h-16 w-16 bg-cyan-400/85 text-sm text-slate-900">接</Btn>
        <Btn code="KeyQ" onKey={onKey} className="mb-28 ml-2 h-12 w-12 bg-fuchsia-400/85 text-xs text-slate-900">技</Btn>
      </div>
      <div className="pointer-events-auto grid grid-cols-3 gap-1.5">
        {shots.map((s) => (
          <Btn
            key={s.id}
            code={s.numpad}
            onKey={onKey}
            className="h-14 w-14 text-xs text-slate-900 sm:h-16 sm:w-16 sm:text-sm"
            style={{ background: s.color, gridRow: s.row + 1, gridColumn: s.col + 1, opacity: 0.88 }}
          >
            {s.name}
          </Btn>
        ))}
      </div>
    </div>
  );
}
