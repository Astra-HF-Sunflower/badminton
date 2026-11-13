import { GROUND, PLAYER } from '../constants';
import type { Player } from '../player';
import type { Vec } from '../pose';

const LIMB = '#eef3fb';
const LIMB_FAR = '#98a6c0';

const seg = (ctx: CanvasRenderingContext2D, pts: Vec[], color: string, width: number) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
};

export function drawShadow(ctx: CanvasRenderingContext2D, x: number, z: number, r: number, alpha = 0.34) {
  const k = 1 / (1 + z / 260);
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha * k})`;
  ctx.beginPath();
  ctx.ellipse(x, GROUND + 8, r * k, r * 0.24 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRacket(ctx: CanvasRenderingContext2D, hand: Vec, angle: number, color: string) {
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(angle);
  ctx.lineCap = 'round';
  // 握把 + 拍杆
  seg(ctx, [{ x: -6, y: 0 }, { x: 18, y: 0 }], '#232a3a', 6);
  seg(ctx, [{ x: 18, y: 0 }, { x: 36, y: 0 }], '#d5dcea', 3);
  // 拍面
  const c = PLAYER.racketCenter;
  ctx.beginPath();
  ctx.ellipse(c, 0, 22, 15, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -3; i <= 3; i++) {
    ctx.moveTo(c - 22, i * 4.4);
    ctx.lineTo(c + 22, i * 4.4);
    ctx.moveTo(c + i * 6, -15);
    ctx.lineTo(c + i * 6, 15);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(c, 0, 22, 15, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawStickman(ctx: CanvasRenderingContext2D, p: Player) {
  const q = p.pose;
  const f = p.facing;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 击球发光
  if (p.glow > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(q.racketHead.x, q.racketHead.y, 0, q.racketHead.x, q.racketHead.y, 90);
    g.addColorStop(0, p.glowColor);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = p.glow * 0.7;
    ctx.fillStyle = g;
    ctx.fillRect(q.racketHead.x - 90, q.racketHead.y - 90, 180, 180);
    ctx.restore();
  }

  // 远侧肢体
  seg(ctx, [q.hip, q.kneeB, q.footB], LIMB_FAR, 7);
  seg(ctx, [q.shoulder, q.elbowL, q.handL], LIMB_FAR, 7);
  // 躯干（球衣）
  seg(ctx, [q.hip, q.shoulder], p.color, 13);
  seg(ctx, [q.hip, { x: q.hip.x + (q.kneeB.x - q.hip.x) * 0.4, y: q.hip.y + (q.kneeB.y - q.hip.y) * 0.4 }], '#27324e', 11);
  // 近侧腿
  seg(ctx, [q.hip, q.kneeA, q.footA], LIMB, 7.5);
  seg(ctx, [q.hip, { x: q.hip.x + (q.kneeA.x - q.hip.x) * 0.4, y: q.hip.y + (q.kneeA.y - q.hip.y) * 0.4 }], '#27324e', 11.5);
  // 鞋
  for (const foot of [q.footB, q.footA]) {
    ctx.fillStyle = foot === q.footA ? p.color : '#6b7a99';
    ctx.beginPath();
    ctx.ellipse(foot.x + f * 4, foot.y - 2, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 头
  ctx.fillStyle = '#f6f9ff';
  ctx.beginPath();
  ctx.arc(q.head.x, q.head.y, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = LIMB;
  ctx.lineWidth = 3;
  ctx.stroke();
  // 发带
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(q.head.x, q.head.y, 15.5, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();
  // 眼睛（看向球）
  ctx.fillStyle = '#1b2236';
  ctx.beginPath();
  ctx.arc(q.head.x + f * 7, q.head.y - 1, 2.6, 0, Math.PI * 2);
  ctx.fill();
  // 持拍臂 + 球拍
  seg(ctx, [q.shoulder, q.elbowR, q.handR], LIMB, 7.5);
  drawRacket(ctx, q.handR, q.racketAngle, p.color);
  ctx.restore();
}

/** 球拍挥动残影 */
export function drawRacketTrail(ctx: CanvasRenderingContext2D, p: Player, color: string) {
  const t = p.trail;
  if (t.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 1; i < t.length; i++) {
    const a = Math.max(0, 1 - t[i].age / 0.28);
    ctx.strokeStyle = color;
    ctx.globalAlpha = a * 0.7;
    ctx.lineWidth = 16 * a + 2;
    ctx.beginPath();
    ctx.moveTo(t[i - 1].x, t[i - 1].y);
    ctx.lineTo(t[i].x, t[i].y);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.globalAlpha = a * 0.5;
    ctx.lineWidth = 4 * a;
    ctx.stroke();
  }
  ctx.restore();
}
