import { useEffect, useRef, useState } from 'react';
import { Game, GameOptions, GameStatus } from '../game/engine';
import { TouchControls } from './TouchControls';

interface Props {
  options: GameOptions;
  muted: boolean;
  onToggleMute: () => void;
  onRestart: () => void;
  onExit: () => void;
}

const isTouch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

const noFocus = (e: React.MouseEvent) => e.preventDefault();

function IconBtn({ onClick, children, label }: { onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button
      tabIndex={-1}
      aria-label={label}
      title={label}
      onMouseDown={noFocus}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-slate-900/60 text-base text-white backdrop-blur transition hover:bg-slate-800/80 active:scale-95"
    >
      {children}
    </button>
  );
}

function PanelButton({ onClick, primary, children }: { onClick: () => void; primary?: boolean; children: React.ReactNode }) {
  return (
    <button
      tabIndex={-1}
      onMouseDown={noFocus}
      onClick={onClick}
      className={`w-full rounded-2xl px-6 py-3 text-base font-black transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 ${
        primary
          ? 'bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-900 shadow-[0_10px_30px_-8px_rgba(34,211,238,0.8)]'
          : 'border border-white/15 bg-white/[0.07] text-slate-100 hover:bg-white/[0.12]'
      }`}
    >
      {children}
    </button>
  );
}

export function GameView({ options, muted, onToggleMute, onRestart, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [status, setStatus] = useState<GameStatus>({ phase: 'playing', winner: null, score: [0, 0], names: ['', ''] });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, options, setStatus);
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, [options]);

  const game = () => gameRef.current;
  const touch = isTouch() && options.mode === 'single';
  const winnerName = status.winner === null ? '' : status.names[status.winner];

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#060b1c]">
      <canvas ref={canvasRef} className="block h-full w-full" />

      <div className="absolute right-3 top-3 z-30 flex gap-2">
        <IconBtn label="暂停 (Esc)" onClick={() => game()?.togglePause()}>⏸</IconBtn>
        <IconBtn label={muted ? '开启音效' : '静音'} onClick={onToggleMute}>{muted ? '🔇' : '🔊'}</IconBtn>
        <IconBtn label="返回菜单" onClick={onExit}>✕</IconBtn>
      </div>

      {touch && status.phase === 'playing' && <TouchControls onKey={(c, d) => game()?.virtualKey(c, d)} />}

      {status.phase === 'paused' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="w-[min(88vw,360px)] space-y-3 rounded-3xl border border-white/10 bg-slate-900/90 p-7 text-center shadow-2xl">
            <div className="mb-2 text-3xl font-black text-white">已暂停</div>
            <PanelButton primary onClick={() => game()?.setPaused(false)}>继续比赛</PanelButton>
            <PanelButton onClick={onRestart}>重新开始</PanelButton>
            <PanelButton onClick={onExit}>返回主菜单</PanelButton>
          </div>
        </div>
      )}

      {status.phase === 'over' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/55 backdrop-blur-[3px]">
          <div className="w-[min(90vw,400px)] animate-[pop_0.5s_cubic-bezier(0.2,1.4,0.4,1)] space-y-3 rounded-3xl border border-white/10 bg-slate-900/90 p-8 text-center shadow-2xl">
            <div className="text-5xl">🏆</div>
            <div className="text-3xl font-black text-white">{winnerName} 获胜！</div>
            <div className="pb-2 text-5xl font-black tabular-nums">
              <span style={{ color: '#38bdf8' }}>{status.score[0]}</span>
              <span className="mx-3 text-slate-500">:</span>
              <span style={{ color: '#fb7185' }}>{status.score[1]}</span>
            </div>
            <PanelButton primary onClick={onRestart}>再来一局</PanelButton>
            <PanelButton onClick={onExit}>返回主菜单</PanelButton>
          </div>
        </div>
      )}
    </div>
  );
}
