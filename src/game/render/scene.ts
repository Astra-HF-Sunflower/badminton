import { GROUND, H, W, clamp } from '../constants';
import type { Phase } from '../ai';
import type { Fx } from '../fx';
import type { Player } from '../player';
import type { CourtDef } from '../court';
import type { PlayStyle, ShotDef, ShotId } from '../shots';
import type { Shuttle } from '../shuttle';
import { drawBackground, drawNet } from './background';
import { drawHud } from './hud';
import { drawRacketTrail, drawShadow, drawStickman } from './stickman';

export interface Banner {
  title: string;
  sub: string;
  color: string;
  t: number;
}

export interface LandingMark {
  x: number;
  age: number;
  ok: boolean;
}

/** 渲染所需的只读场景数据（由 Game 提供） */
export interface Scene {
  time: number;
  mode: 'single' | 'double';
  style: PlayStyle;
  /** 本局可用的击球 */
  shots: ShotDef[];
  /** 场地大小 */
  court: CourtDef;
  /** 双方各类击球的出手次数 */
  usage: Map<ShotId, number>[];
  difficultyLabel: string;
  phase: Phase;
  players: [Player, Player];
  humanSides: [boolean, boolean];
  shuttle: Shuttle;
  fx: Fx;
  score: [number, number];
  scorePop: [number, number];
  target: number;
  server: 0 | 1;
  rally: number;
  banner: Banner | null;
  netSway: number;
  excite: number;
  marks: LandingMark[];
  used: Map<string, number>;
}

function drawShuttle(ctx: CanvasRenderingContext2D, sh: Shuttle) {
  // 拖尾
  const t = sh.trail;
  if (t.length > 1) {
    const color = sh.lastShot?.color ?? '#ffffff';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const max = 0.32;
    for (let i = 1; i < t.length; i++) {
      const a = clamp(1 - t[i].age / max, 0, 1);
      ctx.strokeStyle = color;
      ctx.globalAlpha = a * 0.55;
      ctx.lineWidth = 3 + 15 * a;
      ctx.beginPath();
      ctx.moveTo(t[i - 1].x, t[i - 1].y);
      ctx.lineTo(t[i].x, t[i].y);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = a * 0.8;
      ctx.lineWidth = 1 + 3.5 * a;
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(sh.x, sh.y);
  ctx.rotate(sh.angle);
  ctx.scale(1.15, 1.15);
  // 羽裙
  const skirt = ctx.createLinearGradient(-24, 0, 4, 0);
  skirt.addColorStop(0, 'rgba(235,243,255,0.75)');
  skirt.addColorStop(1, '#ffffff');
  ctx.beginPath();
  ctx.moveTo(3, -4.5);
  ctx.lineTo(-24, -14);
  ctx.quadraticCurveTo(-27, 0, -24, 14);
  ctx.lineTo(3, 4.5);
  ctx.closePath();
  ctx.fillStyle = skirt;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,140,175,0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const k of [-0.7, -0.35, 0, 0.35, 0.7]) {
    ctx.moveTo(3, k * 6);
    ctx.lineTo(-24, k * 18);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90,110,150,0.9)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-12, -9);
  ctx.quadraticCurveTo(-14.5, 0, -12, 9);
  ctx.stroke();
  // 球头
  const cork = ctx.createRadialGradient(8, -2, 1, 8, 0, 7);
  cork.addColorStop(0, '#fff6dc');
  cork.addColorStop(1, '#d9b46c');
  ctx.fillStyle = cork;
  ctx.beginPath();
  ctx.arc(8, 0, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawScene(ctx: CanvasRenderingContext2D, s: Scene, cw: number, ch: number, dpr: number) {
  const scale = Math.min(cw / W, ch / H);
  const ox = (cw - W * scale) / 2;
  const oy = (ch - H * scale) / 2;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#060b1c';
  ctx.fillRect(0, 0, cw, ch);

  const sk = s.fx.shake;
  const shx = sk ? (Math.random() - 0.5) * sk * 2 : 0;
  const shy = sk ? (Math.random() - 0.5) * sk * 2 : 0;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, (ox + shx * scale) * dpr, (oy + shy * scale) * dpr);

  // 裁剪到舞台，避免震动时溢出
  ctx.save();
  ctx.beginPath();
  ctx.rect(-20, -20, W + 40, H + 40);
  ctx.clip();

  drawBackground(ctx, s.time, s.excite, s.court);

  // 落点标记
  for (const m of s.marks) {
    const a = clamp(1 - m.age / 1.6, 0, 1);
    ctx.strokeStyle = m.ok ? `rgba(155,229,100,${a})` : `rgba(255,90,77,${a})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(m.x, GROUND + 8, 26 + m.age * 20, 7 + m.age * 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawNet(ctx, s.netSway);

  // 阴影
  for (const p of s.players) drawShadow(ctx, p.x, p.z, 40);
  const sh = s.shuttle;
  drawShadow(ctx, sh.x, Math.max(0, GROUND - sh.y) * 1.2, 15, 0.3);

  for (const p of s.players) {
    drawRacketTrail(ctx, p, p.swing?.shot.color ?? p.glowColor);
    drawStickman(ctx, p);
  }
  drawShuttle(ctx, sh);
  s.fx.draw(ctx);

  if (s.fx.flash > 0.01) {
    ctx.globalAlpha = s.fx.flash * 0.35;
    ctx.fillStyle = s.fx.flashColor;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.globalAlpha = 1;
  }
  s.fx.drawText(ctx);
  ctx.restore();

  // HUD 不随震动
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);
  drawHud(ctx, s);
}
