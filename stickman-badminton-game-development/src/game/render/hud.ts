import { GROUND, Side, W } from '../constants';
import { SHOTS } from '../shots';
import type { Scene } from './scene';

const FONT = "'PingFang SC','Microsoft YaHei','Noto Sans SC',system-ui,sans-serif";

const panel = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 18, alpha = 0.6) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = `rgba(8,14,32,${alpha})`;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
};

const text = (ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = 800) => {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
};

function drawScoreboard(ctx: CanvasRenderingContext2D, s: Scene) {
  const cx = W / 2;
  panel(ctx, cx - 270, 14, 540, 92, 24, 0.66);
  ([0, 1] as Side[]).forEach((side) => {
    const p = s.players[side];
    const x = cx + (side === 0 ? -150 : 150);
    // 名称
    text(ctx, p.name, x, 38, 19, '#e9f0ff');
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.roundRect(x - 34, 94 - 8, 68, 4, 2);
    ctx.fill();
    // 发球标记
    if (s.server === side && s.phase !== 'over') {
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath();
      ctx.arc(x + (side === 0 ? -64 : 64), 38, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // 分数
    const pop = s.scorePop[side];
    ctx.save();
    ctx.translate(x, 76);
    ctx.scale(1 + pop * 0.55, 1 + pop * 0.55);
    text(ctx, String(s.score[side]), 0, 0, 46, pop > 0.05 ? p.color : '#ffffff', 'center', 900);
    ctx.restore();
  });
  text(ctx, `先到 ${s.target} 分`, cx, 40, 14, 'rgba(210,225,255,0.65)', 'center', 700);
  text(ctx, ':', cx, 74, 40, 'rgba(255,255,255,0.35)', 'center', 900);

  if (s.rally >= 3 && s.phase === 'rally') {
    const heat = Math.min(1, s.rally / 14);
    const col = heat > 0.6 ? '#ff7a4d' : heat > 0.3 ? '#ffd23f' : '#9be3ff';
    panel(ctx, cx - 74, 114, 148, 34, 17, 0.5);
    text(ctx, `连续回合 ${s.rally}`, cx, 132, 16, col);
  }
}

function drawLegend(ctx: CanvasRenderingContext2D, s: Scene, side: Side) {
  const w = 336;
  const x0 = side === 0 ? 22 : W - 22 - w;
  const y0 = GROUND + 20;
  const double = s.mode === 'double';
  const useAlt = double && side === 0;
  panel(ctx, x0, y0, w, 170, 18, 0.55);
  const header =
    s.mode === 'single'
      ? 'A/D 移动 · W/空格 跳 · 小键盘击球'
      : side === 0
        ? 'A / D 移动 · W 跳 · 右手击球'
        : '← → 移动 · ↑ 或 0 跳 · 小键盘击球';
  text(ctx, header, x0 + w / 2, y0 + 16, 13, side === 0 ? s.players[0].color : s.players[1].color, 'center', 800);

  const cw = 104;
  const ch = 40;
  for (const shot of SHOTS) {
    const x = x0 + 8 + shot.col * (cw + 3);
    const y = y0 + 30 + shot.row * (ch + 3);
    const used = Math.max(0, 1 - (s.time - (s.used.get(`${side}:${shot.id}`) ?? -9)) * 3.2);
    ctx.beginPath();
    ctx.roundRect(x, y, cw, ch, 10);
    ctx.fillStyle = `rgba(255,255,255,${0.07 + used * 0.2})`;
    ctx.fill();
    if (used > 0) {
      ctx.strokeStyle = shot.color;
      ctx.globalAlpha = used;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 键帽
    ctx.beginPath();
    ctx.roundRect(x + 6, y + 7, 26, 26, 7);
    ctx.fillStyle = shot.color;
    ctx.fill();
    text(ctx, useAlt ? shot.altLabel : shot.keyLabel, x + 19, y + 21, 17, '#101828', 'center', 900);
    text(ctx, shot.name, x + 38, y + 14, 14, '#f1f5ff', 'left', 800);
    text(ctx, `+${shot.points} 分`, x + 38, y + 29, 11, shot.color, 'left', 700);
  }
}

function drawTips(ctx: CanvasRenderingContext2D, s: Scene) {
  const w = 336;
  const x0 = W - 22 - w;
  const y0 = GROUND + 20;
  panel(ctx, x0, y0, w, 170, 18, 0.55);
  text(ctx, `电脑对手 · ${s.difficultyLabel}`, x0 + w / 2, y0 + 16, 13, s.players[1].color, 'center', 800);
  const tips = [
    ['击球时按住 ← / →', '向前打得更深，向后更短'],
    ['球在最佳距离出手', '“完美击球”额外 +1 分'],
    ['空中按 杀球 / 跳杀', '腾空爆扣威力更大'],
    ['球落点出界或触网', '对手得 1 分'],
  ];
  tips.forEach(([a, b], i) => {
    const y = y0 + 44 + i * 31;
    ctx.fillStyle = s.players[0].color;
    ctx.beginPath();
    ctx.arc(x0 + 20, y, 4, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, a, x0 + 34, y - 6, 13, '#f1f5ff', 'left', 800);
    text(ctx, b, x0 + 34, y + 9, 11.5, 'rgba(210,225,255,0.7)', 'left', 600);
  });
}

function drawBanner(ctx: CanvasRenderingContext2D, s: Scene) {
  const b = s.banner;
  if (!b) return;
  const t = b.t;
  const inT = Math.min(1, t / 0.28);
  const back = 1 + 2.2 * Math.pow(inT - 1, 3) + 1.2 * Math.pow(inT - 1, 2);
  const alpha = t > 1.5 ? Math.max(0, 1 - (t - 1.5) / 0.4) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(W / 2, 290);
  ctx.scale(back, back);
  ctx.lineJoin = 'round';
  ctx.font = `900 84px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(6,12,28,0.88)';
  ctx.strokeText(b.title, 0, 0);
  ctx.shadowColor = b.color;
  ctx.shadowBlur = 36;
  ctx.fillStyle = b.color;
  ctx.fillText(b.title, 0, 0);
  ctx.shadowBlur = 0;
  ctx.font = `800 36px ${FONT}`;
  ctx.lineWidth = 8;
  ctx.strokeText(b.sub, 0, 64);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(b.sub, 0, 64);
  ctx.restore();
}

function drawServePrompt(ctx: CanvasRenderingContext2D, s: Scene) {
  if (s.phase !== 'serve') return;
  const server = s.players[s.server];
  if (s.humanSides[s.server] === false) return;
  const pulse = 0.75 + Math.sin(s.time * 5) * 0.25;
  const x = Math.max(260, Math.min(W - 260, server.x));
  const y = server.pose.head.y - 70;
  ctx.save();
  ctx.globalAlpha = pulse;
  panel(ctx, x - 190, y - 26, 380, 52, 26, 0.72);
  text(ctx, '按任意击球键发球', x, y - 6, 18, '#ffffff');
  text(ctx, '搓球 / 吊球 / 劈吊 / 弹击 = 短发球 · 其余 = 高远发球', x, y + 14, 12, 'rgba(210,225,255,0.75)', 'center', 700);
  ctx.restore();
}

function drawOffscreen(ctx: CanvasRenderingContext2D, s: Scene) {
  const sh = s.shuttle;
  if (sh.y > 8 || s.phase === 'serve') return;
  const x = Math.max(40, Math.min(W - 40, sh.x));
  const h = Math.round((GROUND - sh.y) / 100);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x, 130);
  ctx.lineTo(x - 10, 146);
  ctx.lineTo(x + 10, 146);
  ctx.closePath();
  ctx.fill();
  text(ctx, `${h}m`, x, 160, 13, '#ffffff', 'center', 800);
  ctx.restore();
}

export function drawHud(ctx: CanvasRenderingContext2D, s: Scene) {
  drawScoreboard(ctx, s);
  drawLegend(ctx, s, 0);
  if (s.mode === 'double') drawLegend(ctx, s, 1);
  else drawTips(ctx, s);
  drawServePrompt(ctx, s);
  drawOffscreen(ctx, s);
  drawBanner(ctx, s);
}
