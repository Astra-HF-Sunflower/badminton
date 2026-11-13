import { ShotDef } from '../game/shots';

interface Props {
  field: 'keyLabel' | 'altLabel';
  title: string;
  accent: string;
  /** 该模式下可用的击球（普通模式只有 4 个） */
  shots: ShotDef[];
}

/** 小键盘风格的击球键位图 */
export function KeyGrid({ field, title, accent, shots }: Props) {
  const cols = Math.max(...shots.map((s) => s.col)) + 1;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="mb-2 text-xs font-bold tracking-wide" style={{ color: accent }}>
        {title}
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {shots.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-2 py-1.5"
            style={{ gridRow: s.row + 1, gridColumn: s.col + 1 }}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-black text-slate-900"
              style={{ background: s.color }}
            >
              {s[field]}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-extrabold text-slate-50">{s.name}</span>
              <span className="block text-[11px] font-bold" style={{ color: s.color }}>
                +{s.points} 分
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
