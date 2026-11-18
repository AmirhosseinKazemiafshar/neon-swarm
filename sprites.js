'use strict';
// =====================================================================
// Procedural sprite factory. Every sprite is drawn once into an
// offscreen canvas (2x resolution) and cached; the game only blits.
// Style rules borrowed from the genre (Brotato / 20 Minutes Till Dawn /
// Vampire Survivors): thick dark outline, 2-tone shading + highlight,
// big readable eyes, every enemy has a unique silhouette.
// =====================================================================
const SPR = (() => {
  const OUT = '#0b0c1c', RES = 2, cache = {};
  function mk(key, w, h, fn) {
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas'); c.width = w * RES; c.height = h * RES;
    const g = c.getContext('2d'); g.scale(RES, RES); g.translate(w / 2, h / 2); g.lineJoin = 'round'; g.lineCap = 'round';
    fn(g); c.w = w; c.h = h; return (cache[key] = c);
  }
  // outline then fill: the stroke's outer half becomes the outline
  function ink(g, fill, lw = 4) { g.lineWidth = lw; g.strokeStyle = OUT; g.stroke(); g.fillStyle = fill; g.fill(); }
  function rad(g, x, y, r, c0, c1) { const gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; }
  function shine(g, x, y, rx, ry, rot = -0.5, a = 0.55) { g.save(); g.globalAlpha = a; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); g.restore(); }
  function eye(g, x, y, r, look = 1, angry = 0) {
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y, r * 0.85, r, 0, 0, Math.PI * 2); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke(); g.fill();
    g.fillStyle = OUT; g.beginPath(); g.arc(x + r * 0.3 * look, y + r * 0.1, r * 0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x + r * 0.45 * look, y - r * 0.15, r * 0.17, 0, Math.PI * 2); g.fill();
    if (angry) { g.strokeStyle = OUT; g.lineWidth = 2.6; g.beginPath(); g.moveTo(x - r, y - r * 1.25 - angry); g.lineTo(x + r * 0.8, y - r * 0.85); g.stroke(); }
  }

  // ---------- enemies (all face right; the game flips them) ----------
  const ENEMY = {
    // Grunt: angry slime blob
    grunt: f => mk('grunt' + f, 40, 40, g => {
      const sq = f ? 1.06 : 1;
      g.save(); g.scale(sq, 2 - sq);
      g.beginPath(); g.moveTo(-15, 9); g.bezierCurveTo(-17, -5, -9, -16, 0, -16); g.bezierCurveTo(9, -16, 17, -5, 15, 9); g.quadraticCurveTo(0, 15, -15, 9);
      ink(g, rad(g, -4, -7, 20, '#ff9bb0', '#e0284f'));
      g.fillStyle = 'rgba(120,0,30,.35)'; g.beginPath(); g.ellipse(0, 8, 12, 4, 0, 0, Math.PI * 2); g.fill();
      shine(g, -7, -8, 4.5, 2.6);
      eye(g, 1, -3, 4.2, 1, 1); eye(g, 9, -3, 3.6, 1, 0);
      g.strokeStyle = OUT; g.lineWidth = 2.4; g.beginPath(); g.moveTo(10, -9.5); g.lineTo(5, -7.5); g.stroke();
      g.fillStyle = OUT; g.beginPath(); g.ellipse(6, 5, 3.5, 2, 0, 0, Math.PI); g.fill();
      g.restore();
    }),
    // Swarm: buzzing wasp with two wing frames
    swarm: f => mk('swarm' + f, 40, 34, g => {
      g.save(); g.globalAlpha = 0.75;
      const wy = f ? -4 : -13;
      g.beginPath(); g.ellipse(-4, wy, 9, 5, f ? -0.2 : -0.9, 0, Math.PI * 2); ink(g, 'rgba(220,245,255,.85)', 2.5);
      g.beginPath(); g.ellipse(3, wy + 1, 8, 4.5, f ? 0.2 : -0.6, 0, Math.PI * 2); ink(g, 'rgba(220,245,255,.85)', 2.5);
      g.restore();
      g.beginPath(); g.ellipse(-6, 3, 9, 7, 0, 0, Math.PI * 2); ink(g, rad(g, -8, 0, 12, '#ffe08a', '#f29b14'));
      g.fillStyle = OUT; for (const x of [-9, -4]) { g.beginPath(); g.ellipse(x, 3, 1.6, 6.5, 0, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.moveTo(-15, 3); g.lineTo(-20, 5); g.lineTo(-15, 6); g.fillStyle = OUT; g.fill();
      g.beginPath(); g.arc(7, 1, 7, 0, Math.PI * 2); ink(g, rad(g, 5, -2, 9, '#ffd36b', '#e8860c'));
      eye(g, 9, 0, 3.6, 1, 1);
      shine(g, -9, -1, 3, 1.6);
    }),
    // Tank: armored crystal beetle
    tank: f => mk('tank' + f, 64, 60, g => {
      g.strokeStyle = OUT; g.lineWidth = 4;
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const lx = -10 + i * 10, k = (i + f) % 2 ? 4 : 0; g.beginPath(); g.moveTo(lx, s * 12); g.lineTo(lx + 4 - k, s * 24); g.lineTo(lx + 8 - k, s * 26); g.stroke(); }
      g.beginPath(); g.ellipse(14, 0, 9, 10, 0, 0, Math.PI * 2); ink(g, '#4a2a7a');
      eye(g, 18, -4, 2.8, 1, 0); eye(g, 18, 4, 2.8, 1, 0);
      g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; g.lineTo(-3 + Math.cos(a) * 21, Math.sin(a) * 19); } g.closePath();
      ink(g, rad(g, -8, -8, 26, '#c79bff', '#6a2fc0'), 5);
      g.strokeStyle = 'rgba(30,10,60,.6)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-3, -18); g.lineTo(-3, 18); g.moveTo(-21, 0); g.lineTo(15, 0); g.stroke();
      g.fillStyle = '#ff7bd5'; g.globalAlpha = 0.9;
      for (const [x, y] of [[-12, -8], [5, -8], [-12, 8], [5, 8]]) { g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 3, y); g.lineTo(x, y + 4); g.lineTo(x - 3, y); g.fill(); }
      g.globalAlpha = 1; shine(g, -12, -11, 6, 3, -0.4, 0.45);
    }),
    // Dasher: horned shark
    dasher: f => mk('dasher' + f, 54, 36, g => {
      g.beginPath(); g.moveTo(-6, -8); g.lineTo(-2, -17); g.lineTo(6, -8); ink(g, '#1b8fc4', 3.5);
      g.beginPath(); g.moveTo(-20, 0); g.lineTo(-27, f ? -9 : -6); g.lineTo(-24, 0); g.lineTo(-27, f ? 9 : 6); g.closePath(); ink(g, '#1b8fc4', 3.5);
      g.beginPath(); g.moveTo(22, 0); g.bezierCurveTo(14, -11, -10, -12, -21, 0); g.bezierCurveTo(-10, 11, 14, 11, 22, 0);
      ink(g, rad(g, 4, -5, 22, '#9ff0ff', '#1aa6d9'));
      g.fillStyle = '#e9fbff'; g.beginPath(); g.moveTo(20, 1); g.bezierCurveTo(10, 8, -8, 8, -16, 2); g.bezierCurveTo(-6, 4, 8, 4, 20, 1); g.fill();
      g.strokeStyle = OUT; g.lineWidth = 1.8; for (const x of [2, 5, 8]) { g.beginPath(); g.moveTo(x, -4); g.lineTo(x - 1, 2); g.stroke(); }
      g.fillStyle = '#ff2e63'; g.beginPath(); g.arc(13, -3, 2.8, 0, Math.PI * 2); g.fill(); g.lineWidth = 1.5; g.stroke();
      g.beginPath(); g.moveTo(22, 0); g.lineTo(30, -3); g.lineTo(22, -3); ink(g, '#fff', 2);
      shine(g, 2, -6, 6, 1.8, -0.1, 0.5);
    }),
  };

  // Boss parts: spiky shell (rotates) + body (static) — iris is drawn live
  const bossShell = () => mk('bossShell', 150, 150, g => {
    g.beginPath(); for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12, r = k % 2 ? 50 : 66; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath();
    ink(g, rad(g, -12, -12, 70, '#ff8fb0', '#9b1238'), 5);
  });
  const bossBody = () => mk('bossBody', 120, 120, g => {
    g.beginPath(); g.arc(0, 0, 44, 0, Math.PI * 2); ink(g, rad(g, -12, -14, 50, '#ffd0de', '#c2164a'), 5);
    for (const [x, y, r] of [[-26, -18, 5], [24, -22, 4.5], [-28, 16, 4], [26, 18, 5], [0, -34, 4], [2, 34, 4.5]]) eye(g, x, y, r, 0, 0);
    g.beginPath(); g.arc(0, 0, 21, 0, Math.PI * 2); ink(g, '#fff6e0', 4);
    shine(g, -18, -22, 10, 5, -0.6, 0.4);
  });

  // ---------- hero ship ----------
  const ship = () => mk('ship', 56, 52, g => {
    g.beginPath(); g.moveTo(-6, -6); g.lineTo(-14, -22); g.lineTo(-4, -22); g.lineTo(10, -6); g.closePath(); ink(g, '#1e7fa8', 3.5);
    g.beginPath(); g.moveTo(-6, 6); g.lineTo(-14, 22); g.lineTo(-4, 22); g.lineTo(10, 6); g.closePath(); ink(g, '#1e7fa8', 3.5);
    g.fillStyle = '#ffb547'; g.fillRect(-14, -22, 6, 3); g.fillRect(-14, 19, 6, 3);
    g.beginPath(); g.moveTo(24, 0); g.bezierCurveTo(16, -10, -8, -11, -16, -6); g.lineTo(-12, 0); g.lineTo(-16, 6); g.bezierCurveTo(-8, 11, 16, 10, 24, 0);
    ink(g, (() => { const gr = g.createLinearGradient(0, -10, 0, 10); gr.addColorStop(0, '#d8fbff'); gr.addColorStop(0.5, '#4fd8f0'); gr.addColorStop(1, '#1c86b0'); return gr; })(), 4);
    g.beginPath(); g.ellipse(6, 0, 7, 4.2, 0, 0, Math.PI * 2); ink(g, rad(g, 8, -2, 8, '#ffffff', '#3b5bff'), 2.5);
    g.strokeStyle = 'rgba(11,12,28,.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-4, -6); g.lineTo(-10, 0); g.lineTo(-4, 6); g.stroke();
    g.fillStyle = '#ff2e63'; g.beginPath(); g.arc(-12, 0, 2.2, 0, Math.PI * 2); g.fill();
  });

  // ---------- pickups ----------
  const gem = big => mk('gem' + big, 22, 26, g => {
    const c0 = big ? '#b8ffdd' : '#bfe6ff', c1 = big ? '#18c27a' : '#2a7dff', s = big ? 1.15 : 0.9;
    g.scale(s, s);
    g.beginPath(); g.moveTo(0, -10); g.lineTo(7, -3); g.lineTo(0, 10); g.lineTo(-7, -3); g.closePath(); ink(g, c1, 2.5);
    g.fillStyle = c0; g.beginPath(); g.moveTo(0, -10); g.lineTo(7, -3); g.lineTo(0, -1); g.lineTo(-7, -3); g.fill();
    g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.moveTo(-2, -7); g.lineTo(0, -9); g.lineTo(1, -4); g.fill();
  });
  const heart = () => mk('heart', 34, 32, g => {
    g.beginPath(); g.moveTo(0, 11); g.bezierCurveTo(-18, -1, -10, -16, 0, -6); g.bezierCurveTo(10, -16, 18, -1, 0, 11); ink(g, rad(g, -4, -6, 14, '#ff9bb0', '#e0284f'), 3.5);
    shine(g, -6, -5, 3.5, 2, -0.7, 0.7);
  });
  const magnet = () => mk('magnet', 34, 34, g => {
    g.lineWidth = 10; g.strokeStyle = OUT; g.beginPath(); g.arc(0, -1, 9, Math.PI, 0); g.lineTo(9, 9); g.moveTo(-9, -1); g.lineTo(-9, 9); g.stroke();
    g.lineWidth = 6; g.strokeStyle = '#ff2e63'; g.beginPath(); g.arc(0, -1, 9, Math.PI, 0); g.lineTo(9, 5); g.moveTo(-9, -1); g.lineTo(-9, 5); g.stroke();
    g.fillStyle = '#e8ecff'; g.fillRect(-12, 5, 6, 5); g.fillRect(6, 5, 6, 5);
  });

  // power core: gold hex chip with a "P"
  const power = () => mk('power', 36, 36, g => {
    g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; g.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); } g.closePath();
    ink(g, rad(g, -4, -5, 16, '#fff6c2', '#f0a400'), 3.5);
    g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; g.lineTo(Math.cos(a) * 8.5, Math.sin(a) * 8.5); } g.closePath();
    g.fillStyle = 'rgba(120,60,0,.25)'; g.fill();
    g.font = '900 13px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = OUT; g.strokeText('P', 0, 1); g.fillStyle = '#fff'; g.fillText('P', 0, 1);
    shine(g, -5, -7, 3.5, 1.8, -0.5, 0.7);
  });

  // ---------- projectiles ----------
  const bolt = () => mk('bolt', 30, 12, g => {
    g.beginPath(); g.moveTo(12, 0); g.lineTo(-12, -3.5); g.lineTo(-12, 3.5); g.closePath(); g.fillStyle = 'rgba(60,240,255,.55)'; g.fill();
    g.beginPath(); g.ellipse(4, 0, 8, 3, 0, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  });
  const orb = () => mk('orb', 20, 20, g => { g.beginPath(); g.arc(0, 0, 6.5, 0, Math.PI * 2); ink(g, rad(g, -2, -2, 8, '#ffffff', '#ff4d7e'), 3); });
  const blade = () => mk('blade', 36, 36, g => {
    g.beginPath(); for (let k = 0; k < 4; k++) { const q = k * Math.PI / 2; g.lineTo(Math.cos(q) * 15, Math.sin(q) * 15); g.lineTo(Math.cos(q + 0.5) * 6, Math.sin(q + 0.5) * 6); }
    g.closePath(); ink(g, rad(g, -3, -3, 16, '#ffffff', '#b06bff'), 3);
    g.beginPath(); g.arc(0, 0, 3.5, 0, Math.PI * 2); g.fillStyle = OUT; g.fill();
  });

  // ---------- white silhouette (hit flash) ----------
  const whites = new Map();
  function white(src) {
    let c = whites.get(src); if (c) return c;
    c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.w = src.w; c.h = src.h;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    whites.set(src, c); return c;
  }

  // ---------- floor: sci-fi deck plating ----------
  let floorTile = null;
  function floor() {
    if (floorTile) return floorTile;
    const S = 192, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.fillStyle = '#0d1124'; g.fillRect(0, 0, S, S);
    const plates = [[0, 0, 96, 96], [96, 0, 96, 48], [96, 48, 96, 48], [0, 96, 48, 96], [48, 96, 144, 96]];
    for (const [x, y, w, h] of plates) {
      const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#141a35'); gr.addColorStop(1, '#0f1429');
      g.fillStyle = gr; g.fillRect(x + 2, y + 2, w - 4, h - 4);
      g.strokeStyle = 'rgba(120,140,255,.07)'; g.lineWidth = 1; g.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
      g.fillStyle = 'rgba(160,180,255,.12)'; for (const [rx, ry] of [[x + 7, y + 7], [x + w - 7, y + 7], [x + 7, y + h - 7], [x + w - 7, y + h - 7]]) { g.beginPath(); g.arc(rx, ry, 1.6, 0, Math.PI * 2); g.fill(); }
    }
    g.strokeStyle = 'rgba(60,240,255,.05)'; g.lineWidth = 3; g.beginPath(); g.moveTo(96, 66); g.lineTo(186, 66); g.stroke();
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`; g.fillRect(Math.random() * S, Math.random() * S, 1, 1); }
    return (floorTile = c);
  }
  // decorations scattered per chunk
  const DECOR = {
    crystal: c => mk('crys' + c, 60, 60, g => {
      for (const [x, h, w, a] of [[-8, 30, 8, -0.25], [4, 22, 7, 0.3], [-2, 38, 9, 0], [12, 14, 6, 0.5]]) {
        g.save(); g.translate(x, 18); g.rotate(a); g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -h + w); g.lineTo(0, -h); g.lineTo(w / 2, -h + w); g.lineTo(w / 2, 0); g.closePath();
        ink(g, c, 3); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-w / 2 + 1.5, -h + w, 2, h - w - 2); g.restore();
      }
    }),
    vent: () => mk('vent', 60, 40, g => {
      g.beginPath(); g.roundRect(-26, -14, 52, 28, 6); ink(g, '#161c3a', 3);
      g.fillStyle = 'rgba(255,107,60,.55)'; for (let i = 0; i < 5; i++) g.fillRect(-20 + i * 9, -8, 5, 16);
    }),
    rock: () => mk('rock', 50, 40, g => {
      g.beginPath(); g.moveTo(-18, 8); g.lineTo(-14, -6); g.lineTo(-2, -12); g.lineTo(12, -8); g.lineTo(18, 4); g.lineTo(8, 12); g.lineTo(-10, 12); g.closePath();
      ink(g, rad(g, -6, -6, 22, '#3a3f66', '#1f2342'), 3.5); shine(g, -6, -6, 6, 2, -0.4, 0.15);
    }),
    lamp: () => mk('lamp', 30, 30, g => { g.beginPath(); g.arc(0, 0, 7, 0, Math.PI * 2); ink(g, '#2a3160', 3); g.beginPath(); g.arc(0, 0, 3.5, 0, Math.PI * 2); g.fillStyle = '#5cffb0'; g.fill(); }),
  };
  // splat decal left where an enemy dies
  const splat = color => mk('splat' + color, 60, 60, g => {
    g.fillStyle = color; g.globalAlpha = 0.5;
    g.beginPath(); g.ellipse(0, 0, 16, 11, 0.3, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 9; i++) { const a = i * 0.7 + (i % 3), r = 15 + (i % 4) * 4; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r * 0.75, 2 + (i % 3) * 1.5, 0, Math.PI * 2); g.fill(); }
  });

  return { ENEMY, bossShell, bossBody, ship, gem, heart, magnet, power, bolt, orb, blade, white, floor, DECOR, splat, OUT };
})();
