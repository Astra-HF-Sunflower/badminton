import { useCallback, useEffect, useState } from 'react';
import { GameView } from './components/GameView';
import { Menu } from './components/Menu';
import { sfx } from './game/audio';
import { bgm } from './game/bgm';
import type { GameOptions } from './game/engine';

export default function App() {
  const [options, setOptions] = useState<GameOptions | null>(null);
  const [muted, setMuted] = useState(false);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      sfx.setMuted(!m); // 同时静音音效与背景音乐
      return !m;
    });
  }, []);

  // 浏览器要求用户交互后才能出声：第一次点击 / 按键时启动音频与背景音乐
  useEffect(() => {
    const unlock = () => {
      sfx.init();
      bgm.resume();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
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
