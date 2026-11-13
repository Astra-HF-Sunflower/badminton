import { GROUND, H, W, clamp } from '../constants';
import type { Phase } from '../ai';
import type { Fx } from '../fx';
import type { Player } from '../player';
import type { CharacterId, SkillState } from '../characters';
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
  /** 双方招式冷却（秒） */
  cooldown: Map<ShotId, number>[];
  /** 双方角色与技能状态 */
  characters: [CharacterId, CharacterId];
  skills: SkillState[];
  /** 时间停止 */
  timeStop: { side: 0 | 1; t: number; total: number } | null;

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
  /** 失重时球网的漂浮偏移 */
  netLift: number;
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

const FONT = "'PingFang SC','Microsoft YaHei','Noto Sans SC',system-ui,sans-serif";

/** 失重 / 时间加速 / 时间停止 的场地特效 */
function drawFieldFx(ctx: CanvasRenderingContext2D, s: Scene) {
  const cres = s.characters.some((c, i) => c === 'crescent' && s.skills[i].active > 0);
  const heavenLevel = s.skills.reduce((m, st, i) => (s.characters[i] === 'heaven' && st.active > 0 ? Math.max(m, st.level) : m), 1);

  // —— 新月：失重 ——
  if (cres) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(103,232,249,0.11)');
    g.addColorStop(1, 'rgba(103,232,249,0.02)');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.save();
    ctx.fillStyle = '#a5f3fc';
    for (let i = 0; i < 28; i++) {
      const t = s.time * 0.5 + i * 1.7;
      const x = ((i * 137) % W) + Math.sin(t) * 34;
      const y = H - ((t * 30 + i * 61) % (H + 140));
      ctx.globalAlpha = 0.18 + (i % 3) * 0.08;
      ctx.beginPath();
      ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // —— 天堂制造：时间加速的速度线 ——
  if (heavenLevel > 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#fbbf24';
    for (let i = 0; i < 24; i++) {
      const y = 70 + ((i * 61) % (H - 130));
      const len = 90 + (i % 5) * 70;
      const x = W - ((s.time * 1500 * heavenLevel + i * 233) % (W + 320));
      ctx.globalAlpha = 0.07 + (heavenLevel - 1) * 0.035;
      ctx.lineWidth = 1.5 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // —— 世界：时间停止 ——
  const ts = s.timeStop;
  if (!ts) return;
  const prog = ts.total > 0 ? clamp(ts.t / ts.total, 0, 1) : 0;
  const g = ctx.createRadialGradient(W / 2, H / 2, 110, W / 2, H / 2, 980);
  g.addColorStop(0, 'rgba(126,94,224,0.0)');
  g.addColorStop(0.55, 'rgba(82,48,190,0.30)');
  g.addColorStop(1, 'rgba(16,5,42,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, W + 40, H + 40);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.strokeStyle = 'rgba(196,181,253,0.85)';
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 330, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const big = i % 3 === 0;
    ctx.lineWidth = big ? 6 : 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 310, Math.sin(a) * 310);
    ctx.lineTo(Math.cos(a) * (big ? 280 : 294), Math.sin(a) * (big ? 280 : 294));
    ctx.stroke();
  }
  // 指针：随剩余时间倒转
  const hand = -Math.PI / 2 - prog * Math.PI * 12;
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = '#ddd6fe';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(hand) * 250, Math.sin(hand) * 250);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(W / 2 - W / 2, 0, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 冻结的球：外圈脉冲
  const sh = s.shuttle;
  ctx.save();
  ctx.globalAlpha = 0.6 + Math.sin(s.time * 6) * 0.25;
  ctx.strokeStyle = '#c4b5fd';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sh.x, sh.y, 22 + Math.sin(s.time * 4) * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 64px ${FONT}`;
  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(10,4,30,0.85)';
  ctx.strokeText('時間停止', W / 2, 210);
  ctx.shadowColor = '#a78bfa';
  ctx.shadowBlur = 34;
  ctx.fillStyle = '#ede9fe';
  ctx.fillText('時間停止', W / 2, 210);
  ctx.shadowBlur = 0;
  ctx.font = `800 26px ${FONT}`;
  ctx.fillStyle = 'rgba(221,214,254,0.85)';
  ctx.fillText(`${Math.max(0, ts.total - ts.t).toFixed(1)}s · 挥拍蓄力 ×${s.skills[ts.side].accum}`, W / 2, 262);
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

  drawNet(ctx, s.netSway, s.netLift);

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
  drawFieldFx(ctx, s);
  ctx.restore();

  // HUD 不随震动
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);
  drawHud(ctx, s);
}
