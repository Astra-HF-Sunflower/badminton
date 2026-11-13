import { useState } from 'react';
import type { Difficulty } from '../game/ai';
import type { GameOptions, Mode } from '../game/engine';
import { sfx } from '../game/audio';
import { SHOTS } from '../game/shots';
import { KeyGrid } from './KeyGrid';

interface Props {
  onStart: (o: GameOptions) => void;
  muted: boolean;
  onToggleMute: () => void;
}

function Seg<T extends string | number>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string; sub?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            onClick={() => {
              sfx.init();
              sfx.click();
              onChange(o.value);
            }}
            className={`flex-1 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ${
              active
                ? 'border-cyan-300/70 bg-cyan-300/15 shadow-[0_0_24px_-6px_rgba(103,232,249,0.7)]'
                : 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.08]'
            }`}
          >
            <div className={`text-sm font-extrabold ${active ? 'text-cyan-100' : 'text-slate-200'}`}>{o.label}</div>
            {o.sub && <div className="mt-0.5 text-[11px] text-slate-400">{o.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}

const Label = ({ children }: { children: string }) => (
  <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{children}</div>
);

export function Menu({ onStart, muted, onToggleMute }: Props) {
  const [mode, setMode] = useState<Mode>('single');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [target, setTarget] = useState(21);

  const start = () => {
    sfx.init();
    sfx.click();
    onStart({ mode, difficulty, target });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070d22] text-slate-100">
      {/* 背景光斑 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-10%] h-[520px] w-[520px] rounded-full bg-sky-500/20 blur-[120px]" />
        <div className="absolute -right-24 bottom-[-15%] h-[560px] w-[560px] rounded-full bg-rose-500/15 blur-[130px]" />
        <div className="absolute left-1/2 top-1/3 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-teal-400/10 blur-[110px]" />
      </div>

      <button
        onClick={() => {
          sfx.init();
          onToggleMute();
        }}
        className="absolute right-5 top-5 z-10 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold text-slate-200 backdrop-blur transition hover:bg-white/10"
      >
        {muted ? '🔇 已静音' : '🔊 音效开'}
      </button>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-8 px-6 py-10 lg:flex-row lg:items-center lg:gap-12">
        {/* 左：标题 + 设置 */}
        <div className="w-full lg:w-[44%]">
          <div className="mb-1 flex items-center gap-3">
            <ShuttleLogo />
            <span className="text-xs font-bold uppercase tracking-[0.35em] text-cyan-300/80">Stickman Badminton</span>
          </div>
          <h1 className="bg-gradient-to-br from-white via-sky-100 to-cyan-300 bg-clip-text text-5xl font-black leading-tight text-transparent sm:text-6xl">
            火柴人
            <br />
            羽毛球
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
            九种击球，各有专属挥拍、特效、音效与得分。抓住完美时机，用一记跳杀终结比赛。
          </p>

          <div className="mt-8 space-y-6">
            <div>
              <Label>游戏模式</Label>
              <Seg
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'single', label: '单人模式', sub: '挑战电脑对手' },
                  { value: 'double', label: '双人模式', sub: '同一键盘对战' },
                ]}
              />
            </div>
            {mode === 'single' && (
              <div>
                <Label>电脑难度</Label>
                <Seg
                  value={difficulty}
                  onChange={setDifficulty}
                  options={[
                    { value: 'easy', label: '轻松', sub: '反应较慢' },
                    { value: 'normal', label: '标准', sub: '攻守均衡' },
                    { value: 'hard', label: '地狱', sub: '预判极准' },
                  ]}
                />
              </div>
            )}
            <div>
              <Label>目标分数</Label>
              <Seg
                value={target}
                onChange={setTarget}
                options={[
                  { value: 11, label: '11 分', sub: '快速一局' },
                  { value: 21, label: '21 分', sub: '标准' },
                  { value: 31, label: '31 分', sub: '长局' },
                ]}
              />
            </div>
          </div>

          <button
            onClick={start}
            className="group mt-9 w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-6 py-4 text-lg font-black text-slate-900 shadow-[0_12px_40px_-10px_rgba(34,211,238,0.8)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_-10px_rgba(34,211,238,0.95)] active:translate-y-0"
          >
            开始比赛
            <span className="ml-2 inline-block transition-transform group-hover:translate-x-1">→</span>
          </button>
        </div>

        {/* 右：操作说明 */}
        <div className="w-full space-y-4 lg:w-[56%]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-black text-white">击球键位</h2>
              <span className="text-xs text-slate-400">电脑版使用数字小键盘</span>
            </div>
            {mode === 'single' ? (
              <KeyGrid field="keyLabel" title="数字小键盘（也可用 U I O / J K L / M , . 镜像键位）" accent="#7dd3fc" />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <KeyGrid field="altLabel" title="P1 · 蓝方 · 左侧" accent="#38bdf8" />
                <KeyGrid field="keyLabel" title="P2 · 红方 · 小键盘" accent="#fb7185" />
              </div>
            )}
            <div className="mt-3 grid gap-2 text-[13px] text-slate-300 sm:grid-cols-2">
              {mode === 'single' ? (
                <>
                  <Hint k="A D / ← →" v="左右移动" />
                  <Hint k="W / 空格 / 小键盘 0" v="跳跃" />
                </>
              ) : (
                <>
                  <Hint k="P1：A D · W" v="移动 · 跳跃" />
                  <Hint k="P2：← → · ↑ 或 0" v="移动 · 跳跃" />
                </>
              )}
              <Hint k="Esc / P" v="暂停" />
              <Hint k="击球时按住 ← →" v="调整落点深浅" />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur">
            <h2 className="mb-3 text-base font-black text-white">击球一览</h2>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {SHOTS.map((s) => (
                <div key={s.id} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color, boxShadow: `0 0 10px ${s.color}` }} />
                  <div className="text-[13px] leading-snug">
                    <span className="font-extrabold text-slate-50">{s.name}</span>
                    <span className="ml-1.5 text-[11px] font-bold uppercase text-slate-500">{s.en}</span>
                    <div className="text-slate-400">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-relaxed text-slate-400">
              得分 = 终结回合那一拍的分值。球拍在<b className="text-amber-300"> 最佳距离 </b>
              击中且高度合适即为<b className="text-amber-300"> 完美击球 +1 分</b>；高度不合适则变成“勉强回球”，落点失控且只得 1 分。出界、触网、未过网，对手得 1 分。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hint({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
      <kbd className="rounded-md border border-white/15 bg-white/10 px-2 py-0.5 font-mono text-xs font-bold text-cyan-100">{k}</kbd>
      <span className="text-slate-300">{v}</span>
    </div>
  );
}

function ShuttleLogo() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" className="drop-shadow-[0_0_12px_rgba(125,211,252,0.7)]">
      <path d="M22 22 L6 8 M22 22 L8 14 M22 22 L12 6 M22 22 L16 4" stroke="#e8f4ff" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
      <path d="M6 8 Q9 3 16 4 L22 22 Z" fill="rgba(232,244,255,0.22)" />
      <circle cx="25" cy="25" r="6" fill="#ffe3a3" />
    </svg>
  );
}
