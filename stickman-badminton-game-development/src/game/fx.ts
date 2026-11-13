import { GROUND, clamp, rand } from './constants';
import type { FxKind, ShotDef } from './shots';

type Kind = 'dot' | 'streak' | 'ring' | 'text' | 'bolt' | 'star' | 'crescent' | 'leaf' | 'bubble' | 'confetti';

interface P {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  grav: number;
  drag: number;
  add: boolean;
  rot: number;
  vr: number;
  len: number;
  sq: number;
  span: number;
  text: string;
  pts: number[] | null;
  seed: number;
}

const FONT = "'PingFang SC','Microsoft YaHei','Noto Sans SC',system-ui,sans-serif";

export class Fx {
  private ps: P[] = [];
  shake = 0;
  flash = 0;
  flashColor = '#fff';

  private add(o: Partial<P> & { kind: Kind; x: number; y: number; life: number; color: string }) {
    if (this.ps.length > 1100) this.ps.shift();
    this.ps.push({
      vx: 0, vy: 0, size: 4, grav: 0, drag: 0, add: true, rot: 0, vr: 0, len: 0, sq: 1, span: 0.8,
      text: '', pts: null, seed: Math.random() * 10, max: o.life, ...o,
    });
  }

  clear() {
    this.ps.length = 0;
    this.shake = 0;
    this.flash = 0;
  }

  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 38);
    this.flash = Math.max(0, this.flash - dt * 2.4);
    for (const p of this.ps) {
      p.life -= dt;
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'leaf') p.x += Math.sin(p.life * 7 + p.seed) * 38 * dt;
    }
    this.ps = this.ps.filter((p) => p.life > 0);
  }

  /** 发光类粒子 + 普通粒子 */
  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of this.ps) {
      if (p.kind === 'text') continue;
      const a = clamp(p.life / p.max, 0, 1);
      const prog = 1 - a;
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.color;
      ctx.fillStyle = p.color;
      switch (p.kind) {
        case 'dot':
        case 'confetti':
          if (p.kind === 'confetti') {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.scale(1, Math.abs(Math.sin(p.life * 8 + p.seed)));
            ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
            ctx.restore();
          } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.1, p.size * (0.35 + 0.65 * a)), 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        case 'streak': {
          const l = p.len * (0.35 + 0.65 * a);
          ctx.lineWidth = Math.max(0.5, p.size * a);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - Math.cos(p.rot) * l, p.y - Math.sin(p.rot) * l);
          ctx.stroke();
          break;
        }
        case 'ring': {
          const r = p.size * (1 - Math.pow(1 - prog, 3));
          ctx.lineWidth = 1.5 + 9 * a;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, Math.max(1, r), Math.max(1, r * p.sq), 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'bolt':
          if (p.pts) {
            ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(p.life * 90));
            for (const [w, c] of [[p.size * 2.6, p.color], [p.size * 0.9, '#ffffff']] as const) {
              ctx.strokeStyle = c;
              ctx.lineWidth = w;
              ctx.beginPath();
              ctx.moveTo(p.pts[0], p.pts[1]);
              for (let i = 2; i < p.pts.length; i += 2) ctx.lineTo(p.pts[i], p.pts[i + 1]);
              ctx.stroke();
            }
          }
          break;
        case 'star': {
          const s = p.size * (0.5 + 0.8 * Math.sin(Math.min(1, prog * 3) * Math.PI * 0.5)) * (0.4 + 0.6 * a);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const r = i % 2 === 0 ? s : s * 0.3;
            const ang = (i * Math.PI) / 4;
            ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'crescent': {
          const r = p.len * (1 + prog * 0.7);
          ctx.lineWidth = Math.max(0.5, p.size * a);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, p.rot - p.span, p.rot + p.span);
          ctx.stroke();
          break;
        }
        case 'leaf':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        case 'bubble':
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.6 + 0.4 * prog), 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = a * 0.25;
          ctx.fill();
          break;
      }
    }
    ctx.restore();
  }

  drawText(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const p of this.ps) {
      if (p.kind !== 'text') continue;
      const a = clamp(p.life / p.max, 0, 1);
      const prog = 1 - a;
      const pop = 1 + Math.max(0, 1 - prog * 7) * 0.45;
      ctx.globalAlpha = Math.min(1, a * 3);
      ctx.font = `900 ${p.size * pop}px ${FONT}`;
      ctx.lineWidth = Math.max(3, p.size * 0.16);
      ctx.strokeStyle = 'rgba(8,14,30,0.85)';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }

  // ————————————————— 通用效果 —————————————————

  text(x: number, y: number, text: string, color: string, size = 34, life = 1.1) {
    this.add({ kind: 'text', x, y, vy: -46, drag: 1.4, life, color, size, text, add: false });
  }

  ring(x: number, y: number, color: string, size: number, life = 0.45, sq = 1) {
    this.add({ kind: 'ring', x, y, life, color, size, sq });
  }

  sparks(x: number, y: number, color: string, n: number, speed: number, opts: { angle?: number; spread?: number; grav?: number; life?: number; size?: number } = {}) {
    for (let i = 0; i < n; i++) {
      const ang = (opts.angle ?? 0) + rand(-1, 1) * (opts.spread ?? Math.PI);
      const sp = rand(0.25, 1) * speed;
      this.add({
        kind: 'dot', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, drag: 3.2,
        grav: opts.grav ?? 300, life: rand(0.35, 0.8) * (opts.life ?? 1), color, size: rand(2, 5) * (opts.size ?? 1),
      });
    }
  }

  streaks(x: number, y: number, color: string, n: number, angle: number, spread: number, len: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = angle + rand(-spread, spread);
      this.add({
        kind: 'streak', x: x + rand(-14, 14), y: y + rand(-14, 14), rot: a, vx: Math.cos(a) * speed * rand(0.6, 1.2),
        vy: Math.sin(a) * speed * rand(0.6, 1.2), len: len * rand(0.6, 1.2), size: rand(3, 6), life: rand(0.18, 0.34), color,
      });
    }
  }

  crescent(x: number, y: number, color: string, angle: number, radius: number, width: number, life = 0.35, span = 0.9) {
    this.add({ kind: 'crescent', x, y, rot: angle, len: radius, size: width, life, color, span });
  }

  bolt(x: number, y: number, angle: number, length: number, color: string) {
    const pts: number[] = [x, y];
    const n = 9;
    let cx = x;
    let cy = y;
    for (let i = 1; i <= n; i++) {
      const a = angle + rand(-0.55, 0.55);
      cx += Math.cos(a) * (length / n);
      cy += Math.sin(a) * (length / n);
      pts.push(cx, cy);
    }
    this.add({ kind: 'bolt', x, y, pts, size: rand(2.2, 3.4), life: rand(0.16, 0.3), color });
  }

  stars(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
      const sp = rand(90, 220);
      this.add({
        kind: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, drag: 2.4, grav: 90,
        size: rand(9, 17), life: rand(0.5, 0.9), color, rot: rand(0, 1), vr: rand(-3, 3),
      });
    }
  }

  dust(x: number, n: number, power = 1, dir = 0) {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: 'dot', x: x + rand(-14, 14), y: GROUND - 2, vx: dir * rand(20, 120) + rand(-90, 90) * power,
        vy: -rand(20, 110) * power, drag: 3, grav: 120, size: rand(3, 7), life: rand(0.3, 0.6),
        color: 'rgba(210,225,245,0.55)', add: false,
      });
    }
  }

  floorRing(x: number, color: string, size: number) {
    this.ring(x, GROUND + 4, color, size, 0.55, 0.22);
  }

  confetti(x: number, y: number, n: number) {
    const cols = ['#ffd23f', '#ff5a4d', '#5ec8ff', '#9be564', '#ff7eb6', '#b583ff'];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rand(-0.9, 0.9);
      const sp = rand(300, 900);
      this.add({
        kind: 'confetti', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, grav: 700, drag: 1.2,
        size: rand(4, 8), life: rand(1.4, 2.4), rot: rand(0, 6), vr: rand(-8, 8),
        color: cols[(Math.random() * cols.length) | 0], add: false,
      });
    }
  }

  // ————————————————— 击球特效（每种击球独立）—————————————————

  hit(shot: ShotDef, x: number, y: number, dir: 1 | -1, perfect: boolean, poor: boolean) {
    const c = shot.color;
    const a0 = dir === 1 ? 0 : Math.PI; // 出球方向
    const k = poor ? 0.55 : 1;
    switch (shot.fx) {
      case 'wind':
        this.ring(x, y, c, 95 * k, 0.5);
        this.crescent(x, y, '#ffffff', a0, 40, 5, 0.45, 0.9);
        this.crescent(x, y, c, a0, 64, 4, 0.55, 0.8);
        this.streaks(x, y, '#d8f3ff', 6, a0, 0.25, 140, 520);
        this.sparks(x, y, c, 14, 320, { angle: a0 - Math.PI / 2, spread: 1.3, grav: -60 });
        break;
      case 'fire':
        this.ring(x, y, c, 170, 0.5);
        this.ring(x, y, '#ffd23f', 100, 0.35);
        this.streaks(x, y, '#ffb347', 10, a0, 0.35, 220, 900);
        this.sparks(x, y, '#ff7a2e', 28, 760, { angle: a0, spread: 0.9, grav: 200 });
        this.sparks(x, y, '#ffe27a', 16, 520, { angle: a0, spread: 1.4, grav: -120, size: 1.2 });
        this.flash = Math.max(this.flash, 0.28);
        this.flashColor = '#ff5a4d';
        break;
      case 'leaf':
        this.ring(x, y, c, 70 * k, 0.5);
        for (let i = 0; i < 14; i++) {
          this.add({
            kind: 'leaf', x, y, vx: rand(-110, 110) + dir * 40, vy: rand(-180, -30), drag: 1.5, grav: 120,
            size: rand(6, 11), life: rand(0.9, 1.5), color: i % 2 ? '#9be564' : '#d4ff9a', rot: rand(0, 6), vr: rand(-6, 6), add: false,
          });
        }
        this.stars(x, y, '#e8ffc9', 4);
        break;
      case 'slash':
        this.ring(x, y, c, 90, 0.4);
        this.streaks(x, y, c, 7, a0, 0.06, 260, 1200);
        this.streaks(x, y, '#ffffff', 3, a0, 0.04, 200, 1400);
        this.sparks(x, y, c, 18, 560, { angle: a0, spread: 0.7, grav: 150 });
        break;
      case 'bubble':
        this.ring(x, y, c, 80 * k, 0.5);
        this.ring(x, y, '#e2ccff', 44, 0.35);
        for (let i = 0; i < 11; i++) {
          this.add({
            kind: 'bubble', x: x + rand(-18, 18), y, vx: rand(-60, 60) + dir * 80, vy: -rand(120, 360), drag: 1.3, grav: -40,
            size: rand(5, 13), life: rand(0.6, 1.1), color: c,
          });
        }
        break;
      case 'swirl':
        this.ring(x, y, c, 56, 0.4);
        for (let i = 0; i < 18; i++) {
          const ang = i * 0.7;
          const r = 20 + i * 5;
          this.add({
            kind: 'dot', x, y, vx: Math.cos(ang) * r * 4.2, vy: Math.sin(ang) * r * 4.2, drag: 4,
            size: 3.4, life: 0.5 + i * 0.015, color: i % 2 ? c : '#ffd1e6',
          });
        }
        this.stars(x, y, '#ffd1e6', 3);
        break;
      case 'crescent':
        this.ring(x, y, c, 100, 0.4);
        this.crescent(x, y, '#ffffff', a0 - 0.6, 46, 6, 0.4, 0.9);
        this.crescent(x, y, c, a0 + 0.5, 70, 7, 0.45, 0.9);
        this.crescent(x, y, c, a0, 96, 4, 0.5, 0.7);
        this.streaks(x, y, c, 6, a0, 0.5, 200, 800);
        this.sparks(x, y, c, 14, 460, { angle: a0, spread: 1, grav: 120 });
        break;
      case 'thunder':
        this.ring(x, y, c, 240, 0.6);
        this.ring(x, y, '#ffffff', 150, 0.4);
        this.ring(x, y, '#ffd23f', 330, 0.7);
        for (let i = 0; i < 6; i++) this.bolt(x, y, a0 + rand(-1.6, 1.6), rand(160, 330), i % 2 ? '#ffd23f' : '#ff9d1a');
        this.streaks(x, y, '#ffe9a8', 14, a0, 0.5, 300, 1300);
        this.sparks(x, y, '#ffb347', 44, 980, { angle: a0, spread: Math.PI, grav: 260 });
        this.stars(x, y, '#fff2b8', 7);
        this.flash = Math.max(this.flash, 0.5);
        this.flashColor = '#ffd9a0';
        break;
    }
    if (perfect) {
      this.ring(x, y, '#ffe27a', 130, 0.55);
      this.stars(x, y - 4, '#ffe27a', 9);
    }
    this.shake = Math.max(this.shake, shot.shake * (poor ? 0.4 : 1));
  }

  /** 球飞行中的拖尾粒子 */
  trail(kind: FxKind, color: string, x: number, y: number, vx: number, vy: number) {
    const sp = Math.hypot(vx, vy);
    const ang = Math.atan2(vy, vx);
    switch (kind) {
      case 'wind':
        this.add({ kind: 'dot', x, y, size: 3.2, life: 0.35, color: 'rgba(190,235,255,0.9)', vx: -vx * 0.02, vy: -vy * 0.02 });
        break;
      case 'fire':
        this.add({ kind: 'dot', x, y, vx: rand(-30, 30) - vx * 0.04, vy: rand(-90, -20), grav: -120, size: rand(5, 10), life: rand(0.3, 0.6), color: Math.random() < 0.5 ? '#ff7a2e' : '#ffcf4a' });
        if (Math.random() < 0.3) this.add({ kind: 'dot', x, y, vy: -rand(80, 200), vx: rand(-60, 60), grav: -50, size: 2.4, life: 0.7, color: '#fff2a8' });
        break;
      case 'leaf':
        this.add({ kind: 'dot', x, y, vx: rand(-20, 20), vy: rand(-10, 40), size: 3, life: 0.5, color: '#c9ff8f' });
        break;
      case 'slash':
        this.add({ kind: 'streak', x, y, rot: ang, len: 90, size: 4, life: 0.16, color });
        break;
      case 'bubble':
        this.add({ kind: 'bubble', x: x + rand(-6, 6), y: y + rand(-6, 6), vy: -rand(20, 70), size: rand(4, 8), life: 0.6, color });
        break;
      case 'swirl': {
        const off = Math.sin(performance.now() / 55) * 12;
        this.add({ kind: 'dot', x: x - Math.sin(ang) * off, y: y + Math.cos(ang) * off, size: 3.2, life: 0.45, color });
        this.add({ kind: 'dot', x: x + Math.sin(ang) * off, y: y - Math.cos(ang) * off, size: 2.4, life: 0.45, color: '#ffd1e6' });
        break;
      }
      case 'crescent':
        this.add({ kind: 'dot', x, y, vx: rand(-20, 20), vy: rand(-20, 20), size: 4, life: 0.4, color });
        if (Math.random() < 0.2) this.crescent(x, y, color, ang + Math.PI, 18, 3, 0.25, 0.9);
        break;
      case 'thunder':
        this.add({ kind: 'dot', x, y, vx: rand(-40, 40), vy: rand(-60, 20), size: rand(5, 9), life: 0.45, color: Math.random() < 0.5 ? '#ffb347' : '#fff1b0' });
        if (Math.random() < 0.16 && sp > 800) this.bolt(x, y, ang + Math.PI + rand(-0.6, 0.6), rand(50, 120), '#ffd23f');
        break;
    }
  }
}
