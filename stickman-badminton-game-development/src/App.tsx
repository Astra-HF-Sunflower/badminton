import { useCallback, useState } from 'react';
import { GameView } from './components/GameView';
import { Menu } from './components/Menu';
import { sfx } from './game/audio';
import type { GameOptions } from './game/engine';

export default function App() {
  const [options, setOptions] = useState<GameOptions | null>(null);
  const [muted, setMuted] = useState(false);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      sfx.setMuted(!m);
      return !m;
    });
  }, []);

  // 每次“再来一局”都生成新的 options 对象，触发游戏重建
  const restart = useCallback(() => setOptions((o) => (o ? { ...o } : o)), []);

  if (!options) return <Menu onStart={setOptions} muted={muted} onToggleMute={toggleMute} />;
  return (
    <GameView
      options={options}
      muted={muted}
      onToggleMute={toggleMute}
      onRestart={restart}
      onExit={() => setOptions(null)}
    />
  );
}
