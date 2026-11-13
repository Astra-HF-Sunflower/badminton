import { COURT_L, COURT_R, GROUND, H, NET_H, NET_TOP, NET_X, W } from '../constants';

const FLOOR_TOP = 646;
const FAR = 658;
const NEAR = 872;

/** 地面线的伪透视：越靠近镜头越宽 */
const px = (x: number, y: number) => NET_X + (x - NET_X) * (1 + (y - GROUND) * 0.0005);

// 观众席：确定性随机，避免每帧闪烁
const CROWD = (() => {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cols = ['#5b7fb8', '#b85b7f', '#7fb85b', '#b8a05b', '#8b6fd1', '#4fb3b0', '#d17f5b'];
  const out: { x: number; y: number; c: string; r: number; ph: number }[] = [];
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i < 64; i++) {
      out.push({ x: i * 26 + (row % 2) * 13 + rnd() * 6, y: 480 + row * 29, c: cols[(rnd() * cols.length) | 0], r: 7 + rnd() * 2, ph: rnd() * 6 });
    }
  }
  return out;
})();

const ADS = ['SMASH', 'CLEAR', 'DROP', 'DRIVE', 'LIFT', 'NET', 'FLICK', 'SLICE'];

export function drawBackground(ctx: CanvasRenderingContext2D, time: number, excite: number) {
  // 墙面
  const wall = ctx.createLinearGradient(0, 0, 0, FLOOR_TOP);
  wall.addColorStop(0, '#08102a');
  wall.addColorStop(0.6, '#142a52');
  wall.addColorStop(1, '#1b3868');
  ctx.fillStyle = wall;
  ctx.fillRect(-40, -40, W + 80, FLOOR_TOP + 40);

  // 墙面大字
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  ctx.font = "900 190px system-ui, 'PingFang SC', sans-serif";
  ctx.textAlign = 'center';
  ctx.fillText('BADMINTON', W / 2, 330);
  ctx.restore();

  // 聚光灯
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const x of [320, 800, 1280]) {
    const g = ctx.createLinearGradient(0, 0, 0, FLOOR_TOP);
    g.addColorStop(0, 'rgba(150,195,255,0.16)');
    g.addColorStop(1, 'rgba(150,195,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 16, -10);
    ctx.lineTo(x + 16, -10);
    ctx.lineTo(x + 250, FLOOR_TOP);
    ctx.lineTo(x - 250, FLOOR_TOP);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 观众席
  const stand = ctx.createLinearGradient(0, 450, 0, 620);
  stand.addColorStop(0, 'rgba(6,10,26,0.55)');
  stand.addColorStop(1, 'rgba(6,10,26,0.85)');
  ctx.fillStyle = stand;
  ctx.fillRect(-40, 450, W + 80, 172);
  for (const c of CROWD) {
    const bob = -Math.abs(Math.sin(time * 5 + c.ph)) * excite * 9;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = c.c;
    ctx.beginPath();
    ctx.arc(c.x, c.y + bob, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 17 + bob, c.r + 3, 10, 0, Math.PI, 0);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 广告牌
  const adY = 622;
  ctx.fillStyle = '#0c1630';
  ctx.fillRect(-40, adY, W + 80, FLOOR_TOP - adY + 4);
  ADS.forEach((t, i) => {
    const x = i * 200;
    ctx.fillStyle = i % 2 ? 'rgba(80,140,255,0.16)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(x + 2, adY + 3, 196, FLOOR_TOP - adY - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = "800 15px system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.split('').join(' '), x + 100, adY + 13);
  });
  ctx.fillStyle = '#33d1c4';
  ctx.fillRect(-40, adY - 2, W + 80, 3);

  // 地面
  const floor = ctx.createLinearGradient(0, FLOOR_TOP, 0, H);
  floor.addColorStop(0, '#1b6f70');
  floor.addColorStop(0.5, '#175c5f');
  floor.addColorStop(1, '#0d3b44');
  ctx.fillStyle = floor;
  ctx.fillRect(-40, FLOOR_TOP, W + 80, H - FLOOR_TOP + 40);

  // 球场底色
  ctx.beginPath();
  ctx.moveTo(px(COURT_L, FAR), FAR);
  ctx.lineTo(px(COURT_R, FAR), FAR);
  ctx.lineTo(px(COURT_R, NEAR), NEAR);
  ctx.lineTo(px(COURT_L, NEAR), NEAR);
  ctx.closePath();
  const court = ctx.createLinearGradient(0, FAR, 0, NEAR);
  court.addColorStop(0, '#2aa397');
  court.addColorStop(1, '#1f8b86');
  ctx.fillStyle = court;
  ctx.fill();

  // 球场线
  ctx.strokeStyle = 'rgba(255,255,255,0.88)';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  const vline = (x: number, w = 3.5) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(px(x, FAR), FAR);
    ctx.lineTo(px(x, NEAR), NEAR);
    ctx.stroke();
  };
  vline(COURT_L);
  vline(COURT_R);
  vline(NET_X - 198, 2.5);
  vline(NET_X + 198, 2.5);
  for (const y of [FAR, NEAR]) {
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(px(COURT_L, y), y);
    ctx.lineTo(px(COURT_R, y), y);
    ctx.stroke();
  }
  // 中线
  ctx.lineWidth = 2.5;
  const mid = (FAR + NEAR) / 2;
  ctx.beginPath();
  ctx.moveTo(px(COURT_L, mid), mid);
  ctx.lineTo(px(NET_X - 198, mid), mid);
  ctx.moveTo(px(NET_X + 198, mid), mid);
  ctx.lineTo(px(COURT_R, mid), mid);
  ctx.stroke();
}

/** 球网：sway 为受击后的摆动 */
export function drawNet(ctx: CanvasRenderingContext2D, sway: number) {
  ctx.save();
  // 地面投影
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(NET_X, GROUND + 6, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const topX = NET_X + sway;
  const hw = 10;
  // 网面
  ctx.beginPath();
  ctx.moveTo(topX - hw, NET_TOP);
  ctx.lineTo(topX + hw, NET_TOP);
  ctx.lineTo(NET_X + hw, GROUND);
  ctx.lineTo(NET_X - hw, GROUND);
  ctx.closePath();
  ctx.fillStyle = 'rgba(235,245,255,0.12)';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(235,245,255,0.45)';
  ctx.lineWidth = 1;
  for (let y = NET_TOP - 30; y < GROUND + 30; y += 11) {
    ctx.beginPath();
    ctx.moveTo(NET_X - 30, y);
    ctx.lineTo(NET_X + 30, y + 30);
    ctx.moveTo(NET_X + 30, y);
    ctx.lineTo(NET_X - 30, y + 30);
    ctx.stroke();
  }
  ctx.restore();
  // 立柱
  const post = ctx.createLinearGradient(NET_X - 5, 0, NET_X + 5, 0);
  post.addColorStop(0, '#9fb0c8');
  post.addColorStop(0.5, '#f1f5fb');
  post.addColorStop(1, '#8798b2');
  ctx.fillStyle = post;
  ctx.beginPath();
  ctx.roundRect(NET_X - 5, NET_TOP - NET_H * 0.12, 10, NET_H * 1.12 + 6, 4);
  ctx.fill();
  // 网带
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(topX - 15, NET_TOP - 5, 30, 10, 5);
  ctx.fill();
  ctx.restore();
}
