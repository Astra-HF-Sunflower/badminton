# 火柴人羽毛球 · Stickman Badminton 🏸

一个用 **React 19 + TypeScript + Canvas + Vite** 写的网页羽毛球游戏：火柴人角色、实时物理、九种击球、合成音效与背景音乐，纯前端、零后端。

## 开始玩

```bash
npm install
npm run dev      # 开发服务器 http://localhost:5173
npm run build    # 打包成单文件 dist/index.html
npm run preview  # 预览打包结果
```

## 玩法

- **两种玩法模式**
  - 普通模式：高远球 · 杀球 · 平抽球 · 挑球，4 种基础击球
  - 专业模式：九种进阶击球，增加吊球、搓球、弹击、跳杀、劈吊
- **两种对局模式**：单人挑战电脑（轻松 / 标准 / 地狱）· 同一键盘双人对战
- **目标分数**：11 / 21 / 31 分
- **手感**：完美击球额外 ＋1 分；出界、触网、未过网对手得分

## 操作

| 操作 | 单人 / 双人 P1 | 双人 P2 |
| --- | --- | --- |
| 移动 | `A` `D`（或 `←` `→`） | `←` `→` |
| 跳跃 | `W` / `空格`（或 `↑` / 小键盘 `0`） | `↑` / 小键盘 `0` |
| 击球 | 小键盘 `7 8 9 / 4 5 6 / 1 2 3`，或 `U I O / J K L / M , .` | 小键盘 |
| 暂停 | `Esc` / `P` | |

普通模式只用九宫格左上 2×2（`7 8 / 4 5`），升级到专业模式不用重新记键位。

## 目录结构

```
index.html
src/
  main.tsx, App.tsx, index.css
  components/       菜单、游戏视图、键位图、触屏控件
  game/
    engine.ts       主循环：输入 → 物理 → 判定 → 特效 → 渲染
    physics.ts      羽毛球飞行（重力 + 二次空气阻力，120Hz 固定步长）
    ai.ts           电脑对手：预测落点 → 跑位 → 提前挥拍
    player.ts       角色移动、挥拍、击球判定
    swings.ts       每种击球的挥拍关键帧
    shots.ts        击球数据表 + 普通/专业模式配置
    audio.ts        WebAudio 实时合成音效
    bgm.ts          背景音乐（内置合成曲 + 自定义曲目注册表）
    render/         Canvas 渲染：背景、火柴人、HUD、场景
public/bgm/         放自己的 mp3（见该目录 README）
```

## 加自己的背景音乐

把音频放进 `public/bgm/`，再在 `src/game/bgm.ts` 的 `BGM_TRACKS` 里加一行：

```ts
{ id: 'rally', title: '激战', sub: '自定义 · mp3', kind: 'file', src: '/bgm/rally.mp3', volume: 0.6 }
```

菜单的「背景音乐」会自动多出这个选项，UI 无需改动。
