'use strict';
// =====================================================================
// NEON SWARM v4 — systems borrowed from the best of the genre and
// fused into one loop:
//   Vampire Survivors  → treasure chests + weapon evolutions
//   Survivor.io        → homing missiles, drone wingmen, missions
//   Brotato            → coins that drop from enemies, ships with traits
//   20 Minutes Till Dawn → darkness + light around the hero
//   Halls of Torment   → golden elites that carry the loot
// Loaded after game.js; game.js calls the hooks defined here.
// =====================================================================

const WEAPON_IDS = ['orbit', 'chain', 'nova', 'missile', 'drone'];
UPGRADES.push(
  { id: 'missile', icon: '➹', col: '#ff6b3c', name: 'Homing Missiles', max: 5, desc: l => l === 1 ? 'Seeking rockets that explode on impact' : l === 3 || l === 5 ? '+1 missile per salvo, bigger blasts' : 'Bigger blasts, faster reload' },
  { id: 'drone', icon: '⦿', col: '#5cffb0', name: 'Drone Wingmen', max: 5, desc: l => l === 1 ? 'A drone flies with you and shoots' : l === 3 || l === 5 ? '+1 drone' : 'Drones fire faster and harder' },
);
// max weapon + the matching passive → evolution, found in a treasure chest
const EVOLUTIONS = [
  { w: 'orbit', p: 'speed', name: 'Saw Halo', icon: '✺', col: '#d18bff', desc: '8 blades, wider ring, double damage' },
  { w: 'chain', p: 'haste', name: 'Storm Lattice', icon: 'ϟ', col: '#ffe14d', desc: 'Lightning every ½ s with 16 jumps' },
  { w: 'nova', p: 'heart', name: 'Supernova', icon: '✹', col: '#ff6b3c', desc: 'Massive pulse that also heals you' },
  { w: 'missile', p: 'might', name: 'Hellfire Swarm', icon: '☄', col: '#ff2e63', desc: '6 missiles per salvo, cluster blasts' },
  { w: 'drone', p: 'magnet', name: 'Hive Wing', icon: '❖', col: '#5cffb0', desc: '5 drones with twin lasers' },
];
const SHIPS = [
  { id: 'vanguard', name: 'Vanguard', cost: 0, desc: 'Balanced all-rounder', stats: '5 HP · normal speed', apply() {} },
  { id: 'striker', name: 'Striker', cost: 600, desc: 'Fast and fragile · starts with Chain Lightning', stats: '4 HP · +15% speed · quick dash', apply() { P.maxHp -= 1; P.hp = P.maxHp; P.speed *= 1.15; P.dashMul *= 0.75; LV.chain = Math.max(1, LV.chain); } },
  { id: 'bastion', name: 'Bastion', cost: 900, desc: 'Heavy armor · starts with Orbit Blades', stats: '7 HP · −10% speed', apply() { P.maxHp += 2; P.hp = P.maxHp; P.speed *= 0.9; LV.orbit = Math.max(1, LV.orbit); } },
  { id: 'reaper', name: 'Reaper', cost: 1500, desc: 'Glass blade · starts with Homing Missiles', stats: '4 HP · +25% damage · 20% crits', apply() { P.maxHp -= 1; P.hp = P.maxHp; P.might += 0.25; P.crit = Math.max(P.crit, 0.2); LV.missile = 1; } },
];

let EVO = {};
let missiles = [], drones = [], smokes = [], coinDrops = [], flashes = [], trail = [], toasts = [];
function FX_reset() { missiles = []; smokes = []; coinDrops = []; flashes = []; trail = []; }

function onNewRun() {
  EVO = {}; LV.missile = 0; LV.drone = 0; drones = [];
  const s = Save.get();
  G.ship = SHIPS.some(x => x.id === s.ship) ? s.ship : SHIPS[0].id;
  Object.assign(G, { chests: 0, evolved: 0, bossKills: 0, maxTier: 0, nextElite: 50, missionsDone: [], missionResults: [] });
  SHIPS.find(x => x.id === G.ship).apply();
  WP.missileCd = 50; WP.novaCount = 0;
}

// ---------- explosions, coins ----------
function explode(x, y, R, color) {
  if (smokes.length > 120 || flashes.length > 14) R *= 0.8; // crowded screen: keep blasts readable
  ring(x, y, R * 0.2, R, color, 20, 6); ring(x, y, R * 0.1, R * 0.7, '#ffffff', 12, 3);
  burst(x, y, '#ffe9b0', Math.min(24, R / 3 | 0), R / 10, 3, 22); burst(x, y, color, Math.min(20, R / 4 | 0), R / 14, 4, 30);
  for (let i = 0; i < Math.min(9, R / 10 | 0) && smokes.length < 160; i++) {
    const a = Math.random() * TAU, s = rnd(0.3, 1.2) * R / 30;
    smokes.push({ x: x + Math.cos(a) * R * 0.2, y: y + Math.sin(a) * R * 0.2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: R * rnd(0.12, 0.22), vr: R * 0.012, life: 48, max: 48, c: 'rgba(36,32,58,' });
  }
  flashes.push({ x, y, r: R * 0.9, life: 9, max: 9, color });
  shake(Math.min(10, R / 14));
  if (AU.ok('boom', 60)) { AU.noise(0.35, 0.12, 500); AU.tone(70, 0.3, 'sine', 0.12, -30); }
}
function coinBurst(x, y, n) {
  for (let i = 0; i < n && coinDrops.length < 200; i++) { const a = Math.random() * TAU, s = rnd(1.5, 4.5); coinDrops.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, v: 1, t: Math.random() * 6, age: 0 }); }
}
function onKill(e) {
  if (e.type === 'boss') {
    G.bossKills++; coinBurst(e.x, e.y, 25);
    if (G.mode === 'campaign') setTimeout(() => openChest(true), 900); // the sector ends right after, so the chest opens itself
    else items.push({ x: e.x, y: e.y - 40, kind: 'chest', t: 0 });
  } else if (e.elite) {
    items.push({ x: e.x, y: e.y, kind: 'chest', t: 0 }); explode(e.x, e.y, e.r * 3.2, '#ffc94d');
    text(e.x, e.y - e.r - 10, 'ELITE DOWN', '#ffc94d', 20); coinBurst(e.x, e.y, 8);
  } else if (e.type === 'tank') { explode(e.x, e.y, e.r * 2.6, e.color); coinBurst(e.x, e.y, 2); }
  else if (Math.random() < 0.16) coinBurst(e.x, e.y, 1);
}
function spawnElite() {
  const type = D() > 60 ? (Math.random() < 0.5 ? 'tank' : 'grunt') : 'grunt';
  spawn(type); const e = enemies[enemies.length - 1];
  e.elite = true; e.hp = e.max = e.hp * 9; e.r *= 1.5; e.spd *= 0.85; e.xp *= 5;
  toast('★ An elite is coming — it carries a chest', '#ffc94d');
}
function onSupernova() { if (++WP.novaCount % 3 === 0 && P.hp < P.maxHp) { P.hp++; HUD.heartHit = -1; text(P.x, P.y - 30, '+1 HP', '#ff4d6d', 18); } }

// ---------- new weapons ----------
function updateExtraWeapons() {
  if (LV.missile && --WP.missileCd <= 0) {
    const evo = EVO.missile, n = evo ? 6 : 1 + (LV.missile >= 3) + (LV.missile >= 5);
    WP.missileCd = (evo ? 70 : 125 - LV.missile * 10) * P.haste;
    for (let i = 0; i < n; i++) { const a = P.ang + Math.PI + (i - (n - 1) / 2) * 0.55; missiles.push({ x: P.x, y: P.y, ang: a, life: 210, t: 0, target: null }); }
    AU.tone(240, 0.12, 'sawtooth', 0.035, 500);
  }
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i]; m.t++; m.life--;
    if (!m.target || m.target.dead) m.target = nearest(m.x, m.y, 620);
    if (m.target && m.t > 8) { const ta = Math.atan2(m.target.y - m.y, m.target.x - m.x); let d = ta - m.ang; d = Math.atan2(Math.sin(d), Math.cos(d)); m.ang += clamp(d, -0.17, 0.17); }
    const sp = Math.min(8.5, 2.5 + m.t * 0.25); m.x += Math.cos(m.ang) * sp; m.y += Math.sin(m.ang) * sp;
    if (G.frame % 2 === 0 && smokes.length < 160) smokes.push({ x: m.x - Math.cos(m.ang) * 9, y: m.y - Math.sin(m.ang) * 9, vx: 0, vy: 0, r: 3, vr: 0.3, life: 24, max: 24, c: 'rgba(110,115,150,' });
    let hit = m.life <= 0;
    if (!hit) near(m.x, m.y, 40, e => { if (!e.dead && e.spawnT <= 0 && (e.x - m.x) ** 2 + (e.y - m.y) ** 2 < (e.r + 7) ** 2) { hit = true; return false; } });
    if (hit) {
      missiles.splice(i, 1);
      const R = (44 + LV.missile * 8) * (EVO.missile ? 1.2 : 1) * BLASTR(), dmg = (22 + LV.missile * 6) * (EVO.missile ? 1.3 : 1);
      const blast = (x, y, r, dm) => { explode(x, y, r, '#ff6b3c'); near(x, y, r, e => { const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1; if (d < r + e.r) damage(e, dm, dx / d * 5, dy / d * 5); }); };
      blast(m.x, m.y, R, dmg);
      if (EVO.missile) for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + Math.random(); blast(m.x + Math.cos(a) * R * 0.8, m.y + Math.sin(a) * R * 0.8, R * 0.55, dmg * 0.5); }
    }
  }
  const dn = LV.drone ? (EVO.drone ? 5 : 1 + (LV.drone >= 3) + (LV.drone >= 5)) + (SETB.tech3 ? 1 : 0) : 0;
  while (drones.length < dn) drones.push({ x: P.x, y: P.y, cd: 20 + drones.length * 7, ang: 0 });
  drones.length = dn;
  drones.forEach((d, i) => {
    const a = G.frame * 0.03 + i * TAU / dn, tx = P.x + Math.cos(a) * 50, ty = P.y + Math.sin(a) * 50 - 6;
    d.x = lerp(d.x, tx, 0.12); d.y = lerp(d.y, ty, 0.12);
    if (--d.cd <= 0) {
      const t = nearest(d.x, d.y, 380);
      if (t) {
        d.cd = (EVO.drone ? 22 : 46 - LV.drone * 4) * P.haste * (SETB.tech6 ? 0.65 : 1); d.ang = Math.atan2(t.y - d.y, t.x - d.x);
        const shots = EVO.drone ? 2 : 1;
        for (let k = 0; k < shots; k++) { const off = (k - (shots - 1) / 2) * 7; bullets.push({ x: d.x - Math.sin(d.ang) * off, y: d.y + Math.cos(d.ang) * off, vx: Math.cos(d.ang) * 12, vy: Math.sin(d.ang) * 12, life: 40, pierce: 0, dmg: (8 + LV.drone * 2) * (EVO.drone ? 1.4 : 1), hitSet: null, lv: 1 }); }
        if (AU.ok('drone', 90)) AU.tone(1500, 0.03, 'square', 0.012, -500);
      } else d.cd = 12;
    }
  });
}

// ---------- per-frame systems ----------
function featureUpdate() {
  worldUpdate();
  if (G.t >= G.nextElite && !G.bossOut && !(G.mode === 'campaign' && G.node === 'boss')) { G.nextElite = G.t + (G.eliteGap || (G.mode === 'campaign' ? 38 : 55)); spawnElite(); }
  G.maxTier = Math.max(G.maxTier, G.tier);
  for (let i = coinDrops.length - 1; i >= 0; i--) {
    const c = coinDrops[i]; c.age++; c.t += 0.15;
    if (c.vx || c.vy) { c.x += c.vx; c.y += c.vy; c.vx *= 0.88; c.vy *= 0.88; if (Math.abs(c.vx) + Math.abs(c.vy) < 0.05) c.vx = c.vy = 0; }
    const dx = P.x - c.x, dy = P.y - c.y, d = Math.hypot(dx, dy) || 1;
    if (c.age > 18 && (c.pull || d < P.magnet * 1.25)) { c.pull = true; c.ps = (c.ps || 0) + 0.8; const sp = Math.min(16, 3 + c.ps); c.x += dx / d * sp; c.y += dy / d * sp; }
    if (d < P.r + 8 && c.age > 10) { coinDrops.splice(i, 1); G.coins += c.v; if (AU.ok('coin', 35)) AU.tone(1650, 0.05, 'square', 0.022, 300); }
  }
  trail.unshift({ x: P.x - Math.cos(P.ang) * 13, y: P.y - Math.sin(P.ang) * 13 }); if (trail.length > 18) trail.pop();
  if (G.frame % 20 === 0) checkMissionsLive();
}

// ---------- drawing (world space) ----------
function drawElite(e) {
  const p = 1 + Math.sin(G.frame * 0.12) * 0.08;
  X.globalCompositeOperation = 'lighter'; glow(e.x, e.y, e.r * 3 * p, '#ffc94d', 0.5); X.globalCompositeOperation = 'source-over'; X.globalAlpha = 1;
  X.strokeStyle = 'rgba(255,201,77,.85)'; X.lineWidth = 3; X.setLineDash([10, 8]); X.lineDashOffset = -G.frame;
  X.beginPath(); X.ellipse(e.x, e.y + e.r * 0.75, e.r * 1.25, e.r * 0.5, 0, 0, TAU); X.stroke(); X.setLineDash([]);
  const w = e.r * 2.2; X.fillStyle = SPR.OUT; X.fillRect(e.x - w / 2 - 1, e.y - e.r - 18, w + 2, 7);
  X.fillStyle = '#ffc94d'; X.fillRect(e.x - w / 2, e.y - e.r - 17, w * Math.max(0, e.hp / e.max), 5);
  X.font = '900 13px system-ui'; X.textAlign = 'center'; X.textBaseline = 'middle'; X.fillStyle = '#ffc94d'; X.fillText('★', e.x, e.y - e.r - 28);
}
function drawExtrasWorld() {
  // smoke (behind everything bright)
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i]; s.x += s.vx; s.y += s.vy; s.vx *= 0.92; s.vy *= 0.92; s.r += s.vr; s.vr *= 0.95;
    X.fillStyle = s.c + (0.3 * s.life / s.max).toFixed(3) + ')'; X.beginPath(); X.arc(s.x, s.y, s.r, 0, TAU); X.fill();
    if (--s.life <= 0) smokes.splice(i, 1);
  }
  for (const c of coinDrops) { const sp = Math.cos(c.t); blit(SPR.coin(), c.x, c.y + Math.sin(c.t * 0.7) * 1.5, 1, 0, Math.abs(sp) * 0.75 + 0.25, 1); }
  // engine ribbon
  if (trail.length > 2 && G.state !== 'over') {
    const col = SPR.SHIP_THEMES[G.ship || SHIPS[0].id][1];
    X.globalCompositeOperation = 'lighter'; X.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) { const k = 1 - i / trail.length; X.strokeStyle = col; X.globalAlpha = k * 0.5; X.lineWidth = 9 * k + 1; X.beginPath(); X.moveTo(trail[i - 1].x, trail[i - 1].y); X.lineTo(trail[i].x, trail[i].y); X.stroke(); }
    X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  }
  // explosion cores
  X.globalCompositeOperation = 'lighter';
  for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i], k = f.life / f.max; glow(f.x, f.y, f.r * (1.4 - k * 0.4), f.color, k); glow(f.x, f.y, f.r * 0.5, '#ffffff', k); if (--f.life <= 0) flashes.splice(i, 1); }
  for (const m of missiles) glow(m.x - Math.cos(m.ang) * 10, m.y - Math.sin(m.ang) * 10, 16, '#ff6b3c', 0.9);
  for (const d of drones) glow(d.x, d.y, 26, '#5cffb0', 0.5);
  X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  for (const m of missiles) blit(SPR.missile(), m.x, m.y, 1, m.ang);
  for (const d of drones) { X.strokeStyle = 'rgba(92,255,176,.12)'; X.lineWidth = 1; X.beginPath(); X.moveTo(P.x, P.y); X.lineTo(d.x, d.y); X.stroke(); blit(SPR.drone(), d.x, d.y + Math.sin(G.frame * 0.1 + d.cd) * 1.5, 0.85, d.ang * 0.15); }
}

// ---------- lighting + bloom (screen space, after the world) ----------
const Q = { light: true, bloom: true, ft: 16, slow: 0 };
const HAS_FILTER = typeof X.filter === 'string';
let lightC = null, lightX = null, bloomC = null, bloomX = null, lastFx = 0;
(function loadGfx() { const g = Save.get().gfx; if (g === 'low') { Q.light = false; Q.bloom = false; } })();
function postFX() {
  const now = performance.now(), ft = now - lastFx; lastFx = now;
  if (G.state === 'play' && ft < 200) { Q.ft = Q.ft * 0.95 + ft * 0.05; Q.slow = Q.ft > 24 ? Q.slow + 1 : 0; }
  if (Q.slow > 120 && Save.get().gfx !== 'high') { // auto quality: drop the most expensive layer first
    if (Q.bloom) { Q.bloom = false; toast('Graphics lowered for smooth play', '#8d93c4'); } else if (Q.light) Q.light = false;
    Q.slow = 0;
  }
  const S = 4, lw = Math.ceil(W / S), lh = Math.ceil(H / S);
  if (Q.light) {
    if (!lightC) { lightC = document.createElement('canvas'); lightX = lightC.getContext('2d'); }
    if (lightC.width !== lw || lightC.height !== lh) { lightC.width = lw; lightC.height = lh; }
    lightX.globalCompositeOperation = 'source-over'; lightX.clearRect(0, 0, lw, lh);
    lightX.globalAlpha = 1; lightX.fillStyle = 'rgba(2,3,14,0.52)'; lightX.fillRect(0, 0, lw, lh);
    lightX.globalCompositeOperation = 'destination-out';
    const L = SPR.lightDisc(), z = cam.z;
    const hole = (x, y, r, a) => { const sx = ((x - cam.x) * z + W / 2) / S, sy = ((y - cam.y) * z + H / 2) / S, rr = r * z / S; if (sx < -rr || sy < -rr || sx > lw + rr || sy > lh + rr) return; lightX.globalAlpha = a; lightX.drawImage(L, sx - rr, sy - rr, rr * 2, rr * 2); };
    if (P) { hole(P.x, P.y, 330, 1); hole(P.x, P.y, 150, 1); }
    for (let i = 0; i < bullets.length && i < 50; i++) hole(bullets[i].x, bullets[i].y, 46, 0.45);
    for (const b of ebullets) hole(b.x, b.y, 40, 0.6);
    for (const f of flashes) hole(f.x, f.y, f.r * 2.4, f.life / f.max);
    for (const r of rings) if (r.r1 > 70) hole(r.x, r.y, r.r1 * 1.2, 0.5 * r.life / r.max);
    for (const it of items) hole(it.x, it.y, 80, 0.7);
    for (const m of missiles) hole(m.x, m.y, 70, 0.6);
    for (const e of enemies) if (e.elite || e.type === 'boss') hole(e.x, e.y, e.r * 4, 0.55);
    X.save(); X.setTransform(DPR, 0, 0, DPR, 0, 0); X.imageSmoothingEnabled = true; X.drawImage(lightC, 0, 0, W, H); X.restore();
  }
  if (Q.bloom && HAS_FILTER) {
    if (!bloomC) { bloomC = document.createElement('canvas'); bloomX = bloomC.getContext('2d'); }
    if (bloomC.width !== lw || bloomC.height !== lh) { bloomC.width = lw; bloomC.height = lh; }
    bloomX.clearRect(0, 0, lw, lh); bloomX.filter = 'brightness(0.75) contrast(2.4) blur(4px)';
    bloomX.drawImage(C, 0, 0, lw, lh); bloomX.filter = 'none';
    X.save(); X.setTransform(DPR, 0, 0, DPR, 0, 0); X.globalCompositeOperation = 'lighter'; X.globalAlpha = 0.5; X.drawImage(bloomC, 0, 0, W, H); X.restore();
  }
}

// ---------- HUD extras ----------
function toast(s, color = '#fff') { toasts.push({ s, color, life: 170, max: 170 }); if (toasts.length > 3) toasts.shift(); }
function drawFeatureHud() {
  drawWorldHud();
  X.textAlign = 'center'; X.textBaseline = 'middle';
  toasts.forEach((t, i) => {
    const k = t.life / t.max, inK = Math.min(1, (t.max - t.life) / 12), y = H - 150 - i * 30 - G.cineH;
    X.globalAlpha = Math.min(1, k * 3) * inK; X.font = '800 13px system-ui';
    const w = X.measureText(t.s).width + 24; X.fillStyle = 'rgba(12,14,30,.82)'; X.beginPath(); X.roundRect(W / 2 - w / 2, y - 12, w, 24, 12); X.fill();
    X.fillStyle = t.color; X.fillText(t.s, W / 2, y + (1 - inK) * 8);
  });
  X.globalAlpha = 1; toasts = toasts.filter(t => --t.life > 0);
  // evolved weapons get a gold star in the corner of the screen
  const ev = EVOLUTIONS.filter(v => EVO[v.w]);
  if (ev.length) { X.font = '800 11px system-ui'; X.textAlign = 'left'; X.fillStyle = '#ffc94d'; X.fillText('★ ' + ev.map(v => v.name).join(' · '), 12, H - 18 - G.cineH); }
}
function rarity(u, lv) { return WEAPON_IDS.includes(u.id) ? (lv === 1 ? 'r-epic' : 'r-rare') : 'r-common'; }

// ---------- treasure chest ----------
let chestUrl = null;
function openChest(auto) {
  if (G.state !== 'play') { if (auto) setTimeout(() => openChest(true), 300); return; }
  G.state = 'chest'; joy = null; G.chests++; setPlayUi(false);
  AU.sfx('streak'); flash(0.3, '#ffc94d'); buzz(60);
  const evo = EVOLUTIONS.filter(v => LV[v.w] >= 5 && LV[v.p] >= 1 && !EVO[v.w]);
  const rewards = [];
  if (evo.length) { const v = evo[Math.floor(Math.random() * evo.length)]; rewards.push({ kind: 'evo', v, icon: v.icon, col: v.col, name: v.name, desc: v.desc }); }
  else {
    const n = 1 + (Math.random() < 0.4) + (Math.random() < 0.15);
    for (let i = 0; i < n; i++) {
      const av = UPGRADES.filter(u => u.id !== 'blaster' && LV[u.id] + rewards.filter(r => r.u === u).length < u.max);
      if (!av.length) break; const u = av[Math.floor(Math.random() * av.length)];
      const lv = LV[u.id] + rewards.filter(r => r.u === u).length;
      rewards.push({ kind: 'up', u, icon: u.icon, col: u.col, name: u.name, desc: 'Lv ' + lv + ' → ' + (lv + 1) });
    }
  }
  if (!rewards.length) rewards.push({ kind: 'power', icon: '✦', col: '#ffe14d', name: 'Power Core', desc: '+1 gun power' });
  const coins = 15 + Math.floor(Math.random() * 20) + G.chests * 5;
  const icons = UPGRADES.filter(u => u.id !== 'blaster').map(u => u.icon).concat(EVOLUTIONS.map(v => v.icon));
  if (!chestUrl) chestUrl = SPR.chest(1).toDataURL();
  const evoHit = rewards[0].kind === 'evo';
  show(`<div class="chestwrap in"><div class="beams ${evoHit ? 'legend' : ''}"></div><img src="${chestUrl}" class="chestimg" alt=""></div>
    <div class="lv in" style="color:${evoHit ? rewards[0].col : '#ffc94d'}">${evoHit ? '★ WEAPON EVOLUTION ★' : 'TREASURE'}</div>
    <div class="reels">${rewards.map((r, i) => `<div class="reel ${r.kind === 'evo' ? 'r-legend' : ''}" id="reel${i}"><span class="ri">?</span><b></b><p></p></div>`).join('')}</div>
    <div class="credits" id="chc" style="opacity:0;transition:opacity .3s">+${coins} coins</div>
    <button class="btn" id="chok" style="opacity:0;pointer-events:none;transition:opacity .3s">COLLECT</button>`);
  let done = 0;
  rewards.forEach((r, i) => {
    const el = document.getElementById('reel' + i), ic = el.querySelector('.ri'), t0 = performance.now(), stopAt = 800 + i * 500 + (evoHit ? 600 : 0);
    let k = 0;
    const iv = setInterval(() => {
      ic.textContent = icons[k++ % icons.length]; ic.style.color = ['#3cf0ff', '#ffc94d', '#ff2e63', '#5cffb0', '#b06bff'][k % 5];
      if (k % 2) AU.tone(900 + (k % 5) * 70, 0.02, 'square', 0.014);
      if (performance.now() - t0 > stopAt) {
        clearInterval(iv); ic.textContent = r.icon; ic.style.color = r.col;
        el.querySelector('b').textContent = r.name; el.querySelector('p').textContent = r.desc;
        el.classList.add('done'); el.style.borderColor = r.col; AU.sfx(r.kind === 'evo' ? 'level' : 'pick'); buzz(25);
        if (++done === rewards.length) finish();
      }
    }, 60);
  });
  function finish() {
    document.getElementById('chc').style.opacity = 1;
    const b = document.getElementById('chok'); b.style.opacity = 1; b.style.pointerEvents = 'auto';
    b.onclick = () => {
      b.onclick = null;
      for (const r of rewards) { if (r.kind === 'evo') { EVO[r.v.w] = true; G.evolved++; } else if (r.kind === 'up') applyUpgrade(r.u); else gainPower(1); }
      G.coins += coins; AU.sfx('pick');
      hide(() => {
        G.state = 'play'; setPlayUi(true); P.inv = Math.max(P.inv, 60);
        if (evoHit) { banner('EVOLUTION · ' + rewards[0].name.toUpperCase(), rewards[0].col, rewards[0].desc, 160); explode(P.x, P.y, 220, rewards[0].col); flash(0.5, rewards[0].col); punch(0.1); }
        else { ring(P.x, P.y, 10, 150, '#ffc94d', 28, 6); burst(P.x, P.y, '#ffc94d', 30, 6, 3); }
      });
    };
  }
}

// ---------- missions ----------
const MISSION_POOL = [
  { k: 'kills', label: n => `Destroy ${n} enemies in one run`, tiers: [150, 400, 800, 1500] },
  { k: 'tier', label: n => `Reach gun tier ${n}`, tiers: [3, 5, 7, 8] },
  { k: 'boss', label: n => `Defeat ${n} boss${n > 1 ? 'es' : ''} in one run`, tiers: [1, 2, 3] },
  { k: 'time', label: n => `Survive ${n} minutes in Endless`, tiers: [2, 4, 6, 10] },
  { k: 'combo', label: n => `Reach a ${n}x combo`, tiers: [50, 100, 200, 400] },
  { k: 'chests', label: n => `Open ${n} chest${n > 1 ? 's' : ''} in one run`, tiers: [1, 2, 4] },
  { k: 'evolve', label: n => n > 1 ? `Evolve ${n} weapons in one run` : 'Evolve a weapon', tiers: [1, 2] },
  { k: 'system', label: n => `Clear ${n} star system${n > 1 ? 's' : ''} in Campaign`, tiers: [1, 2, 3, 5] },
];
const mDef = k => MISSION_POOL.find(m => m.k === k);
const mReward = (k, i) => 120 + i * 90;
function ensureMissions() {
  return Save.bump(s => {
    s.mlevel = s.mlevel || {}; s.missions = (s.missions || []).filter(k => mDef(k) && (s.mlevel[k] || 0) < mDef(k).tiers.length);
    const pool = MISSION_POOL.filter(m => !s.missions.includes(m.k) && (s.mlevel[m.k] || 0) < m.tiers.length).sort(() => Math.random() - 0.5);
    while (s.missions.length < 3 && pool.length) s.missions.push(pool.shift().k);
  });
}
function runValue(k) {
  switch (k) {
    case 'kills': return G.kills; case 'tier': return G.maxTier + 1; case 'boss': return G.bossKills;
    case 'time': return G.mode === 'endless' ? G.t / 60 : 0; case 'combo': return G.bestCombo; case 'chests': return G.chests;
    case 'evolve': return G.evolved; case 'system': return G.mode === 'campaign' ? G.sys : 0;
  }
  return 0;
}
function activeMissions() { const s = ensureMissions(); return s.missions.map(k => { const i = s.mlevel[k] || 0; return { k, i, target: mDef(k).tiers[i], label: mDef(k).label(mDef(k).tiers[i]), reward: mReward(k, i) }; }); }
function checkMissionsLive() {
  if (!G.missionsDone) return;
  for (const m of activeMissions()) if (!G.missionsDone.includes(m.k) && runValue(m.k) >= m.target) {
    G.missionsDone.push(m.k); toast('✓ MISSION COMPLETE · +' + m.reward + ' credits', '#5cffb0'); AU.sfx('streak');
  }
}
function onRunEnd() {
  if (!G.missionsDone || G.missionResults.length) return;
  checkMissionsLive();
  const act = activeMissions();
  for (const m of act) if (G.missionsDone.includes(m.k)) {
    G.missionResults.push(m);
    Save.bump(s => { s.credits = (s.credits || 0) + m.reward; s.mlevel[m.k] = m.i + 1; s.missions = s.missions.filter(k => k !== m.k); });
  }
  ensureMissions();
}
function missionResultsHtml() {
  if (!G.missionResults || !G.missionResults.length) return '';
  return `<div class="mres in">${G.missionResults.map(m => `<div><span>✓ ${esc(m.label)}</span><b>+${m.reward}</b></div>`).join('')}</div>`;
}

// ---------- title: ship hangar + missions + graphics ----------
let viewShip = 0;
function titleExtrasHtml() {
  const s = Save.get(); viewShip = Math.max(0, SHIPS.findIndex(x => x.id === (s.ship || SHIPS[0].id)));
  const ms = activeMissions();
  return `<div class="shipsel in" id="shipsel"></div>
    <div class="missions in"><div class="mh">MISSIONS <span>rewards go to the hangar</span></div>${ms.map(m => `<div class="mrow"><span>${esc(m.label)}</span><b>+${m.reward}</b></div>`).join('')}</div>`;
}
function renderShipSel() {
  const el = document.getElementById('shipsel'); if (!el) return;
  const s = Save.get(), sh = SHIPS[viewShip], owned = sh.cost === 0 || (s.ships || []).includes(sh.id), sel = (s.ship || SHIPS[0].id) === sh.id;
  el.innerHTML = `<button class="arrow" id="shp" aria-label="Previous ship">‹</button>
    <div class="shipcard ${owned ? '' : 'locked'}"><canvas id="shipcv" width="112" height="112"></canvas>
      <div><b>${sh.name}</b><p>${sh.desc}</p><small>${sh.stats}</small>
      ${owned ? (sel ? '<em>SELECTED</em>' : '<button class="mini" id="shsel">Select</button>') : `<button class="mini gold" id="shbuy" ${(s.credits || 0) >= sh.cost ? '' : 'disabled'}>Unlock ¤ ${sh.cost}</button>`}</div></div>
    <button class="arrow" id="shn" aria-label="Next ship">›</button>`;
  const cv = document.getElementById('shipcv'), g = cv.getContext('2d'), sp = SPR.ship(sh.id);
  g.save(); g.translate(56, 56); g.rotate(-Math.PI / 2); g.globalAlpha = owned ? 1 : 0.45; g.drawImage(sp, -sp.w * 0.8, -sp.h * 0.8, sp.w * 1.6, sp.h * 1.6); g.restore();
  document.getElementById('shp').onclick = () => { viewShip = (viewShip + SHIPS.length - 1) % SHIPS.length; G.ship = SHIPS[viewShip].id; AU.sfx('ui'); renderShipSel(); };
  document.getElementById('shn').onclick = () => { viewShip = (viewShip + 1) % SHIPS.length; G.ship = SHIPS[viewShip].id; AU.sfx('ui'); renderShipSel(); };
  const pick = () => { Save.bump(x => x.ship = sh.id); G.ship = sh.id; AU.sfx('pick'); renderShipSel(); };
  const b1 = document.getElementById('shsel'); if (b1) b1.onclick = pick;
  const b2 = document.getElementById('shbuy'); if (b2) b2.onclick = () => { if ((Save.get().credits || 0) < sh.cost) return; Save.bump(x => { x.credits -= sh.cost; x.ships = (x.ships || []).concat(sh.id); }); AU.sfx('level'); pick(); };
}
function bindTitleExtras() {
  renderShipSel();
  const box2 = document.getElementById('box'), g = Save.get().gfx || 'auto';
  const b = document.createElement('button'); b.className = 'btn ghost'; b.style.cssText = 'font-size:13px;padding:9px';
  const label = v => 'Graphics: ' + ({ auto: 'Auto', high: 'High', low: 'Low' }[v]);
  b.textContent = label(g);
  b.onclick = () => { const order = ['auto', 'high', 'low'], cur = Save.get().gfx || 'auto', nx = order[(order.indexOf(cur) + 1) % 3]; Save.bump(x => x.gfx = nx); Q.light = Q.bloom = nx !== 'low'; Q.slow = 0; b.textContent = label(nx); AU.sfx('ui'); };
  const snd = document.getElementById('snd'); if (snd) snd.after(b); else box2.appendChild(b);
}

// boot happens at the end of world.js
