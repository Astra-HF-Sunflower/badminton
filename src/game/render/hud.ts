
import { GROUND, Side, W, clamp } from '../constants';
import { characterOf, skillKeyLabel } from '../characters';
import { SHOT_BY_ID, playStyleOf } from '../shots';
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
  text(ctx, `${s.court.label} · 先到 ${s.target} 分`, cx, 40, 14, 'rgba(210,225,255,0.65)', 'center', 700);
  text(ctx, ':', cx, 74, 40, 'rgba(255,255,255,0.35)', 'center', 900);

  if (s.rally >= 3 && s.phase === 'rally') {
    const heat = Math.min(1, s.rally / 14);
    const col = heat > 0.6 ? '#ff7a4d' : heat > 0.3 ? '#ffd23f' : '#9be3ff';
    panel(ctx, cx - 74, 114, 148, 34, 17, 0.5);
    text(ctx, `连续回合 ${s.rally}`, cx, 132, 16, col);
  }
}

/** 头顶的「招式占比」：堆叠比例条 + 使用最多的前三招 */
function drawUsage(ctx: CanvasRenderingContext2D, s: Scene, side: Side) {
  const tally = s.usage[side];
  let total = 0;
  for (const n of tally.values()) total += n;
  if (total === 0) return;

  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 3);
  const h = 22 + top.length * 14;
  const w = 152;
  const x = clamp(s.players[side].pose.head.x, 90, W - 90);
  const y = clamp(s.players[side].pose.head.y - h - 52, 168, GROUND - 210);

  panel(ctx, x - w / 2, y, w, h, 11, 0.45);
  text(ctx, `出招 ${total} 次`, x, y + 12, 10.5, 'rgba(226,238,255,0.92)', 'center', 800);

  const bx = x - w / 2 + 9;
  const bw = w - 18;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(bx, y + 20, bw, 4.5, 2.5);
  ctx.clip();
  let cur = bx;
  for (const [id, n] of sorted) {
    const seg = (bw * n) / total;
    ctx.fillStyle = SHOT_BY_ID[id].color;
    ctx.fillRect(cur, y + 20, Math.max(1, seg), 4.5);
    cur += seg;
  }
  ctx.restore();

  top.forEach(([id, n], i) => {
    const shot = SHOT_BY_ID[id];
    const yy = y + 35 + i * 14;
    ctx.beginPath();
    ctx.arc(bx + 3, yy, 3, 0, Math.PI * 2);
    ctx.fillStyle = shot.color;
    ctx.fill();
    text(ctx, shot.name, bx + 10, yy, 10.5, '#eef4ff', 'left', 800);
    text(ctx, `${Math.round((n / total) * 100)}%`, x + w / 2 - 9, yy, 10.5, shot.color, 'right', 900);
  });
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
  for (const shot of s.shots) {
    const x = x0 + 8 + shot.col * (cw + 3);
    const y = y0 + 30 + shot.row * (ch + 3);
    const used = Math.max(0, 1 - (s.time - (s.used.get(`${side}:${shot.id}`) ?? -9)) * 3.2);
    const cd = s.cooldown[side]?.get(shot.id) ?? 0;
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
    if (cd > 0) {
      ctx.globalAlpha = Math.min(1, cd);
      text(ctx, `${cd.toFixed(1)}s`, x + 38, y + 29, 11, '#9aa8c4', 'left', 700);
      ctx.globalAlpha = 1;
    } else {
      text(ctx, `+${shot.points} 分`, x + 38, y + 29, 11, shot.color, 'left', 700);
    }
  }
}

/** 头顶的蓄力环 */
function drawCharge(ctx: CanvasRenderingContext2D, s: Scene, side: Side) {
  const p = s.players[side];
  if (!p.charge) return;
  const r = p.chargeRatio;
  const x = p.x;
  const y = p.pose.head.y - 52;
  const rad = 24;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = r >= 0.98 ? '#fff3b0' : '#ffd93d';
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 14 + r * 22;
  ctx.beginPath();
  ctx.arc(x, y, rad, -Math.PI / 2, -Math.PI / 2 + r * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  if (r >= 0.98) text(ctx, 'MAX', x, y, 13, '#fff8d8', 'center', 900);
  else text(ctx, `${Math.round(r * 100)}%`, x, y, 12, '#ffe9a3', 'center', 900);
}

/** 双方技能状态条 */
function drawSkills(ctx: CanvasRenderingContext2D, s: Scene) {
  ([0, 1] as Side[]).forEach((side) => {
    const c = characterOf(s.characters[side]);
    const st = s.skills[side];
    const w = 300;
    const h = 42;
    const x = W / 2 + (side === 0 ? -w / 2 - 8 : w / 2 + 8);
    const y = GROUND + 24;
    panel(ctx, x - w / 2, y, w, h, 13, 0.55);
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.roundRect(x - w / 2 + 9, y + 9, 4, h - 18, 2);
    ctx.fill();
    text(ctx, c.name, x - w / 2 + 20, y + 14, 13.5, c.color, 'left', 900);
    text(ctx, c.id === 'none' ? '无特殊能力' : c.skill, x - w / 2 + 20, y + 30, 11.5, 'rgba(226,238,255,0.78)', 'left', 700);

    let state: string;
    let col: string;
    if (c.id === 'none') {
      state = '—';
      col = 'rgba(190,202,224,0.45)';
    } else if (st.active > 0) {
      state =
        c.id === 'heaven'
          ? `${st.active.toFixed(1)}s ×${st.level}`
          : c.id === 'crescent'
            ? `${st.active.toFixed(1)}s 重力×${st.level}`
            : `${st.active.toFixed(1)}s`;
      col = c.color;
    } else if (st.cooldown > 0) {
      state = `冷却 ${Math.ceil(st.cooldown)}s`;
      col = 'rgba(170,186,210,0.7)';
    } else {
      state = `就绪 · ${skillKeyLabel(side)}`;
      col = '#9be564';
    }
    text(ctx, state, x + w / 2 - 12, y + h / 2, 13, col, 'right', 900);
  });
}

function drawTips(ctx: CanvasRenderingContext2D, s: Scene) {
  const w = 336;
  const x0 = W - 22 - w;
  const y0 = GROUND + 20;
  panel(ctx, x0, y0, w, 170, 18, 0.55);
  text(ctx, `电脑对手 · ${s.difficultyLabel}`, x0 + w / 2, y0 + 16, 13, s.players[1].color, 'center', 800);
  const tips =
    s.style === 'meme'
      ? [
          ['按住 7 蓄力杀球', '松手就出，蓄越久越快：满蓄 37000 速度'],
          ['没有界线', '两边空气墙打通：飞出去就从另一边飞回来'],
          ['球落地就算', '落在谁半场谁丢分，没有出界'],
          ['9 超级反弹', '3 秒内越弹越快，三秒后才减速'],
          ['C 接球 · Q 技能', '球要正好碰到手；技能见下方状态条'],
        ]
      : [
          ['击球时按住 ← / →', '向前打得更深，向后更短'],
          ['球在最佳距离出手', '“完美击球”额外 +1 分'],
          ['空中按 杀球 / 跳杀', '腾空爆扣威力更大'],
          ['C 接球', '球正好碰到手、且球速不快时能直接接住'],
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
  text(ctx, playStyleOf(s.style).serveHint, x, y + 14, 12, 'rgba(210,225,255,0.75)', 'center', 700);
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
  drawUsage(ctx, s, 0);
  drawUsage(ctx, s, 1);
  drawCharge(ctx, s, 0);
  drawCharge(ctx, s, 1);
  drawSkills(ctx, s);
  drawLegend(ctx, s, 0);
  if (s.mode === 'double') drawLegend(ctx, s, 1);
  else drawTips(ctx, s);
  drawServePrompt(ctx, s);
  drawOffscreen(ctx, s);
  drawBanner(ctx, s);
}
