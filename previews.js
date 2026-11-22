'use strict';
// =====================================================================
// Animated card previews: every level-up option shows a tiny looping
// scene of what it does, instead of a paragraph of text.
// One small canvas per card, one shared animation loop that stops as
// soon as the cards leave the screen.
// =====================================================================
const PV_W = 92, PV_H = 60, PV_RES = 2;
function pv(u) {
  const id = u.ult ? 'ult' : u.id;
  return `<canvas class="pv" data-pv="${id}" data-col="${u.col}" width="${PV_W * PV_RES}" height="${PV_H * PV_RES}" aria-hidden="true"></canvas>`;
}
let pvRunning = false;
function pvStart() {
  if (pvRunning) return; pvRunning = true;
  const t0 = performance.now();
  const tick = now => {
    const list = document.querySelectorAll('canvas.pv');
    if (!list.length || G.state !== 'levelup') { pvRunning = false; return; } // menu closed: stop animating
    const t = (now - t0) / 1000;
    list.forEach(c => { const g = c.getContext('2d'); g.setTransform(PV_RES, 0, 0, PV_RES, 0, 0); g.clearRect(0, 0, PV_W, PV_H); pvScene(g, c.dataset.pv, c.dataset.col, t); });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
// tiny drawing kit
const PVK = {
  ship(g, x, y, a = 0, col = '#4fd8f0') { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.beginPath(); g.moveTo(8, 0); g.lineTo(-6, -6); g.lineTo(-3, 0); g.lineTo(-6, 6); g.closePath(); g.fill(); g.restore(); },
  foe(g, x, y, r = 6, col = '#ff4d6d', a = 1) { g.globalAlpha = a; g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = '#0b0c1c'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.1, r * 0.18, 0, 7); g.arc(x + r * 0.3, y - r * 0.1, r * 0.18, 0, 7); g.fill(); g.globalAlpha = 1; },
  shot(g, x, y, a = 0, s = 1, col = '#e8fdff') { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, 4 * s, 1.6 * s, 0, 0, 7); g.fill(); g.restore(); },
  ring(g, x, y, r, col, w = 2, a = 1) { g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(x, y, Math.max(0, r), 0, 7); g.stroke(); g.globalAlpha = 1; }, // never a negative radius (it threw mid-frame)
  txt(g, x, y, s, col, size = 10) { g.font = `900 ${size}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(s, x, y); },
  lerp: (a, b, k) => a + (b - a) * k,
};
function pvScene(g, id, col, t) {
  const K = PVK, L = 1.6, k = (t % L) / L, sx = 14, sy = 30;
  g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, 0, PV_W, PV_H);
  const stream = (angles, speed = 1, offs = [0]) => { for (const a of angles) for (const o of offs) for (let i = 0; i < 3; i++) { const p = ((k * speed + i / 3) % 1) * 80; K.shot(g, sx + Math.cos(a) * p - Math.sin(a) * o, sy + Math.sin(a) * p + Math.cos(a) * o, a); } };
  switch (id) {
    case 'front': { K.ship(g, sx, sy); const n = 1 + Math.min(3, (LV.front || 0) + 1); const offs = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * 6); stream([0], 1, offs); K.foe(g, 80, 30); break; }
    case 'diag': K.ship(g, sx, sy); stream([0, -0.55, 0.55]); K.foe(g, 80, 30); K.foe(g, 72, 6, 5); K.foe(g, 72, 54, 5); break;
    case 'side': K.ship(g, 46, sy); for (const a of [0, -Math.PI / 2, Math.PI / 2]) for (let i = 0; i < 3; i++) { const p = ((k + i / 3) % 1) * 40; K.shot(g, 46 + Math.cos(a) * p, sy + Math.sin(a) * p, a); } break;
    case 'rear': K.ship(g, 46, sy); for (const a of [0, Math.PI]) for (let i = 0; i < 3; i++) { const p = ((k + i / 3) % 1) * 44; K.shot(g, 46 + Math.cos(a) * p, sy + Math.sin(a) * p, a, a ? 0.8 : 1, a ? '#ffb3c6' : '#e8fdff'); } break;
    case 'ricochet': { const pts = [[sx, sy], [48, 16], [70, 44], [84, 14]]; K.ship(g, sx, sy); for (const [x, y] of pts.slice(1)) K.foe(g, x, y, 5); const seg = Math.min(2.99, k * 3), i = Math.floor(seg), f = seg - i, a = pts[i], b = pts[i + 1]; g.strokeStyle = 'rgba(176,107,255,.5)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(a[0], a[1]); for (let j = i + 1; j <= 3; j++) g.lineTo(pts[j][0], pts[j][1]); g.stroke(); g.setLineDash([]); K.shot(g, K.lerp(a[0], b[0], f), K.lerp(a[1], b[1], f), Math.atan2(b[1] - a[1], b[0] - a[0]), 1.1, '#d9b8ff'); break; }
    case 'split': { K.ship(g, sx, sy); K.foe(g, 50, 30); if (k < 0.45) K.shot(g, sx + (50 - sx) * k / 0.45, sy, 0); else { const p = (k - 0.45) / 0.55 * 36; K.shot(g, 50 + p, 30 - p * 0.6, -0.55, 0.8, '#d9b8ff'); K.shot(g, 50 + p, 30 + p * 0.6, 0.55, 0.8, '#d9b8ff'); } break; }
    case 'pierce': { K.ship(g, sx, sy); const x = sx + k * 80; K.foe(g, 44, 30, 6, x > 40 && x < 52 ? '#fff' : '#ff4d6d'); K.foe(g, 66, 30, 6, x > 62 && x < 74 ? '#fff' : '#ff4d6d'); K.shot(g, x, sy, 0, 1.2, '#d9b8ff'); break; }
    case 'homing': { K.ship(g, sx, sy); K.foe(g, 74, 12); const x = sx + k * 60, y = sy - Math.pow(k, 2) * 18; K.shot(g, x, y, -k * 0.8); g.strokeStyle = 'rgba(176,107,255,.35)'; g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(50, sy, 74, 12); g.stroke(); break; }
    case 'explosive': { K.ship(g, sx, sy); K.foe(g, 60, 30, 6, '#ff4d6d', k < 0.5 ? 1 : 0.3); if (k < 0.5) K.shot(g, sx + (60 - sx) * k / 0.5, sy, 0); else { const r = (k - 0.5) / 0.5 * 22; K.ring(g, 60, 30, r, '#ff8a3c', 3, 1 - (k - 0.5) * 2); g.globalAlpha = 1 - (k - 0.5) * 2; g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(60, 30, r * 0.4, 0, 7); g.fill(); g.globalAlpha = 1; } break; }
    case 'big': { K.ship(g, sx, sy); K.foe(g, 80, 30); const lv = (LV.big || 0) + 1; for (let i = 0; i < 2; i++) { const p = ((k + i / 2) % 1) * 62; K.shot(g, sx + 6 + p, sy, 0, 1 + lv * 0.35, '#ffb547'); } break; }
    case 'burn': { K.foe(g, 46, 32, 9); for (let i = 0; i < 6; i++) { const ph = (k * 2 + i / 6) % 1; g.globalAlpha = 1 - ph; g.fillStyle = i % 2 ? '#ff8a3c' : '#ffe14d'; g.beginPath(); g.arc(40 + i * 2.5, 26 - ph * 20, 3 - ph * 2, 0, 7); g.fill(); } g.globalAlpha = 1; K.txt(g, 74, 18, '-' + (3 + 2 * ((LV.burn || 0) + 1)) * 4 + '/s', '#ff8a3c', 9); break; }
    case 'freeze': { const x = 80 - (k * 34) % 34; K.ship(g, sx, sy); K.foe(g, x, 30, 7, '#6fc3ff'); K.ring(g, x, 30, 10, '#bfe6ff', 2); K.txt(g, 46, 10, 'SLOW 55%', '#6fc3ff', 9); break; }
    case 'poison': { K.foe(g, 46, 34, 9, '#7a3f8f'); const st = 1 + Math.floor(k * 4); for (let i = 0; i < st; i++) { g.fillStyle = '#5cffb0'; g.beginPath(); g.arc(34 + i * 8, 14, 3, 0, 7); g.fill(); } for (let i = 0; i < 4; i++) { const ph = (k * 1.5 + i / 4) % 1; g.globalAlpha = 1 - ph; g.fillStyle = '#5cffb0'; g.beginPath(); g.arc(40 + i * 4, 30 - ph * 14, 2, 0, 7); g.fill(); } g.globalAlpha = 1; K.txt(g, 76, 34, 'x' + st, '#5cffb0', 11); break; }
    case 'crit': { K.ship(g, sx, sy); K.foe(g, 66, 32); if (k < 0.4) K.shot(g, sx + (66 - sx) * k / 0.4, sy, 0); else K.txt(g, 66, 30 - (k - 0.4) * 30, '2× !', '#ffe14d', 12 + (k < 0.5 ? (k - 0.4) * 60 : 6)); break; }
    case 'headshot': { K.ship(g, sx, sy); if (k < 0.4) { K.foe(g, 66, 30); K.shot(g, sx + (66 - sx) * k / 0.4, sy, 0); } else { K.foe(g, 66, 30, 6, '#ff4d6d', Math.max(0, 1 - (k - 0.4) * 4)); K.txt(g, 66, 26 - (k - 0.4) * 14, '☠', '#ffe14d', 16); } break; }
    case 'rapid': { K.ship(g, sx, sy); const n = 4 + ((LV.rapid || 0) + 1) * 2; for (let i = 0; i < n; i++) { const p = ((k * 2 + i / n) % 1) * 66; K.shot(g, sx + 6 + p, sy, 0, 0.9, '#ffe14d'); } K.foe(g, 82, 30); break; }
    case 'leech': { K.ship(g, sx + 4, sy); K.foe(g, 70, 30, 6, '#ff4d6d', k < 0.3 ? 1 : 0); if (k >= 0.3) { const f = (k - 0.3) / 0.7; K.txt(g, K.lerp(70, sx + 6, f), K.lerp(30, sy - 10, f) - Math.sin(f * 3.14) * 12, '♥', '#ff4d6d', 13); } break; }
    case 'shieldup': { K.ship(g, 46, 30); K.ring(g, 46, 30, 14 + Math.sin(t * 5) * 1.5, '#7fd1ff', 3, 0.9); K.txt(g, 46, 10, 'LEVEL UP', '#7fd1ff', 8); if (k > 0.5) K.txt(g, 70, 30, 'BLOCK', '#fff', 8); break; }
    case 'heal': K.txt(g, 46, 30, '✚', '#5cffb0', 26 + Math.sin(t * 4) * 3); break;
    // hero skills and ultimates
    case 'h_q': case 'h_w': case 'ult': pvHero(g, id, col, t, k); break;
    default: K.txt(g, 46, 30, '?', col, 20);
  }
}
function pvHero(g, id, col, t, k) {
  const K = PVK, h = G.hero || 'stormcaller';
  K.ship(g, 18, 30, 0, col);
  if (h === 'stormcaller') {
    if (id === 'h_q') { const x = 22 + k * 64; g.fillStyle = '#bff9ff'; g.beginPath(); g.arc(x, 30, 5, 0, 7); g.fill(); K.ring(g, x, 30, 9 + Math.sin(t * 20) * 2, '#4fd8f0', 1.5); for (const fx of [46, 70]) if (Math.abs(x - fx) < 14) { g.strokeStyle = '#ffe14d'; g.beginPath(); g.moveTo(x, 30); g.lineTo(fx, 14); g.stroke(); K.foe(g, fx, 14, 5); } else K.foe(g, fx, 14, 5); }
    else if (id === 'h_w') { K.ring(g, 18, 30, k * 40, '#4fd8f0', 3, 1 - k); K.foe(g, 46, 14, 5); K.foe(g, 50, 44, 5); }
    else { for (let i = 0; i < 3; i++) { const x = 34 + i * 22, on = (k * 3 + i) % 1 < 0.35; K.foe(g, x, 44, 5); if (on) { g.strokeStyle = '#bff9ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 4, 0); g.lineTo(x + 3, 20); g.lineTo(x - 2, 24); g.lineTo(x, 44); g.stroke(); } } }
  } else if (h === 'pyro') {
    if (id === 'h_q') { g.globalAlpha = 1 - k; g.fillStyle = '#ff8a3c'; g.beginPath(); g.moveTo(24, 30); g.arc(24, 30, 10 + k * 56, -0.5, 0.5); g.closePath(); g.fill(); g.globalAlpha = 1; K.foe(g, 64, 30, 5); }
    else if (id === 'h_w') { for (let i = 0; i < 6; i++) { const x = 30 + i * 10, a = 1 - ((k + i / 6) % 1); g.globalAlpha = a * 0.8; g.fillStyle = i % 2 ? '#ff8a3c' : '#ffe14d'; g.beginPath(); g.arc(x, 34, 5, 0, 7); g.fill(); } g.globalAlpha = 1; K.foe(g, 60, 30, 5); }
    else { const y = k * 44; g.fillStyle = '#ffb547'; g.beginPath(); g.arc(60, y, 5, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,107,60,.6)'; g.beginPath(); g.moveTo(60, y); g.lineTo(52, y - 14); g.stroke(); K.foe(g, 60, 46, 5, '#ff4d6d', k < 0.9 ? 1 : 0.3); if (k > 0.85) K.ring(g, 60, 46, (k - 0.85) * 120, '#ff6b3c', 3); }
  } else {
    if (id === 'h_q') { const n = (LV.h_q || 1) + 1; for (let i = 0; i < n; i++) { const a = t * 4 + i * 6.28 / n; K.txt(g, 46 + Math.cos(a) * 20, 30 + Math.sin(a) * 20, '✦', '#d9b8ff', 11); } K.ship(g, 46, 30, 0, col); }
    else if (id === 'h_w') { K.ship(g, 46, 30, 0, col); K.ring(g, 46, 30, k * 34, '#9b7bff', 3, 1 - k); K.foe(g, 78, 30, 5); }
    else { K.ship(g, 46, 30, 0, col); g.globalAlpha = 0.35 + Math.sin(t * 6) * 0.1; g.fillStyle = '#9b7bff'; g.beginPath(); g.arc(46, 30, 22, 0, 7); g.fill(); g.globalAlpha = 1; K.ring(g, 46, 30, 22, '#e6dcff', 2); K.foe(g, 46 + 26 + k * 14, 30, 5); }
  }
}
// level-up cards use the previews: swap the icon for the scene and keep one short line of numbers
const _levelUpScreenPV = levelUpScreen;
levelUpScreen = function () { _levelUpScreenPV(); pvStart(); };
