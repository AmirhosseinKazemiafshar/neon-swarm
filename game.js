'use strict';
// =====================================================================
// NEON SWARM — polished survivor prototype (working title)
// Plain Canvas 2D, no dependencies. Fixed 60 Hz simulation.
// v2: zoom camera, dash + afterimages, squash & stretch, shards,
//     gem spew, cinematic boss intro, HUD juice, nebula, streaks.
// =====================================================================

const C = document.getElementById('c'), X = C.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  C.width = W * DPR; C.height = H * DPR; C.style.width = W + 'px'; C.style.height = H + 'px';
}
addEventListener('resize', resize); resize();

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const WORLD = 3200;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// ---------- persistent stats ----------
const Save = {
  get() { try { return JSON.parse(localStorage.getItem('ns_save')) || {}; } catch (e) { return {}; } },
  set(o) { try { localStorage.setItem('ns_save', JSON.stringify(o)); } catch (e) {} },
  bump(fn) { const s = Object.assign({ best: 0, bestKills: 0, rounds: 0, adsOffered: 0, adsWatched: 0, sound: true }, this.get()); fn(s); this.set(s); return s; },
};
const save0 = Save.bump(() => {});

// ---------- audio (synth sfx + music loop) ----------
const AU = {
  ctx: null, out: null, on: save0.sound !== false, last: {}, musicT: null, step: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.out = this.ctx.createGain(); this.out.gain.value = 0.55; this.out.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5; this.nbuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.nbuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {}
  },
  ok(key, gap) { const t = performance.now(); if (this.last[key] && t - this.last[key] < gap) return false; this.last[key] = t; return true; },
  tone(f, d = 0.08, type = 'square', v = 0.05, slide = 0, delay = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + d + 0.03);
  },
  noise(d = 0.15, v = 0.08, freq = 1200, delay = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + delay, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.nbuf; f.type = 'lowpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t); s.stop(t + d + 0.02);
  },
  sfx(name) {
    switch (name) {
      case 'shoot': if (this.ok('shoot', 70)) this.tone(880, 0.04, 'square', 0.018, -300); break;
      case 'hit': if (this.ok('hit', 45)) this.tone(rnd(300, 380), 0.03, 'square', 0.02); break;
      case 'kill': if (this.ok('kill', 40)) { this.noise(0.12, 0.06, 1800); this.tone(rnd(160, 220), 0.1, 'triangle', 0.05, -90); } break;
      case 'big': this.noise(0.6, 0.18, 700); this.tone(90, 0.6, 'sawtooth', 0.09, -50); break;
      case 'gem': if (this.ok('gem', 28)) { this.gp = (this.gp || 0) + 1; this.tone(1100 + (this.gp % 8) * 60, 0.04, 'sine', 0.035); } break;
      case 'hurt': this.noise(0.22, 0.13, 500); this.tone(140, 0.22, 'sawtooth', 0.07, -60); break;
      case 'level': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.07, 0, i * 0.06)); break;
      case 'pick': this.tone(660, 0.1, 'triangle', 0.07, 500); this.tone(990, 0.12, 'sine', 0.04, 0, 0.05); break;
      case 'zap': if (this.ok('zap', 80)) { this.noise(0.08, 0.06, 4000); this.tone(1800, 0.06, 'sawtooth', 0.03, -1200); } break;
      case 'nova': this.tone(220, 0.35, 'sine', 0.12, -150); this.noise(0.3, 0.07, 900); break;
      case 'dash': this.noise(0.18, 0.08, 3000); this.tone(300, 0.16, 'sine', 0.06, 700); break;
      case 'warn': [0, 0.25, 0.5].forEach(d => this.tone(330, 0.18, 'square', 0.05, 0, d)); break;
      case 'beat': this.tone(60, 0.12, 'sine', 0.12); this.tone(55, 0.12, 'sine', 0.09, 0, 0.14); break;
      case 'streak': [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.12, 'square', 0.04, 0, i * 0.05)); break;
      case 'over': this.tone(300, 1.1, 'sawtooth', 0.07, -260); break;
      case 'ui': this.tone(1000, 0.05, 'sine', 0.04); break;
    }
  },
  startMusic() {
    if (this.musicT || !this.ctx) return;
    const bass = [55, 55, 65.4, 55, 73.4, 55, 82.4, 73.4], lead = [440, 523, 587, 659, 784, 659, 587, 523];
    this.musicT = setInterval(() => {
      if (!this.on || G.state !== 'play') return;
      const s = this.step++, boss = enemies.some(e => e.type === 'boss');
      this.tone(bass[(s >> 1) % 8] * (boss ? 0.94 : 1), 0.2, 'sawtooth', 0.035);
      this.noise(0.03, s % 2 ? 0.015 : 0.03, 7000);
      if (s % 4 === 0) this.noise(0.09, 0.05, 160);
      if ((G.t > 60 || boss) && s % 4 === 2) this.tone(lead[(s >> 2) % 8], 0.12, 'triangle', 0.02);
    }, 160);
  },
};

// ---------- glow sprites ----------
const glowCache = {};
function glowSprite(color) {
  if (glowCache[color]) return glowCache[color];
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color); gr.addColorStop(0.35, color + '88'); gr.addColorStop(1, color + '00');
  g.fillStyle = gr; g.fillRect(0, 0, s, s); return (glowCache[color] = c);
}
function glow(x, y, r, color, a = 1) { X.globalAlpha = a; X.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2); }
// draw a cached sprite centred at x,y
function blit(s, x, y, sc = 1, rot = 0, sx = 1, sy = 1) {
  const w = s.w * sc, h = s.h * sc;
  if (!rot && sx === 1 && sy === 1) { X.drawImage(s, x - w / 2, y - h / 2, w, h); return; }
  X.save(); X.translate(x, y); if (rot) X.rotate(rot); X.scale(sx, sy); X.drawImage(s, -w / 2, -h / 2, w, h); X.restore();
}
// deterministic hash for floor decorations
function hash(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
const DECO_COLORS = ['#3cf0ff', '#b06bff', '#5cffb0', '#ff6b9a'];
let decals = [];

// ---------- state ----------
const G = { state: 'title' };
const cam = { x: WORLD / 2, y: WORLD / 2, z: 1, punch: 0 };
let P, enemies, bullets, ebullets, gems, parts, shards, rings, texts, bolts, items, ghosts, stars, nebula;
let LV, WP;
const HUD = { xp: 0, heartHit: 0, killPop: 0, levelPop: 0, powerPop: 0, power: 0 };

const UPGRADES = [
  { id: 'blaster', icon: '✦', col: '#3cf0ff', name: 'Pulse Blaster', max: 5, desc: l => ['', 'Auto-fires at the nearest enemy', '+1 projectile', 'Fires 30% faster', '+1 projectile, pierces 2 enemies', 'Double burst'][l] },
  { id: 'orbit', icon: '◎', col: '#b06bff', name: 'Orbit Blades', max: 5, desc: l => l === 1 ? 'Two blades circle around you' : '+1 blade, wider and faster' },
  { id: 'chain', icon: 'ϟ', col: '#ffe14d', name: 'Chain Lightning', max: 5, desc: l => l === 1 ? 'Zaps an enemy and jumps to 2 more' : '+2 jumps, +25% damage, faster' },
  { id: 'nova', icon: '❂', col: '#ff6b3c', name: 'Nova Pulse', max: 5, desc: l => l === 1 ? 'Blasts nearby enemies away' : 'Bigger, stronger, more often' },
  { id: 'might', icon: '⚔', col: '#ff2e63', name: 'Might', max: 5, desc: () => '+20% damage for all weapons' },
  { id: 'haste', icon: '⏱', col: '#5cffb0', name: 'Overclock', max: 5, desc: () => 'Weapons and dash recharge 12% faster' },
  { id: 'speed', icon: '➶', col: '#7fd1ff', name: 'Thrusters', max: 5, desc: () => 'Move 10% faster' },
  { id: 'magnet', icon: '⊕', col: '#4dd6ff', name: 'Magnet', max: 5, desc: () => 'Collect XP from 35% further away' },
  { id: 'heart', icon: '♥', col: '#ff4d6d', name: 'Vital Core', max: 5, desc: () => '+1 max HP and heal fully' },
];
const ET = {
  grunt: { r: 13, hp: 22, spd: 1.25, color: '#ff4d6d', xp: 1, dmg: 1 },
  swarm: { r: 9, hp: 9, spd: 2.15, color: '#ffb547', xp: 1, dmg: 1 },
  tank: { r: 22, hp: 120, spd: 0.7, color: '#b04dff', xp: 5, dmg: 2 },
  dasher: { r: 12, hp: 38, spd: 1.0, color: '#4dd6ff', xp: 3, dmg: 1 },
  boss: { r: 48, hp: 2600, spd: 0.8, color: '#ff2e63', xp: 60, dmg: 2 },
};
const STREAKS = [[50, 'RAMPAGE', '#ffb547'], [100, 'UNSTOPPABLE', '#ff6b3c'], [200, 'GODLIKE', '#ff2e63'], [400, 'NEON LEGEND', '#3cf0ff']];

// ---------- campaign data ----------
const SYSTEMS = [
  { name: 'Kepler Drift', tint: '#3cf0ff', neb: ['#00b3ff', '#3c2bff'] },
  { name: 'Ember Belt', tint: '#ff6b3c', neb: ['#ff6b3c', '#ff2e63'] },
  { name: 'Glass Nebula', tint: '#5cffb0', neb: ['#18c27a', '#00b3ff'] },
  { name: 'Void Reach', tint: '#b06bff', neb: ['#8a2be2', '#3c2bff'] },
  { name: 'Hive Prime', tint: '#ff2e63', neb: ['#ff2e63', '#8a2be2'] },
];
const STEPS = 3; // route choices before each system boss
const NODES = {
  battle: { icon: '⚔', col: '#3cf0ff', name: 'Battle', desc: 'Survive 45 s · +25 coins' },
  elite: { icon: '☠', col: '#ff2e63', name: 'Elite sector', desc: 'Harder, 55 s · +40 coins and a relic' },
  shop: { icon: '¤', col: '#ffc94d', name: 'Trader', desc: 'Spend coins on relics, upgrades, repairs' },
  repair: { icon: '✚', col: '#5cffb0', name: 'Repair dock', desc: 'Restore all HP, no fight' },
  boss: { icon: '✹', col: '#ff2e63', name: 'Hive Core', desc: 'Defeat the system boss' },
};
const RELICS = [
  { id: 'glass', icon: '◆', col: '#ff2e63', name: 'Glass Cannon', desc: '+40% damage, −1 max HP', f: () => { P.might += 0.4; P.maxHp = Math.max(1, P.maxHp - 1); P.hp = Math.min(P.hp, P.maxHp); } },
  { id: 'plating', icon: '⬢', col: '#7fd1ff', name: 'Heavy Plating', desc: '+2 max HP, −12% speed', f: () => { P.maxHp += 2; P.hp += 2; P.speed *= 0.88; } },
  { id: 'overdrive', icon: 'ϟ', col: '#ffe14d', name: 'Overdrive Core', desc: 'Weapons 20% faster, dash 50% slower', f: () => { P.haste *= 0.8; P.dashMul *= 1.5; } },
  { id: 'lucky', icon: '✧', col: '#ffc94d', name: 'Lucky Charm', desc: 'Critical hit chance 12% → 25%', f: () => { P.crit = 0.25; } },
  { id: 'vamp', icon: '♥', col: '#ff4d6d', name: 'Leech Module', desc: 'Heal 1 HP every 50 kills', f: () => { P.vamp = true; } },
  { id: 'twin', icon: '➶', col: '#3cf0ff', name: 'Twin Engines', desc: 'Dash recharges 40% faster', f: () => { P.dashMul *= 0.6; } },
  { id: 'bounty', icon: '¤', col: '#ffc94d', name: 'Bounty Contract', desc: '+50% coins and score', f: () => { P.coinMul *= 1.5; } },
  { id: 'shock', icon: '❂', col: '#ff6b3c', name: 'Shock Thrusters', desc: 'Your dash releases a shockwave', f: () => { P.dashNova = true; } },
  { id: 'wind', icon: '✚', col: '#5cffb0', name: 'Second Wind', desc: 'Survive one fatal hit', f: () => { P.secondWind = true; } },
  { id: 'scav', icon: '⊕', col: '#4dd6ff', name: 'Scavenger', desc: '+30% XP, enemies 8% faster', f: () => { P.xpMul *= 1.3; P.enemyFast *= 1.08; } },
];
// ---------- hangar: permanent upgrades bought with credits earned every run ----------
const META = [
  { id: 'dmg', icon: '⚔', col: '#ff2e63', name: 'Weapon Core', desc: l => `+${l * 8}% damage`, max: 5 },
  { id: 'hp', icon: '♥', col: '#ff4d6d', name: 'Hull Plating', desc: l => `+${l} max HP`, max: 3 },
  { id: 'spd', icon: '➶', col: '#7fd1ff', name: 'Engines', desc: l => `+${l * 5}% speed`, max: 5 },
  { id: 'mag', icon: '⊕', col: '#4dd6ff', name: 'Tractor Beam', desc: l => `+${l * 15}% pickup range`, max: 5 },
  { id: 'dash', icon: '»', col: '#3cf0ff', name: 'Dash Coils', desc: l => `Dash recharges ${l * 10}% faster`, max: 4 },
  { id: 'reroll', icon: '↻', col: '#ffc94d', name: 'Lucky Dice', desc: l => `+${l} reroll per run`, max: 3 },
  { id: 'start', icon: '✦', col: '#b06bff', name: 'Starter Kit', desc: l => l ? 'Start with a random extra weapon' : 'Start with an extra weapon', max: 1 },
];
const metaCost = (m, lv) => Math.round((m.id === 'start' ? 400 : 60) * Math.pow(lv + 1, 1.6));
function metaLv(id) { return ((Save.get().meta || {})[id]) || 0; }
function applyMeta() {
  const l = id => metaLv(id);
  P.might += l('dmg') * 0.08; P.maxHp += l('hp'); P.hp = P.maxHp; P.speed *= 1 + l('spd') * 0.05; P.magnet *= 1 + l('mag') * 0.15;
  P.dashMul *= 1 - l('dash') * 0.1; G.rerolls += l('reroll');
  if (l('start')) { const w = ['orbit', 'chain', 'nova'][Math.floor(Math.random() * 3)]; LV[w] = 1; }
}
// difficulty clock: endless = elapsed time; campaign adds a per-sector base
const D = () => (G.diffBase || 0) + G.t;

function resetField() { enemies = []; bullets = []; ebullets = []; gems = []; parts = []; shards = []; rings = []; texts = []; bolts = []; items = []; ghosts = []; decals = []; }
function newRun(mode = 'endless') {
  P = { x: WORLD / 2, y: WORLD / 2, vx: 0, vy: 0, r: 14, ang: -Math.PI / 2, hp: 5, maxHp: 5, inv: 90, speed: 3.1, magnet: 95, might: 1, haste: 1, dashCd: 0, dashMax: 150, dashT: 0, dx: 0, dy: -1, recoil: 0, muzzle: 0, stretch: 0,
    crit: 0.12, xpMul: 1, coinMul: 1, dashMul: 1, enemyFast: 1, vamp: false, dashNova: false, secondWind: false };
  resetField();
  LV = { blaster: 1, orbit: 0, chain: 0, nova: 0, might: 0, haste: 0, speed: 0, magnet: 0, heart: 0 };
  WP = { blasterCd: 0, burst: 0, orbitAng: 0, chainCd: 60, novaCd: 120 };
  Object.assign(G, { t: 0, frame: 0, kills: 0, level: 1, xp: 0, xpNeed: 6, combo: 0, comboT: 0, bestCombo: 0, streakIdx: 0, shake: 0, hitStop: 0, slow: 0, revived: false, nextBoss: 120, nextWave: 45, banner: null, spawnAcc: 0, cine: 0, cineH: 0, flash: 0, flashCol: '#fff', deathT: 0,
    mode, score: 0, coins: 0, relics: [], sys: 0, step: 0, node: null, stageDur: Infinity, diffBase: 0, clearAt: 0, totalT: 0, saved: false, banked: 0, rerolls: 2, tier: 0, power: 0, nextCore: 18 });
  applyMeta();
  Object.assign(HUD, { xp: 0, heartHit: 0, killPop: 0, levelPop: 0 });
  cam.x = P.x; cam.y = P.y; cam.z = 1; cam.punch = 0;
  stars = Array.from({ length: 170 }, () => ({ x: Math.random(), y: Math.random(), d: rnd(0.08, 0.5), s: rnd(0.6, 1.8), tw: Math.random() * TAU }));
  nebula = Array.from({ length: 7 }, (_, i) => ({ x: rnd(0, WORLD), y: rnd(0, WORLD), r: rnd(380, 700), c: ['#3c2bff', '#ff2e63', '#00b3ff', '#8a2be2'][i % 4], ph: Math.random() * TAU }));
}
const baseZoom = () => (Math.min(W, H) < 520 ? 0.86 : 1);
const viewW = () => W / cam.z, viewH = () => H / cam.z;

// ---------- spatial hash ----------
const CELL = 72; const grid = new Map();
function buildGrid() { grid.clear(); for (const e of enemies) { const k = ((e.x / CELL) | 0) * 4099 + ((e.y / CELL) | 0); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(e); } }
function near(x, y, r, fn) {
  const x0 = ((x - r) / CELL) | 0, x1 = ((x + r) / CELL) | 0, y0 = ((y - r) / CELL) | 0, y1 = ((y + r) / CELL) | 0;
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const a = grid.get(cx * 4099 + cy); if (a) for (const e of a) if (fn(e) === false) return; }
}
function nearest(x, y, maxR, skip) {
  let best = null, bd = maxR * maxR;
  for (const e of enemies) { if (e.dead || (skip && skip.has(e))) continue; const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd) { bd = d; best = e; } }
  return best;
}

// ---------- fx ----------
function burst(x, y, color, n, spd, size = 3, life = 40) {
  for (let i = 0; i < n && parts.length < 900; i++) {
    const a = Math.random() * TAU, s = spd * (0.3 + Math.random());
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, size: size * rnd(0.6, 1.4), color, drag: 0.92 });
  }
}
function shatter(x, y, color, n, spd, size) {
  for (let i = 0; i < n && shards.length < 260; i++) {
    const a = Math.random() * TAU, s = spd * rnd(0.4, 1.2);
    shards.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: Math.random() * TAU, vr: rnd(-0.35, 0.35), size: size * rnd(0.6, 1.3), color, life: 44, max: 44 });
  }
}
function ring(x, y, r0, r1, color, life = 22, w = 4) { rings.push({ x, y, r0, r1, color, life, max: life, w }); }
function text(x, y, s, color = '#fff', size = 15) { if (texts.length < 90) texts.push({ x, y, s, color, size, life: 42, max: 42, vx: rnd(-0.8, 0.8), vy: -2.2 }); }
function shake(v) { if (!REDUCED) G.shake = Math.min(24, G.shake + v); }
function flash(a, color = '#fff') { if (!REDUCED) { G.flash = Math.max(G.flash, a); G.flashCol = color; } }
function punch(z) { if (!REDUCED) cam.punch = Math.max(cam.punch, z); }
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }
function banner(s, color = '#fff', sub = '', life = 150) { G.banner = { s, sub, color, life, max: life }; }

// ---------- spawning ----------
function spawn(type, x, y, portal) {
  const d = ET[type], scale = 1 + D() / 120;
  if (x === undefined) {
    const a = Math.random() * TAU, r = Math.hypot(viewW(), viewH()) * 0.55 + 40;
    x = clamp(P.x + Math.cos(a) * r, 20, WORLD - 20); y = clamp(P.y + Math.sin(a) * r, 20, WORLD - 20);
  }
  const hp = Math.round(d.hp * (type === 'boss' ? 1 + D() / 240 : scale));
  enemies.push({ type, x, y, vx: 0, vy: 0, r: d.r, hp, max: hp, spd: d.spd * (1 + D() / 500) * P.enemyFast, color: d.color, xp: d.xp, dmg: d.dmg, flash: 0, sq: 0, orbitHit: 0, dashHit: 0, spawnT: portal ? 45 : 18, spawnMax: portal ? 45 : 18, mode: 0, modeT: 0, ang: 0, wob: Math.random() * TAU });
}
function pickType() {
  const t = D(), w = [['grunt', 10], ['swarm', t > 20 ? 6 : 0], ['tank', t > 60 ? 1 + t / 120 : 0], ['dasher', t > 90 ? 1.5 + t / 100 : 0]];
  let s = w.reduce((a, b) => a + b[1], 0), r = Math.random() * s;
  for (const [k, v] of w) { if ((r -= v) <= 0) return k; } return 'grunt';
}

// ---------- damage ----------
function damage(e, dmg, kx = 0, ky = 0) {
  if (e.dead) return;
  const crit = Math.random() < P.crit, amount = Math.round(dmg * P.might * (crit ? 2 : 1));
  e.hp -= amount; e.flash = 6; e.sq = 1;
  const kb = e.type === 'boss' ? 0.1 : e.type === 'tank' ? 0.4 : 1;
  e.vx += kx * kb; e.vy += ky * kb;
  text(e.x + rnd(-6, 6), e.y - e.r, crit ? amount + '!' : String(amount), crit ? '#ffe14d' : '#ffffff', crit ? 20 : 14);
  AU.sfx('hit');
  if (e.type === 'boss' && crit) shake(2);
  if (e.hp <= 0) kill(e);
}
function kill(e) {
  e.dead = true; G.kills++; HUD.killPop = 1;
  G.combo++; G.comboT = 90; G.bestCombo = Math.max(G.bestCombo, G.combo);
  G.score += Math.round((e.type === 'boss' ? 2000 : e.xp * 10) * (1 + Math.min(G.combo, 200) / 50) * P.coinMul);
  if (P.vamp && G.kills % 50 === 0 && P.hp < P.maxHp) { P.hp++; HUD.heartHit = -1; text(P.x, P.y - 30, '+1 HP', '#ff4d6d', 18); }
  if (e.type === 'boss' && G.mode === 'campaign' && G.node === 'boss') G.clearAt = G.t + 2.4;
  const st = STREAKS[G.streakIdx];
  if (st && G.combo >= st[0]) { G.streakIdx++; banner(st[1], st[2], G.combo + ' kill streak', 110); AU.sfx('streak'); flash(0.18, st[2]); punch(0.05); }
  const big = e.type === 'boss' || e.type === 'tank';
  decals.push({ x: e.x, y: e.y, color: e.color, sc: e.r / 13, rot: Math.random() * TAU, life: 900 }); if (decals.length > 140) decals.shift();
  burst(e.x, e.y, e.color, big ? 40 : 10, big ? 7 : 4.5, big ? 4 : 3);
  shatter(e.x, e.y, e.color, big ? 16 : 5, big ? 7 : 4.5, big ? 9 : 5);
  burst(e.x, e.y, '#ffffff', big ? 12 : 4, 3, 2, 18);
  ring(e.x, e.y, e.r * 0.5, e.r * (big ? 5 : 2), e.color, big ? 34 : 12, big ? 6 : 2);
  const spew = (v, n) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = rnd(1.5, 4.5) * (n > 1 ? 1.6 : 1); gems.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, v, t: Math.random() * 6, age: 0 }); } };
  if (e.type === 'boss') {
    G.hitStop = 14; shake(24); buzz(250); AU.sfx('big'); banner('BOSS DOWN', '#ffe14d', '+60 XP'); flash(0.7, '#ffffff'); punch(0.18);
    for (let k = 0; k < 4; k++) ring(e.x, e.y, 10, 200 + k * 80, ['#ff2e63', '#ffe14d', '#3cf0ff', '#fff'][k], 30 + k * 8, 6);
    spew(5, 18); items.push({ x: e.x, y: e.y, kind: 'heart', t: 0 }, { x: e.x - 30, y: e.y, kind: 'power', v: 2, t: 0 }, { x: e.x + 30, y: e.y, kind: 'power', v: 2, t: 0 });
  } else {
    if (big) { G.hitStop = 3; shake(6); buzz(25); punch(0.02); } else shake(1.2);
    AU.sfx('kill'); spew(e.xp, 1);
    // power cores: tougher enemies drop them more often; every 35 kills is a guaranteed core
    // milestones spread further apart each tier so the gun grows step by step, not all at once
    const pc = (e.type === 'tank' ? 0.15 : e.type === 'dasher' ? 0.08 : 0) / (1 + G.tier);
    if (Math.random() < pc) items.push({ x: e.x, y: e.y, kind: 'power', v: 1, t: 0 });
    const roll = Math.random();
    if (roll < 0.012) items.push({ x: e.x, y: e.y, kind: 'heart', t: 0 });
    else if (roll < 0.019) items.push({ x: e.x, y: e.y, kind: 'magnet', t: 0 });
  }
}

// ---------- weapons ----------
// Main gun: 8 tiers, earned one by one by collecting power cores.
// pattern entries: [angle offset, side offset px]
const TIERS = [
  { name: 'Single Shot', rate: 30, dmg: 16, pierce: 0, pat: [[0, 0]] },
  { name: 'Rapid Fire', rate: 22, dmg: 16, pierce: 0, pat: [[0, 0]] },
  { name: 'Twin Shot', rate: 22, dmg: 15, pierce: 0, pat: [[0, -7], [0, 7]] },
  { name: 'Triple Spread', rate: 22, dmg: 15, pierce: 0, pat: [[-0.16, 0], [0, 0], [0.16, 0]] },
  { name: 'Piercing Spread', rate: 21, dmg: 17, pierce: 2, pat: [[-0.16, 0], [0, 0], [0.16, 0]] },
  { name: 'Quad + Tail Gun', rate: 20, dmg: 17, pierce: 2, pat: [[-0.22, 0], [-0.07, 0], [0.07, 0], [0.22, 0], [Math.PI, 0]] },
  { name: 'Fan Barrage', rate: 19, dmg: 18, pierce: 2, pat: [[-0.3, 0], [-0.15, 0], [0, 0], [0.15, 0], [0.3, 0], [Math.PI - 0.2, 0], [Math.PI + 0.2, 0]] },
  { name: 'Neon Storm', rate: 16, dmg: 20, pierce: 3, pat: [[-0.42, 0], [-0.28, 0], [-0.14, 0], [0, -6], [0, 6], [0.14, 0], [0.28, 0], [0.42, 0], [Math.PI - 0.2, 0], [Math.PI, 0], [Math.PI + 0.2, 0]] },
];
const POWER_NEED = [1, 2, 2, 3, 3, 4, 4]; // cores needed to go from tier n to n+1
function tierUp(free) {
  if (G.tier >= TIERS.length - 1) { G.score += 500; text(P.x, P.y - 40, 'MAX POWER +500', '#ffe14d', 18); return; }
  G.tier++; G.power = 0; const t = TIERS[G.tier];
  banner('TIER ' + (G.tier + 1) + ' · ' + t.name.toUpperCase(), '#ffe14d', G.tier + 1 < TIERS.length ? 'Next tier: ' + TIERS[G.tier + 1].name : 'Maximum firepower', 120);
  AU.sfx('streak'); flash(0.25, '#ffe14d'); punch(0.06); buzz(60);
  ring(P.x, P.y, 10, 190, '#ffe14d', 34, 7); ring(P.x, P.y, 10, 120, '#ffffff', 22, 3); burst(P.x, P.y, '#ffe14d', 36, 6, 3);
  WP.blasterCd = 0;
}
function gainPower(n = 1) {
  if (G.tier >= TIERS.length - 1) { G.score += 100 * n; return; }
  G.power += n; HUD.powerPop = 1;
  text(P.x, P.y - 30, 'POWER +' + n, '#ffe14d', 16);
  if (G.power >= POWER_NEED[G.tier]) tierUp();
}
function fireBlaster() {
  const target = nearest(P.x, P.y, 560); if (!target) return;
  const t = TIERS[G.tier], base = Math.atan2(target.y - P.y, target.x - P.x), px = -Math.sin(base), py = Math.cos(base);
  for (const [da, off] of t.pat) {
    const a = base + da, rear = Math.abs(da) > 1.5;
    bullets.push({ x: P.x + Math.cos(a) * 16 + px * off, y: P.y + Math.sin(a) * 16 + py * off, vx: Math.cos(a) * 11, vy: Math.sin(a) * 11, life: 60, pierce: t.pierce, dmg: rear ? t.dmg * 0.7 : t.dmg, hitSet: null, lv: Math.min(5, 1 + (G.tier >> 1)) });
  }
  P.recoil = 3 + G.tier * 0.4; P.muzzle = 4; P.muzzleAng = base; AU.sfx('shoot');
}
function updateWeapons() {
  if (--WP.blasterCd <= 0) { fireBlaster(); WP.blasterCd = TIERS[G.tier].rate * P.haste; }
  if (LV.orbit) {
    const n = LV.orbit + 1, R = 62 + LV.orbit * 8; WP.orbitAng += 0.055 + LV.orbit * 0.008;
    for (let i = 0; i < n; i++) {
      const a = WP.orbitAng + i * TAU / n, bx = P.x + Math.cos(a) * R, by = P.y + Math.sin(a) * R;
      near(bx, by, 40, e => {
        if (!e.dead && G.frame - e.orbitHit > 18 && (e.x - bx) ** 2 + (e.y - by) ** 2 < (e.r + 12) ** 2) {
          e.orbitHit = G.frame; damage(e, 9 + LV.orbit * 2, Math.cos(a + 1.57) * 3, Math.sin(a + 1.57) * 3);
          burst(bx, by, '#d9b8ff', 4, 3, 2, 14);
        }
      });
    }
  }
  if (LV.chain && --WP.chainCd <= 0) {
    WP.chainCd = (100 - LV.chain * 8) * P.haste;
    let cur = nearest(P.x, P.y, 420);
    if (cur) {
      const hit = new Set(), pts = [{ x: P.x, y: P.y }], jumps = 1 + LV.chain * 2, dmg = 20 * (1 + (LV.chain - 1) * 0.25);
      for (let j = 0; j <= jumps && cur; j++) { hit.add(cur); pts.push({ x: cur.x, y: cur.y }); const c = cur; cur = nearest(c.x, c.y, 190, hit); damage(c, dmg, 0, 0); burst(c.x, c.y, '#ffe14d', 5, 3, 2, 16); }
      bolts.push({ pts, life: 14 }); AU.sfx('zap'); flash(0.05, '#ffe14d');
    }
  }
  if (LV.nova && --WP.novaCd <= 0) {
    WP.novaCd = (260 - LV.nova * 25) * P.haste;
    const R = 110 + LV.nova * 22;
    ring(P.x, P.y, 10, R, '#ff6b3c', 26, 10); ring(P.x, P.y, 10, R * 0.8, '#ffe14d', 20, 3);
    burst(P.x, P.y, '#ff6b3c', 24, 8, 3, 24);
    AU.sfx('nova'); shake(6); punch(0.03);
    near(P.x, P.y, R, e => { const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1; if (d < R + e.r) damage(e, 16 + LV.nova * 6, dx / d * 9, dy / d * 9); });
  }
}

// ---------- dash ----------
function dash() {
  if (G.state !== 'play' || P.dashCd > 0) return;
  let dx = P.dx, dy = P.dy; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  P.dashT = 11; P.dashCd = P.dashMax * P.haste * P.dashMul; P.inv = Math.max(P.inv, 22);
  if (P.dashNova) { buildGrid(); ring(P.x, P.y, 10, 130, '#ff6b3c', 22, 7); near(P.x, P.y, 130, e => { const ex = e.x - P.x, ey = e.y - P.y, ed = Math.hypot(ex, ey) || 1; if (ed < 130 + e.r) damage(e, 20, ex / ed * 8, ey / ed * 8); }); }
  P.vx = dx * 15; P.vy = dy * 15;
  AU.sfx('dash'); buzz(25); shake(3); punch(0.025);
  ring(P.x, P.y, 6, 46, '#3cf0ff', 14, 3); burst(P.x, P.y, '#bff9ff', 14, 4, 2, 18);
}

// ---------- input ----------
const keys = {}; let joy = null;
addEventListener('keydown', e => { if (e.target && e.target.tagName === 'INPUT') return; const k = e.key.toLowerCase(); keys[k] = true; if (k === 'escape' || k === 'p') togglePause(); if (k === ' ' || k === 'shift') { e.preventDefault(); dash(); } });
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
C.addEventListener('pointerdown', e => { if (G.state !== 'play') return; joy = { ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t: performance.now() }; C.setPointerCapture(e.pointerId); });
C.addEventListener('pointermove', e => { if (joy) { joy.x = e.clientX; joy.y = e.clientY; const dx = joy.x - joy.ox, dy = joy.y - joy.oy, l = Math.hypot(dx, dy); if (l > 70) { joy.ox = joy.x - dx / l * 70; joy.oy = joy.y - dy / l * 70; } } });
C.addEventListener('pointerup', () => joy = null); C.addEventListener('pointercancel', () => joy = null);
const dashBtn = document.getElementById('dash');
dashBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); dash(); });

// ---------- simulation ----------
function update() {
  G.frame++; G.t += 1 / 60;
  let mx = 0, my = 0;
  if (joy) { const dx = joy.x - joy.ox, dy = joy.y - joy.oy, l = Math.hypot(dx, dy); if (l > 5) { const k = Math.min(1, l / 55); mx = dx / l * k; my = dy / l * k; } }
  if (keys.a || keys.arrowleft) mx -= 1; if (keys.d || keys.arrowright) mx += 1; if (keys.w || keys.arrowup) my -= 1; if (keys.s || keys.arrowdown) my += 1;
  const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
  if (ml > 0.1) { P.dx = mx; P.dy = my; }
  if (P.dashT > 0) {
    P.dashT--; if (G.frame % 1 === 0) ghosts.push({ x: P.x, y: P.y, ang: P.ang, life: 16 });
    near(P.x, P.y, 40, e => { if (!e.dead && G.frame - e.dashHit > 20 && (e.x - P.x) ** 2 + (e.y - P.y) ** 2 < (e.r + P.r + 6) ** 2) { e.dashHit = G.frame; damage(e, 18, P.vx * 0.6, P.vy * 0.6); } });
  } else { P.vx += (mx * P.speed - P.vx) * 0.22; P.vy += (my * P.speed - P.vy) * 0.22; }
  if (P.dashCd > 0) P.dashCd--;
  P.x = clamp(P.x + P.vx, P.r, WORLD - P.r); P.y = clamp(P.y + P.vy, P.r, WORLD - P.r);
  const sp = Math.hypot(P.vx, P.vy); P.stretch = lerp(P.stretch, Math.min(1, sp / 12), 0.3);
  if (sp > 0.4) {
    const ta = Math.atan2(P.vy, P.vx); let d = ta - P.ang; d = Math.atan2(Math.sin(d), Math.cos(d)); P.ang += d * 0.25;
    if (G.frame % 2 === 0 && parts.length < 900) parts.push({ x: P.x - Math.cos(P.ang) * 14, y: P.y - Math.sin(P.ang) * 14, vx: -Math.cos(P.ang) * 1.5 + rnd(-.4, .4), vy: -Math.sin(P.ang) * 1.5 + rnd(-.4, .4), life: 22, max: 22, size: 3.5, color: '#3cf0ff', drag: 0.9 });
  }
  if (P.inv > 0) P.inv--; if (P.recoil > 0) P.recoil *= 0.7; if (P.muzzle > 0) P.muzzle--;
  if (P.hp === 1 && G.frame % 55 === 0) AU.sfx('beat');

  // spawning, waves, bosses
  const bossFight = G.mode === 'campaign' && G.node === 'boss';
  // gradual pressure: slow start, small packs from one direction, a cap that grows with time
  const rate = Math.min(6, 0.45 + D() / 24) * (bossFight ? 0.45 : 1);
  const cap = Math.min(180, 8 + D() * 0.6);
  G.spawnAcc += rate / 60;
  while (G.spawnAcc >= 1 && !G.clearAt) {
    G.spawnAcc--; if (enemies.length >= cap) break;
    const pack = 1 + Math.min(3, Math.floor(D() / 50)), a = Math.random() * TAU, r = Math.hypot(viewW(), viewH()) * 0.55 + 40, type = pickType();
    for (let k = 0; k < pack; k++) { const aa = a + rnd(-0.18, 0.18), rr = r + rnd(0, 60); spawn(type, clamp(P.x + Math.cos(aa) * rr, 20, WORLD - 20), clamp(P.y + Math.sin(aa) * rr, 20, WORLD - 20)); }
  }
  if (G.mode === 'endless' && G.frame % 60 === 0) G.score += 10;
  // supply drop: a power core arrives on a steady rhythm that slows as the gun gets stronger
  if (G.t >= G.nextCore && G.tier < TIERS.length - 1) {
    G.nextCore = G.t + 18 + G.tier * 8;
    const a = Math.random() * TAU; items.push({ x: clamp(P.x + Math.cos(a) * 140, 30, WORLD - 30), y: clamp(P.y + Math.sin(a) * 140, 30, WORLD - 30), kind: 'power', v: 1, t: 0 });
    text(P.x, P.y - 46, 'SUPPLY DROP · POWER CORE', '#ffe14d', 16); AU.tone(880, 0.15, 'triangle', 0.05, 300);
  }
  if (G.t >= G.nextWave) {
    G.nextWave += G.mode === 'campaign' ? 30 : 40; banner('SWARM INCOMING', '#ffb547', 'From one side — get ready'); AU.sfx('warn');
    // a swarm stream from one side (an arc), not a full ring around the player
    const n = 8 + Math.floor(D() / 12), r = Math.hypot(viewW(), viewH()) * 0.5, a0 = Math.random() * TAU;
    for (let i = 0; i < n; i++) { const a = a0 + (i / Math.max(1, n - 1) - 0.5) * 1.6; spawn('swarm', clamp(P.x + Math.cos(a) * r, 20, WORLD - 20), clamp(P.y + Math.sin(a) * r, 20, WORLD - 20), true); }
  }
  if (G.t >= G.nextBoss) {
    G.nextBoss += 120; G.cine = 150; banner('WARNING', '#ff2e63', 'The Hive Core approaches', 150); AU.sfx('warn'); shake(12); flash(0.25, '#ff2e63'); punch(0.12);
    const a = Math.random() * TAU; spawn('boss', clamp(P.x + Math.cos(a) * 420, 60, WORLD - 60), clamp(P.y + Math.sin(a) * 420, 60, WORLD - 60), true);
  }
  if (G.cine > 0) G.cine--;

  buildGrid();
  updateWeapons();

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.x += b.vx; b.y += b.vy; b.life--;
    let dead = b.life <= 0;
    if (!dead) near(b.x, b.y, 30, e => {
      if (e.dead || e.spawnT > 0 || (b.hitSet && b.hitSet.has(e))) return;
      if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < (e.r + 5) ** 2) {
        damage(e, b.dmg, b.vx * 0.35, b.vy * 0.35);
        for (let k = 0; k < 3 && parts.length < 900; k++) { const a = Math.atan2(-b.vy, -b.vx) + rnd(-0.7, 0.7), s = rnd(2, 5); parts.push({ x: b.x, y: b.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 12, max: 12, size: 2.5, color: '#bff9ff', drag: 0.85 }); }
        if (b.pierce-- > 0) { (b.hitSet = b.hitSet || new Set()).add(e); } else { dead = true; return false; }
      }
    });
    if (dead) bullets.splice(i, 1);
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); continue; }
    if (e.flash > 0) e.flash--; e.sq *= 0.82;
    if (e.spawnT > 0) { e.spawnT--; continue; }
    const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
    let sx = dx / d * e.spd, sy = dy / d * e.spd;
    if (e.type === 'dasher') {
      if (e.mode === 0 && d < 280) { e.mode = 1; e.modeT = 42; e.ang = Math.atan2(dy, dx); }
      if (e.mode === 1) { sx = sy = 0; if (--e.modeT <= 0) { e.mode = 2; e.modeT = 24; AU.tone(500, 0.12, 'sawtooth', 0.03, 600); } }
      else if (e.mode === 2) { sx = Math.cos(e.ang) * 9.5; sy = Math.sin(e.ang) * 9.5; if (G.frame % 2 === 0) ghosts.push({ x: e.x, y: e.y, ang: e.ang, life: 10, enemy: e.color, r: e.r }); if (--e.modeT <= 0) { e.mode = 3; e.modeT = 70; } }
      else if (e.mode === 3) { sx *= 0.5; sy *= 0.5; if (--e.modeT <= 0) e.mode = 0; }
    }
    if (e.type === 'boss') {
      e.modeT++;
      if (e.modeT % 110 === 0) { for (let k = 0; k < 14; k++) { const a = k / 14 * TAU + e.modeT * 0.01; ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2, life: 260 }); } AU.tone(200, 0.2, 'square', 0.04, -80); e.sq = 1; ring(e.x, e.y, e.r, e.r * 2, '#ff2e63', 16, 4); }
    }
    if (e.type === 'swarm') { e.wob += 0.15; sx += Math.cos(e.wob) * 0.6; sy += Math.sin(e.wob) * 0.6; }
    near(e.x, e.y, e.r * 2, o => {
      if (o === e) return; const ox = e.x - o.x, oy = e.y - o.y, dd = ox * ox + oy * oy, min = e.r + o.r;
      if (dd < min * min && dd > 0.01) { const l = Math.sqrt(dd), push = (min - l) / l * 0.25; e.vx += ox * push; e.vy += oy * push; }
    });
    e.vx *= 0.82; e.vy *= 0.82;
    e.x = clamp(e.x + sx + e.vx, 0, WORLD); e.y = clamp(e.y + sy + e.vy, 0, WORLD);
    if (P.inv <= 0 && d < e.r + P.r - 2) hurt(e.dmg, e.x, e.y);
  }

  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i]; b.x += b.vx; b.y += b.vy; b.life--;
    if (P.inv <= 0 && (b.x - P.x) ** 2 + (b.y - P.y) ** 2 < (P.r + 6) ** 2) { hurt(1, b.x, b.y); b.life = 0; }
    if (b.life <= 0) ebullets.splice(i, 1);
  }

  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i]; g.t += 0.1; g.age++;
    if (g.vx) { g.x += g.vx; g.y += g.vy; g.vx *= 0.88; g.vy *= 0.88; if (Math.abs(g.vx) + Math.abs(g.vy) < 0.05) g.vx = g.vy = 0; }
    const dx = P.x - g.x, dy = P.y - g.y, d = Math.hypot(dx, dy) || 1;
    if (g.age > 14 && (g.pull || d < P.magnet)) { g.pull = true; g.ps = (g.ps || 0) + 0.7; const s = Math.min(18, 3 + g.ps); g.x += dx / d * s; g.y += dy / d * s; }
    if (d < P.r + 8 && g.age > 8) { gems.splice(i, 1); gainXp(g.v); if (parts.length < 900) parts.push({ x: P.x, y: P.y, vx: 0, vy: 0, life: 10, max: 10, size: 10, color: g.v >= 5 ? '#5cffb0' : '#6fc3ff', drag: 1 }); }
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]; it.t++;
    if (it.kind === 'power' && it.t > 20) { const dx = P.x - it.x, dy = P.y - it.y, d = Math.hypot(dx, dy) || 1; if (d < 700) { const s = Math.min(12, 2.5 + (it.t - 20) * 0.08); it.x += dx / d * s; it.y += dy / d * s; } }
    if ((it.x - P.x) ** 2 + (it.y - P.y) ** 2 < 30 * 30) {
      items.splice(i, 1); AU.sfx('pick'); buzz(30);
      if (it.kind === 'power') { gainPower(it.v || 1); ring(P.x, P.y, 10, 60, '#ffe14d', 16, 4); }
      else if (it.kind === 'heart') { P.hp = Math.min(P.maxHp, P.hp + 2); HUD.heartHit = -1; text(P.x, P.y - 30, '+2 HP', '#ff4d6d', 22); ring(P.x, P.y, 10, 70, '#ff4d6d', 20, 4); flash(0.12, '#ff4d6d'); }
      else { gems.forEach(g => { g.pull = true; g.age = 99; }); text(P.x, P.y - 30, 'MAGNET!', '#4dd6ff', 22); ring(P.x, P.y, 10, 300, '#4dd6ff', 30, 5); flash(0.12, '#4dd6ff'); }
    }
  }
  if (G.comboT > 0 && --G.comboT === 0) { G.combo = 0; G.streakIdx = 0; }
  if (G.mode === 'campaign' && G.state === 'play' && ((G.node !== 'boss' && G.t >= G.stageDur) || (G.clearAt && G.t >= G.clearAt))) stageClear();
}

function hurt(dmg, sx, sy) {
  P.hp -= dmg; P.inv = 70; shake(14); buzz(100); AU.sfx('hurt'); G.hitStop = 5; HUD.heartHit = 1; flash(0.35, '#ff2e63'); punch(0.04);
  burst(P.x, P.y, '#ff4d6d', 22, 5); ring(P.x, P.y, 10, 90, '#ff4d6d', 18, 5);
  const dx = P.x - sx, dy = P.y - sy, d = Math.hypot(dx, dy) || 1; P.vx += dx / d * 9; P.vy += dy / d * 9;
  near(P.x, P.y, 90, e => { const ex = e.x - P.x, ey = e.y - P.y, ed = Math.hypot(ex, ey) || 1; e.vx += ex / ed * 8; e.vy += ey / ed * 8; });
  if (P.hp <= 0 && P.secondWind) {
    P.secondWind = false; P.hp = 2; P.inv = 150; G.relics = G.relics.filter(r => r !== 'wind');
    banner('SECOND WIND', '#5cffb0', '', 90); flash(0.5, '#5cffb0'); ring(P.x, P.y, 10, 300, '#5cffb0', 34, 8); AU.sfx('nova');
    near(P.x, P.y, 300, e => { const ex = e.x - P.x, ey = e.y - P.y, ed = Math.hypot(ex, ey) || 1; e.vx += ex / ed * 16; e.vy += ey / ed * 16; });
    return;
  }
  if (P.hp <= 0) gameOver();
}

function gainXp(v) {
  G.xp += v * P.xpMul; AU.sfx('gem');
  if (G.xp >= G.xpNeed) {
    G.xp -= G.xpNeed; G.level++; G.xpNeed = Math.floor(G.xpNeed * 1.28 + 4); HUD.levelPop = 1;
    AU.sfx('level'); buzz(50); ring(P.x, P.y, 10, 170, '#ffe14d', 30, 7); ring(P.x, P.y, 10, 120, '#ffffff', 20, 3); burst(P.x, P.y, '#ffe14d', 34, 6, 3);
    flash(0.3, '#ffe14d'); punch(0.08);
    G.slow = 26;
  }
}

// ---------- rendering ----------
function shapePath(e, r) {
  X.beginPath();
  const face = Math.atan2(P.y - e.y, P.x - e.x);
  if (e.type === 'swarm') { for (let k = 0; k < 3; k++) { const a = e.wob * 0.3 + k * TAU / 3 + face; X.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2); } }
  else if (e.type === 'tank') { for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + G.frame * 0.01; X.lineTo(Math.cos(a) * r, Math.sin(a) * r); } }
  else if (e.type === 'dasher') { const a = e.mode >= 1 ? e.ang : face; X.moveTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5); X.lineTo(Math.cos(a + 2.3) * r, Math.sin(a + 2.3) * r); X.lineTo(-Math.cos(a) * r * 0.4, -Math.sin(a) * r * 0.4); X.lineTo(Math.cos(a - 2.3) * r, Math.sin(a - 2.3) * r); }
  else if (e.type === 'boss') { for (let k = 0; k < 16; k++) { const a = k * TAU / 16 + G.frame * 0.006, rr = k % 2 ? r * 0.78 : r; X.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } }
  else X.arc(0, 0, r, 0, TAU);
  X.closePath();
}

function drawShip(x, y, ang, stretch, alpha = 1, ghost = false) {
  X.save(); X.translate(x, y); X.rotate(ang); X.scale(1 + stretch * 0.22, 1 - stretch * 0.15); X.globalAlpha = alpha;
  const s = ghost ? SPR.white(SPR.ship()) : SPR.ship(), sc = 0.82;
  if (!ghost) {
    const fl = 10 + Math.random() * 7 + stretch * 14;
    X.fillStyle = '#ff7a2e'; X.beginPath(); X.moveTo(-12, -6); X.quadraticCurveTo(-12 - fl, 0, -12, 6); X.fill();
    X.fillStyle = '#ffe14d'; X.beginPath(); X.moveTo(-12, -3); X.quadraticCurveTo(-12 - fl * 0.6, 0, -12, 3); X.fill();
  }
  if (ghost) X.globalAlpha = alpha * 0.6;
  X.drawImage(s, -s.w * sc / 2, -s.h * sc / 2, s.w * sc, s.h * sc);
  X.restore(); X.globalAlpha = 1;
}

// floor plating + seeded decorations + decals (world space)
let floorPat = null;
function drawFloor(hw, hh) {
  if (!floorPat) floorPat = X.createPattern(SPR.floor(), 'repeat');
  const x0 = Math.max(0, cam.x - hw), y0 = Math.max(0, cam.y - hh), x1 = Math.min(WORLD, cam.x + hw), y1 = Math.min(WORLD, cam.y + hh);
  X.fillStyle = floorPat; X.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (G.mode === 'campaign') { X.globalAlpha = 0.07; X.fillStyle = SYSTEMS[Math.min(G.sys, SYSTEMS.length - 1)].tint; X.fillRect(x0, y0, x1 - x0, y1 - y0); X.globalAlpha = 1; }
  const CH = 300;
  for (let cx = Math.floor((cam.x - hw) / CH); cx <= Math.floor((cam.x + hw) / CH); cx++) for (let cy = Math.floor((cam.y - hh) / CH); cy <= Math.floor((cam.y + hh) / CH); cy++) {
    if (cx < 0 || cy < 0 || cx * CH >= WORLD || cy * CH >= WORLD) continue;
    const n = Math.floor(hash(cx, cy) * 3);
    for (let i = 0; i < n; i++) {
      const r1 = hash(cx * 7 + i, cy * 13 - i), r2 = hash(cx * 3 - i, cy * 5 + i * 9), r3 = hash(cx + i * 31, cy * 17);
      const x = cx * CH + 30 + r1 * (CH - 60), y = cy * CH + 30 + r2 * (CH - 60);
      let s;
      if (r3 < 0.35) { const col = DECO_COLORS[Math.floor(r1 * 4)]; s = SPR.DECOR.crystal(col); X.globalCompositeOperation = 'lighter'; glow(x, y, 46, col, 0.22 + Math.sin(G.frame * 0.04 + r1 * 9) * 0.06); X.globalCompositeOperation = 'source-over'; X.globalAlpha = 1; }
      else if (r3 < 0.55) s = SPR.DECOR.vent(); else if (r3 < 0.85) s = SPR.DECOR.rock(); else { s = SPR.DECOR.lamp(); X.globalCompositeOperation = 'lighter'; glow(x, y, 22, '#5cffb0', 0.5); X.globalCompositeOperation = 'source-over'; X.globalAlpha = 1; }
      blit(s, x, y, 0.8);
    }
  }
  for (let i = decals.length - 1; i >= 0; i--) {
    const d = decals[i]; if (G.state === 'play' && --d.life <= 0) { decals.splice(i, 1); continue; }
    if (Math.abs(d.x - cam.x) > hw + 40 || Math.abs(d.y - cam.y) > hh + 40) continue;
    X.globalAlpha = Math.min(1, d.life / 200) * 0.55; blit(SPR.splat(d.color), d.x, d.y, d.sc, d.rot);
  }
  X.globalAlpha = 1;
}

function draw() {
  X.setTransform(DPR, 0, 0, DPR, 0, 0);
  X.fillStyle = '#070912'; X.fillRect(0, 0, W, H);

  // nebula (far parallax)
  X.globalCompositeOperation = 'lighter';
  for (const n of nebula) {
    const sx = W / 2 + (n.x - cam.x) * 0.3 * cam.z, sy = H / 2 + (n.y - cam.y) * 0.3 * cam.z, r = n.r * (1 + Math.sin(G.frame * 0.004 + n.ph) * 0.08);
    if (sx > -r && sx < W + r && sy > -r && sy < H + r) glow(sx, sy, r, n.c, 0.13);
  }
  X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  for (const s of stars) {
    const sx = ((s.x * W * 3 - cam.x * s.d) % W + W) % W, sy = ((s.y * H * 3 - cam.y * s.d) % H + H) % H;
    X.globalAlpha = (0.25 + s.d) * (0.75 + Math.sin(G.frame * 0.05 + s.tw) * 0.25); X.fillStyle = s.d > 0.35 ? '#bff9ff' : '#6a70b0'; X.fillRect(sx, sy, s.s, s.s);
  }
  X.globalAlpha = 1;

  let shx = 0, shy = 0; if (G.shake > 0.3) { shx = rnd(-1, 1) * G.shake; shy = rnd(-1, 1) * G.shake; G.shake *= 0.86; } else G.shake = 0;
  const z = cam.z;
  X.save(); X.translate(W / 2 + shx, H / 2 + shy); X.scale(z, z); X.translate(-cam.x, -cam.y);
  const hw = viewW() / 2, hh = viewH() / 2;
  const vis = (x, y, m) => Math.abs(x - cam.x) < hw + m && Math.abs(y - cam.y) < hh + m;

  drawFloor(hw, hh);
  X.strokeStyle = `rgba(255,46,99,${0.35 + Math.sin(G.frame * 0.05) * 0.15})`; X.lineWidth = 4; X.strokeRect(0, 0, WORLD, WORLD);

  // glow layer
  X.globalCompositeOperation = 'lighter';
  for (const g of gems) if (vis(g.x, g.y, 20)) glow(g.x, g.y, 16, g.v >= 5 ? '#5cffb0' : '#3c9bff', 0.6);
  for (const e of enemies) if (vis(e.x, e.y, 80)) glow(e.x, e.y, e.r * 2.4, e.color, (e.type === 'boss' ? 0.55 : 0.16) * (e.spawnT > 0 ? 1 - e.spawnT / e.spawnMax : 1));
  for (const b of bullets) glow(b.x, b.y, 16 + b.lv * 3, b.lv >= 4 ? '#ffe14d' : '#3cf0ff', 0.7);
  for (const b of ebullets) glow(b.x, b.y, 18, '#ff2e63', 0.8);
  if (G.state !== 'over' || G.deathT < 2) glow(P.x, P.y, 46 + P.stretch * 10, '#3cf0ff', 0.55);
  if (P.muzzle > 0) glow(P.x + Math.cos(P.muzzleAng) * 20, P.y + Math.sin(P.muzzleAng) * 20, 22, '#bff9ff', P.muzzle / 4);
  X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';

  // rings
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i], k = 1 - r.life / r.max, ease = 1 - Math.pow(1 - k, 3);
    X.globalAlpha = 1 - k; X.strokeStyle = r.color; X.lineWidth = r.w * (1 - k) + 0.5;
    X.beginPath(); X.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * ease, 0, TAU); X.stroke();
    if (--r.life <= 0) rings.splice(i, 1);
  }
  X.globalAlpha = 1;

  // spawn portals
  for (const e of enemies) if (e.spawnT > 0 && vis(e.x, e.y, 40)) {
    const k = 1 - e.spawnT / e.spawnMax;
    X.strokeStyle = e.color; X.globalAlpha = 0.4 + k * 0.5; X.lineWidth = 2;
    X.beginPath(); X.arc(e.x, e.y, e.r * (2.2 - k * 1.2), G.frame * 0.1, G.frame * 0.1 + TAU * 0.75); X.stroke();
  }
  X.globalAlpha = 1;

  // gems
  for (const g of gems) {
    if (!vis(g.x, g.y, 20)) continue;
    const by = Math.sin(g.t) * 2.5, spin = Math.cos(g.t * 0.7);
    X.fillStyle = 'rgba(0,0,0,.3)'; X.beginPath(); X.ellipse(g.x, g.y + 9, 5 - by * 0.4, 2, 0, 0, TAU); X.fill();
    blit(SPR.gem(g.v >= 5 ? 1 : 0), g.x, g.y + by - 2, 0.85, 0, Math.abs(spin) * 0.7 + 0.3, 1);
  }
  // items
  for (const it of items) {
    const p = 1 + Math.sin(it.t * 0.12) * 0.15, fy = Math.sin(it.t * 0.06) * 4;
    const gc = it.kind === 'heart' ? '#ff4d6d' : it.kind === 'power' ? '#ffe14d' : '#4dd6ff';
    X.globalCompositeOperation = 'lighter'; glow(it.x, it.y + fy, 34 * p, gc, 0.8); X.globalCompositeOperation = 'source-over'; X.globalAlpha = 1;
    if (it.kind === 'power') blit(SPR.power(), it.x, it.y + fy, p * (it.v > 1 ? 1.2 : 1), Math.sin(it.t * 0.05) * 0.3);
    else blit(it.kind === 'heart' ? SPR.heart() : SPR.magnet(), it.x, it.y + fy, p * 0.95);
  }

  // dasher telegraphs
  for (const e of enemies) if (e.type === 'dasher' && e.mode === 1) {
    const k = 1 - e.modeT / 42;
    X.strokeStyle = `rgba(77,214,255,${0.25 + k * 0.6})`; X.lineWidth = 2 + k * 3; X.setLineDash([8, 8]); X.lineDashOffset = -G.frame * 2;
    X.beginPath(); X.moveTo(e.x, e.y); X.lineTo(e.x + Math.cos(e.ang) * 230, e.y + Math.sin(e.ang) * 230); X.stroke(); X.setLineDash([]);
  }

  // ghosts (dash afterimages)
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const g = ghosts[i], a = g.life / 16;
    if (g.enemy) { X.globalAlpha = a * 0.5; X.fillStyle = g.enemy; X.beginPath(); X.arc(g.x, g.y, g.r, 0, TAU); X.fill(); X.globalAlpha = 1; }
    else drawShip(g.x, g.y, g.ang, 0.6, a * 0.45, true);
    if (--g.life <= 0) ghosts.splice(i, 1);
  }

  // drop shadows (one batched path) give everything weight on the floor
  X.fillStyle = 'rgba(0,0,0,.38)'; X.beginPath();
  for (const e of enemies) {
    if (e.spawnT > 0 || !vis(e.x, e.y, 60)) continue;
    const air = e.type === 'swarm' ? 9 : 0; X.moveTo(e.x + e.r * 0.95, e.y + e.r * 0.75 + air); X.ellipse(e.x, e.y + e.r * 0.75 + air, e.r * 0.95, e.r * 0.36, 0, 0, TAU);
  }
  X.fill();

  // enemies: cached sprites + walk bob + facing + squash & stretch + white hit flash
  const SCALE = { grunt: 1 / 13, swarm: 0.9 / 9, tank: 1 / 22, dasher: 0.85 / 12 };
  for (const e of enemies) {
    if (e.spawnT > 0 || !vis(e.x, e.y, 80)) continue;
    const s = e.sq; e.walk = (e.walk || e.wob) + (e.type === 'tank' ? 0.12 : 0.22);
    if (e.type === 'boss') {
      const pulse = 1 + Math.sin(G.frame * 0.08) * 0.04, sc = e.r / 48;
      X.save(); X.translate(e.x, e.y); X.scale(1 + s * 0.12, 1 - s * 0.1);
      blit(e.flash ? SPR.white(SPR.bossShell()) : SPR.bossShell(), 0, 0, sc * pulse, G.frame * 0.01);
      blit(e.flash ? SPR.white(SPR.bossBody()) : SPR.bossBody(), 0, 0, sc);
      const a = Math.atan2(P.y - e.y, P.x - e.x), ir = 12 * sc;
      X.fillStyle = '#ff2e63'; X.beginPath(); X.arc(Math.cos(a) * 7 * sc, Math.sin(a) * 7 * sc, ir, 0, TAU); X.fill();
      X.fillStyle = SPR.OUT; X.beginPath(); X.ellipse(Math.cos(a) * 9 * sc, Math.sin(a) * 9 * sc, ir * 0.35, ir * 0.8, a, 0, TAU); X.fill();
      X.restore(); continue;
    }
    const frame = e.type === 'swarm' ? ((G.frame >> 2) + (e.wob * 3 | 0)) & 1 : ((e.walk / 1.6) | 0) & 1;
    let spr = SPR.ENEMY[e.type](frame); if (e.flash) spr = SPR.white(spr);
    const sc = e.r * SCALE[e.type], bob = e.type === 'swarm' ? -9 + Math.sin(e.walk) * 3 : -Math.abs(Math.sin(e.walk)) * 3.5;
    const face = Math.atan2(P.y - e.y, P.x - e.x);
    if (e.type === 'dasher') {
      const a = e.mode >= 1 ? e.ang : face, left = Math.cos(a) < 0;
      blit(spr, e.x, e.y + bob * 0.4, sc, a, 1 + s * 0.25, (left ? -1 : 1) * (1 - s * 0.2));
    } else {
      const flip = P.x < e.x ? -1 : 1, stretch = e.type === 'swarm' ? 0 : Math.abs(Math.sin(e.walk)) * 0.06;
      blit(spr, e.x, e.y + bob, sc, 0, flip * (1 + s * 0.28 - stretch), 1 - s * 0.22 + stretch);
    }
    if (e.type === 'tank' && e.hp < e.max) {
      X.fillStyle = SPR.OUT; X.fillRect(e.x - 20, e.y - e.r - 16, 40, 6);
      X.fillStyle = '#c79bff'; X.fillRect(e.x - 19, e.y - e.r - 15, 38 * e.hp / e.max, 4);
    }
  }

  // enemy bullets
  for (const b of ebullets) blit(SPR.orb(), b.x, b.y, 1 + Math.sin(G.frame * 0.3 + b.x) * 0.1);

  // player bullets
  X.lineCap = 'round';
  for (const b of bullets) blit(SPR.bolt(), b.x, b.y, 0.9 + b.lv * 0.12, Math.atan2(b.vy, b.vx));

  // orbit blades with motion trails
  if (LV.orbit) {
    const n = LV.orbit + 1, R = 62 + LV.orbit * 8, spd = 0.055 + LV.orbit * 0.008;
    X.strokeStyle = 'rgba(176,107,255,.12)'; X.lineWidth = 1; X.beginPath(); X.arc(P.x, P.y, R, 0, TAU); X.stroke();
    for (let i = 0; i < n; i++) {
      const a = WP.orbitAng + i * TAU / n, bx = P.x + Math.cos(a) * R, by = P.y + Math.sin(a) * R;
      X.strokeStyle = 'rgba(176,107,255,.35)'; X.lineWidth = 8; X.beginPath(); X.arc(P.x, P.y, R, a - spd * 6, a); X.stroke();
      X.globalCompositeOperation = 'lighter'; glow(bx, by, 26, '#b06bff', 0.8); X.globalCompositeOperation = 'source-over'; X.globalAlpha = 1;
      blit(SPR.blade(), bx, by, 0.9, a * 3);
    }
  }

  // lightning
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]; X.globalAlpha = b.life / 14;
    for (const [col, w] of [['#ffe14d', 6], ['#ffffff', 2]]) {
      X.strokeStyle = col; X.lineWidth = w; X.beginPath(); X.moveTo(b.pts[0].x, b.pts[0].y);
      for (let k = 1; k < b.pts.length; k++) { const a = b.pts[k - 1], c = b.pts[k]; for (let s = 1; s <= 4; s++) { const t = s / 4; X.lineTo(a.x + (c.x - a.x) * t + (s < 4 ? rnd(-9, 9) : 0), a.y + (c.y - a.y) * t + (s < 4 ? rnd(-9, 9) : 0)); } }
      X.stroke();
    }
    if (--b.life <= 0) bolts.splice(i, 1);
  }
  X.globalAlpha = 1;

  // shards
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i]; s.x += s.vx; s.y += s.vy; s.vx *= 0.93; s.vy *= 0.93; s.rot += s.vr;
    const k = s.life / s.max; X.globalAlpha = Math.min(1, k * 1.5); X.fillStyle = s.color;
    X.save(); X.translate(s.x, s.y); X.rotate(s.rot); X.beginPath(); X.moveTo(s.size * k, 0); X.lineTo(-s.size * 0.6 * k, s.size * 0.5 * k); X.lineTo(-s.size * 0.4 * k, -s.size * 0.6 * k); X.fill(); X.restore();
    if (--s.life <= 0) shards.splice(i, 1);
  }
  X.globalAlpha = 1;

  // particles
  X.globalCompositeOperation = 'lighter';
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vx *= p.drag; p.vy *= p.drag;
    const k = p.life / p.max; X.globalAlpha = k; X.fillStyle = p.color;
    X.fillRect(p.x - p.size * k / 2, p.y - p.size * k / 2, p.size * k, p.size * k);
    if (--p.life <= 0) parts.splice(i, 1);
  }
  X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';

  // player
  if (G.state !== 'over') { X.fillStyle = 'rgba(0,0,0,.4)'; X.beginPath(); X.ellipse(P.x, P.y + 16, 15, 5.5, 0, 0, TAU); X.fill(); }
  if (G.state === 'title') drawShip(P.x, P.y, P.ang, 0.2);
  else if (G.state !== 'over' && !(P.inv > 0 && P.dashT <= 0 && P.inv % 8 < 4 && G.state === 'play')) {
    drawShip(P.x - Math.cos(P.ang) * P.recoil, P.y - Math.sin(P.ang) * P.recoil, P.ang, P.stretch);
  }

  // floating texts (arc + pop)
  X.textAlign = 'center'; X.textBaseline = 'middle';
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i]; t.x += t.vx; t.y += t.vy; t.vy += 0.09; t.vx *= 0.97;
    const k = t.life / t.max, age = 1 - k, pop = age < 0.15 ? 0.6 + age / 0.15 * 0.7 : age < 0.3 ? 1.3 - (age - 0.15) / 0.15 * 0.3 : 1;
    X.globalAlpha = Math.min(1, k * 2.5); X.font = `900 ${t.size * pop}px system-ui`;
    X.lineWidth = 4; X.strokeStyle = 'rgba(7,9,18,.85)'; X.strokeText(t.s, t.x, t.y); X.fillStyle = t.color; X.fillText(t.s, t.x, t.y);
    if (--t.life <= 0) texts.splice(i, 1);
  }
  X.globalAlpha = 1;
  X.restore();

  // off-screen boss arrow
  const boss = enemies.find(e => e.type === 'boss' && e.spawnT <= 0);
  if (boss && !vis(boss.x, boss.y, 0) && G.state === 'play') {
    const a = Math.atan2(boss.y - P.y, boss.x - P.x), ax = clamp(W / 2 + Math.cos(a) * W, 28, W - 28), ay = clamp(H / 2 + Math.sin(a) * H, 80, H - 120);
    const p = 1 + Math.sin(G.frame * 0.2) * 0.15;
    X.save(); X.translate(ax, ay); X.rotate(a); X.scale(p, p); X.fillStyle = '#ff2e63'; X.beginPath(); X.moveTo(16, 0); X.lineTo(-8, -11); X.lineTo(-8, 11); X.fill(); X.restore();
  }

  // vignette / low hp
  const vg = X.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  const low = P.hp === 1 && G.state === 'play' ? 0.25 + Math.sin(G.frame * 0.12) * 0.12 : 0;
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, low ? `rgba(120,0,30,${0.5 + low})` : 'rgba(0,0,0,.55)');
  X.fillStyle = vg; X.fillRect(0, 0, W, H);

  // cinematic letterbox for boss intro
  G.cineH = lerp(G.cineH, G.cine > 0 ? Math.min(70, H * 0.09) : 0, 0.12);
  if (G.cineH > 0.5) { X.fillStyle = '#000'; X.fillRect(0, 0, W, G.cineH); X.fillRect(0, H - G.cineH, W, G.cineH); }

  // screen flash
  if (G.flash > 0.01) { X.globalAlpha = G.flash; X.fillStyle = G.flashCol; X.fillRect(0, 0, W, H); X.globalAlpha = 1; G.flash *= 0.84; }

  if (G.state !== 'title' && G.state !== 'map') drawHud(boss);

  if (joy && G.state === 'play') {
    X.strokeStyle = 'rgba(255,255,255,.18)'; X.lineWidth = 2; X.beginPath(); X.arc(joy.ox, joy.oy, 56, 0, TAU); X.stroke();
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, l = Math.max(1, Math.hypot(dx, dy)), k = Math.min(56, l);
    X.fillStyle = 'rgba(60,240,255,.35)'; X.beginPath(); X.arc(joy.ox + dx / l * k, joy.oy + dy / l * k, 22, 0, TAU); X.fill();
  }
}

function drawHud(boss) {
  const top = 10 + G.cineH * 0.9;
  HUD.xp = lerp(HUD.xp, clamp(G.xp / G.xpNeed, 0, 1), 0.15);
  HUD.heartHit *= 0.88; HUD.killPop *= 0.85; HUD.levelPop *= 0.92;
  // xp bar
  const bh = 6 + HUD.levelPop * 6;
  X.fillStyle = 'rgba(255,255,255,.08)'; X.fillRect(0, G.cineH, W, bh);
  const xg = X.createLinearGradient(0, 0, W, 0); xg.addColorStop(0, '#3c9bff'); xg.addColorStop(1, HUD.levelPop > 0.1 ? '#ffe14d' : '#3cf0ff');
  X.fillStyle = xg; X.fillRect(0, G.cineH, W * HUD.xp, bh);
  if (HUD.xp > 0.02) { X.globalCompositeOperation = 'lighter'; glow(W * HUD.xp, G.cineH + bh / 2, 14, '#3cf0ff', 0.9); X.globalCompositeOperation = 'source-over'; X.globalAlpha = 1; }
  // hearts
  X.textAlign = 'center'; X.textBaseline = 'middle';
  for (let i = 0; i < P.maxHp; i++) {
    const full = i < P.hp, low = P.hp === 1 && full, s = 18 * (1 + (low ? Math.sin(G.frame * 0.2) * 0.18 : 0) + Math.max(0, -HUD.heartHit) * 0.4);
    const jx = HUD.heartHit > 0.05 ? rnd(-3, 3) * HUD.heartHit : 0;
    X.font = `700 ${s}px system-ui`; X.fillStyle = full ? '#ff4d6d' : 'rgba(255,255,255,.18)'; X.fillText('♥', 21 + i * 19 + jx, top + 18);
  }
  X.textAlign = 'left'; X.font = `800 ${12 * (1 + HUD.levelPop * 0.6)}px system-ui`; X.fillStyle = '#ffe14d'; X.fillText('LV ' + G.level, 12, top + 40);
  // timer + kills
  X.textAlign = 'center'; X.font = '900 26px system-ui'; X.fillStyle = '#fff';
  let clock = Math.floor(G.t / 60) + ':' + String(Math.floor(G.t % 60)).padStart(2, '0');
  if (G.mode === 'campaign') {
    if (G.node === 'boss') clock = 'BOSS';
    else if (isFinite(G.stageDur)) { const left = Math.max(0, Math.ceil(G.stageDur - G.t)); clock = '0:' + String(left).padStart(2, '0'); if (left <= 5) X.fillStyle = '#5cffb0'; }
    X.textAlign = 'left'; X.font = '800 11px system-ui'; X.fillStyle = SYSTEMS[G.sys].tint;
    X.fillText(SYSTEMS[G.sys].name.toUpperCase() + ' · ' + (G.node === 'boss' ? 'BOSS' : (G.step + 1) + '/' + STEPS), 12, top + 58);
    X.textAlign = 'center'; X.font = '900 26px system-ui'; X.fillStyle = '#fff';
  }
  X.fillText(clock, W / 2, top + 16);
  // loadout: every owned weapon / passive with its level pips
  {
    const owned = UPGRADES.filter(u => u.id !== 'blaster' && LV[u.id] > 0); let lx = 12; const ly = top + (G.mode === 'campaign' ? 68 : 52);
    X.textAlign = 'center'; X.textBaseline = 'middle';
    // main gun: tier number + progress to next tier
    HUD.powerPop *= 0.9; const need = POWER_NEED[G.tier] || 1, maxed = G.tier >= TIERS.length - 1;
    HUD.power = lerp(HUD.power, maxed ? 1 : G.power / need, 0.15);
    const gs = 1 + HUD.powerPop * 0.15;
    X.save(); X.translate(lx + 26, ly + 13); X.scale(gs, gs);
    X.fillStyle = 'rgba(18,21,42,.85)'; X.beginPath(); X.roundRect(-26, -13, 52, 26, 7); X.fill();
    X.strokeStyle = '#ffe14d'; X.lineWidth = 1.5; X.stroke();
    X.font = '900 12px system-ui'; X.fillStyle = '#ffe14d'; X.fillText('✦ T' + (G.tier + 1), 0, 0);
    X.restore();
    X.fillStyle = 'rgba(255,255,255,.15)'; X.fillRect(lx + 2, ly + 29, 48, 3);
    X.fillStyle = maxed ? '#ff2e63' : '#ffe14d'; X.fillRect(lx + 2, ly + 29, 48 * HUD.power, 3);
    lx += 56;
    for (const u of owned) {
      X.fillStyle = 'rgba(18,21,42,.8)'; X.beginPath(); X.roundRect(lx, ly, 26, 26, 7); X.fill();
      X.strokeStyle = u.col + '99'; X.lineWidth = 1.5; X.stroke();
      X.font = '700 14px system-ui'; X.fillStyle = u.col; X.fillText(u.icon, lx + 13, ly + 13);
      for (let k = 0; k < u.max; k++) { X.fillStyle = k < LV[u.id] ? '#ffc94d' : 'rgba(255,255,255,.15)'; X.fillRect(lx + 2 + k * 4.6, ly + 29, 3.4, 2.5); }
      lx += 30;
    }
  }
  // score (right)
  X.textAlign = 'right'; X.font = '900 16px system-ui'; X.fillStyle = '#ffe14d'; X.fillText(G.score.toLocaleString('en-US'), W - 12, top + 52);
  X.font = '700 10px system-ui'; X.fillStyle = '#8d93c4'; X.fillText(G.mode === 'campaign' ? '¤ ' + G.coins + ' · SCORE' : 'SCORE', W - 12, top + 68);
  X.textAlign = 'center';
  X.font = `700 ${12 * (1 + HUD.killPop * 0.35)}px system-ui`; X.fillStyle = HUD.killPop > 0.3 ? '#fff' : '#8d93c4'; X.fillText('☠ ' + G.kills, W / 2, top + 40);
  if (G.combo >= 5) {
    const k = G.comboT / 90, sz = 18 + Math.min(16, G.combo / 8);
    X.globalAlpha = Math.min(1, k * 2); X.font = `900 ${sz * (1 + HUD.killPop * 0.15)}px system-ui`; X.fillStyle = '#ffe14d';
    X.fillText('x' + G.combo, W / 2, top + 64);
    X.fillStyle = 'rgba(255,225,77,.35)'; X.fillRect(W / 2 - 30, top + 78, 60 * k, 3); X.globalAlpha = 1;
  }
  // boss bar
  if (boss) {
    const bw = Math.min(W - 40, 360), bx = (W - bw) / 2, by = H - 46 - G.cineH;
    boss.shown = lerp(boss.shown ?? 1, Math.max(0, boss.hp / boss.max), 0.06);
    X.fillStyle = 'rgba(0,0,0,.55)'; X.fillRect(bx, by, bw, 10);
    X.fillStyle = '#fff'; X.fillRect(bx, by, bw * boss.shown, 10);
    X.fillStyle = '#ff2e63'; X.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.max), 10);
    X.font = '800 11px system-ui'; X.fillStyle = '#ffb3c6'; X.fillText('HIVE CORE', W / 2, by - 12);
  }
  // banner: slide + scale in, fade out
  if (G.banner) {
    const b = G.banner, age = b.max - b.life, inK = Math.min(1, age / 16), e = 1 - Math.pow(1 - inK, 3), outK = Math.min(1, b.life / 24);
    const y = H * 0.3, sc = 1.6 - e * 0.6;
    X.font = '900 30px system-ui'; const fit = Math.min(1, (W - 28) / (X.measureText(b.s).width * 1.02));
    X.save(); X.translate(W / 2, y); X.scale(sc * fit, sc * fit); X.globalAlpha = e * outK; X.lineWidth = 6; X.strokeStyle = 'rgba(7,9,18,.85)'; X.strokeText(b.s, 0, 0); X.fillStyle = b.color; X.fillText(b.s, 0, 0);
    X.restore();
    if (b.sub) { X.globalAlpha = e * outK; X.font = '700 14px system-ui'; X.fillStyle = '#fff'; X.fillText(b.sub, W / 2, y + 34 + (1 - e) * 10); }
    X.globalAlpha = 1; if (--b.life <= 0) G.banner = null;
  }
  if (G.t < 5 && G.state === 'play') {
    X.globalAlpha = Math.min(1, (5 - G.t)); X.font = '600 15px system-ui'; X.fillStyle = 'rgba(255,255,255,.85)';
    X.fillText('Drag anywhere to fly · tap DASH to dodge', W / 2, H - 130); X.globalAlpha = 1;
  }
}

// ---------- screens ----------
const scr = document.getElementById('scr'), box = document.getElementById('box'), hudbtn = document.getElementById('hudbtn');
function show(html) { box.innerHTML = html; scr.classList.remove('hidden', 'out'); box.querySelectorAll('.in').forEach((el, i) => el.style.animationDelay = (i * 70) + 'ms'); }
function hide(cb) { scr.classList.add('out'); setTimeout(() => { scr.classList.add('hidden'); scr.classList.remove('out'); cb && cb(); }, 200); }
const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
function setPlayUi(on) { hudbtn.style.display = on ? 'block' : 'none'; dashBtn.style.display = on ? 'block' : 'none'; }

function titleScreen() {
  G.state = 'title'; setPlayUi(false); const s = Save.bump(() => {});
  newRun(); P.inv = 0;
  for (let i = 0; i < 30; i++) spawn(['grunt', 'swarm', 'tank', 'dasher'][i % 4], WORLD / 2 + rnd(-600, 600), WORLD / 2 + rnd(-700, 700));
  enemies.forEach(e => { e.spawnT = 0; e.tx = e.x; e.ty = e.y; });
  show(`<div class="logo in">NEON<span>SWARM</span></div>
    <p class="tag in">Survive the swarm. Grow unstoppable.</p>
    <div class="stats in"><div class="stat"><b>${fmt(s.best)}</b><span>Best time</span></div><div class="stat"><b>${s.bestKills}</b><span>Best kills</span></div><div class="stat"><b>${s.rounds}</b><span>Runs</span></div></div>
    <button class="btn in mode" id="camp"><b>CAMPAIGN</b><span>5 star systems · routes, relics, bosses</span></button>
    <button class="btn cyan in mode" id="endl"><b>ENDLESS</b><span>Score attack · beat the records</span></button>
    <div class="row in"><button class="btn ghost" id="hang">🛠 Hangar <small style="color:var(--gold)">${s.credits || 0}</small></button><button class="btn ghost" id="rec">🏆 Records</button></div>
    <button class="btn ghost in" id="snd" style="font-size:14px;padding:10px">Sound: ${AU.on ? 'ON' : 'OFF'}</button>
    <p class="small in">Prototype · working title</p>`);
  document.getElementById('camp').onclick = () => { AU.init(); AU.sfx('ui'); hide(() => start('campaign')); flash(0.5, '#ff2e63'); };
  document.getElementById('endl').onclick = () => { AU.init(); AU.sfx('ui'); hide(() => start('endless')); flash(0.5, '#3cf0ff'); };
  document.getElementById('rec').onclick = () => { AU.init(); AU.sfx('ui'); recordsScreen('endless'); };
  document.getElementById('hang').onclick = () => { AU.init(); AU.sfx('ui'); hangarScreen(); };
  document.getElementById('snd').onclick = e => { AU.on = !AU.on; Save.bump(s => s.sound = AU.on); e.target.textContent = 'Sound: ' + (AU.on ? 'ON' : 'OFF'); };
}
function updateTitle() {
  G.frame++;
  const t = G.frame * 0.01; P.x = WORLD / 2 + Math.cos(t) * 140; P.y = WORLD / 2 + Math.sin(t * 2) * 60;
  P.ang = Math.atan2(Math.cos(t * 2) * 120, -Math.sin(t) * 140);
  if (G.frame % 2 === 0 && parts.length < 300) parts.push({ x: P.x - Math.cos(P.ang) * 14, y: P.y - Math.sin(P.ang) * 14, vx: 0, vy: 0, life: 26, max: 26, size: 3.5, color: '#3cf0ff', drag: 1 });
  for (const e of enemies) { e.wob += 0.03; e.x = e.tx + Math.cos(e.wob) * 30; e.y = e.ty + Math.sin(e.wob * 1.3) * 22; }
  cam.x = lerp(cam.x, P.x, 0.02); cam.y = lerp(cam.y, P.y + 60, 0.02); cam.z = lerp(cam.z, baseZoom() * 0.9, 0.05);
}
function start(mode = 'endless') {
  newRun(mode); AU.startMusic();
  if (mode === 'campaign') { mapScreen(); return; }
  G.state = 'play'; setPlayUi(true); cam.z = baseZoom() * 1.25;
  ring(P.x, P.y, 10, 160, '#3cf0ff', 34, 6); burst(P.x, P.y, '#3cf0ff', 30, 6, 3);
}

// ---------- campaign flow ----------
function startNode(type) {
  const sys = SYSTEMS[G.sys];
  G.totalT += G.t; resetField(); G.node = type; G.t = 0; G.clearAt = 0;
  G.diffBase = G.sys * 55 + G.step * 12 + (type === 'elite' ? 25 : 0) + (type === 'boss' ? 15 : 0);
  G.stageDur = type === 'battle' ? 45 : type === 'elite' ? 55 : Infinity;
  G.nextWave = 30; G.nextCore = 15; G.nextBoss = type === 'boss' ? 2.5 : Infinity; G.spawnAcc = 0; G.combo = 0; G.comboT = 0; G.streakIdx = 0; G.slow = 0;
  P.x = P.y = WORLD / 2; P.vx = P.vy = 0; P.inv = 90; cam.x = P.x; cam.y = P.y; cam.z = baseZoom() * 1.25;
  nebula.forEach((n, i) => n.c = sys.neb[i % 2]);
  G.state = 'play'; setPlayUi(true);
  banner(sys.name.toUpperCase(), sys.tint, type === 'boss' ? 'Destroy the Hive Core' : type === 'elite' ? 'Elite sector · survive 55 s' : 'Survive 45 s', 130);
  ring(P.x, P.y, 10, 160, sys.tint, 34, 6); burst(P.x, P.y, sys.tint, 30, 6, 3);
}
function stageClear() {
  const node = G.node; G.clearAt = 0; G.state = 'clear'; G.slow = 0; setPlayUi(false); joy = null;
  for (const e of enemies) { burst(e.x, e.y, e.color, 8, 5); shatter(e.x, e.y, e.color, 3, 5, 5); }
  enemies = []; ebullets = [];
  let left = 0; gems.forEach(g => left += g.v); gems = [];
  const coins = Math.round((node === 'elite' ? 40 : node === 'boss' ? 80 : 25) * P.coinMul);
  G.coins += coins; G.score += Math.round((500 * (G.sys + 1) + left * 5) * P.coinMul);
  banner(node === 'boss' ? 'SYSTEM CLEARED' : 'SECTOR CLEAR', '#5cffb0', '+' + coins + ' coins', 140);
  AU.sfx('level'); flash(0.3, '#5cffb0'); ring(P.x, P.y, 10, 520, '#5cffb0', 44, 8); shake(8); punch(0.06);
  setTimeout(() => {
    if (node === 'boss') { G.sys++; G.step = 0; if (G.sys >= SYSTEMS.length) { victory(); return; } P.hp = Math.min(P.maxHp, P.hp + 1); mapScreen(); }
    else { G.step++; if (node === 'elite') relicPick(mapScreen); else mapScreen(); }
  }, 1700);
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function relicLine() {
  if (!G.relics.length) return '';
  return `<div class="relics in">${G.relics.map(id => { const r = RELICS.find(x => x.id === id); return r ? `<span title="${r.name}" style="color:${r.col};border-color:${r.col}66">${r.icon}</span>` : ''; }).join('')}</div>`;
}
function statusLine() { return `<div class="status in"><span>♥ ${P.hp}/${P.maxHp}</span><span>¤ ${G.coins}</span><span>LV ${G.level}</span><span>★ ${G.score.toLocaleString('en-US')}</span></div>`; }
function mapScreen() {
  G.state = 'map'; setPlayUi(false); joy = null;
  const sys = SYSTEMS[G.sys];
  let opts;
  if (G.step >= STEPS) opts = ['boss'];
  else { const pool = G.step === 0 ? ['battle', 'elite'] : ['battle', 'elite', 'shop', 'repair', 'battle']; opts = []; while (opts.length < 2) { const o = pool[Math.floor(Math.random() * pool.length)]; if (!opts.includes(o)) opts.push(o); } }
  const pips = Array.from({ length: STEPS + 1 }, (_, i) => `<i class="${i < G.step ? 'done' : i === G.step ? 'now' : ''}${i === STEPS ? ' boss' : ''}" style="--c:${sys.tint}">${i === STEPS ? '✹' : ''}</i>`).join('<b></b>');
  const systems = SYSTEMS.map((s, i) => `<i class="${i < G.sys ? 'done' : i === G.sys ? 'now' : ''}" style="--c:${s.tint}"></i>`).join('');
  show(`<div class="sysbar in">${systems}</div>
    <div class="lv in" style="color:${sys.tint}">SYSTEM ${G.sys + 1} / ${SYSTEMS.length}</div><div class="h2 in">${sys.name}</div>
    <div class="route in">${pips}</div>${statusLine()}
    <p class="tag in">${opts.length > 1 ? 'Choose your route' : 'The system core awaits'}</p>` +
    opts.map((o, i) => { const n = NODES[o]; return `<button class="card in" data-o="${i}" style="border-color:${n.col}55"><div class="ic" style="color:${n.col};box-shadow:inset 0 0 0 1.5px ${n.col}66">${n.icon}</div><div><b>${n.name}</b><p>${n.desc}</p></div></button>`; }).join('') + relicLine() +
    `<button class="btn ghost in" id="quit" style="font-size:14px;padding:10px">Abandon run</button>`);
  let picked = false;
  box.querySelectorAll('[data-o]').forEach(b => b.onclick = () => {
    if (picked) return; picked = true;
    const o = opts[+b.dataset.o]; AU.sfx('pick'); b.classList.add('chosen'); box.querySelectorAll('.card').forEach(c => { if (c !== b) c.classList.add('fade'); });
    setTimeout(() => {
      if (o === 'shop') shopScreen();
      else if (o === 'repair') { P.hp = P.maxHp; G.step++; AU.sfx('level'); mapScreen(); }
      else hide(() => startNode(o));
    }, 260);
  });
  document.getElementById('quit').onclick = () => { P.hp = 0; gameOver(); };
}
function shopScreen() {
  const avail = RELICS.filter(r => !G.relics.includes(r.id)), relic = avail[Math.floor(Math.random() * avail.length)];
  // workshop: you pick exactly which weapon to upgrade (everything you own, weapons first)
  const owned = UPGRADES.filter(u => u.id !== 'blaster' && LV[u.id] > 0 && LV[u.id] < u.max).slice(0, 3);
  const offers = [
    G.tier < TIERS.length - 1 && { k: 'tier', icon: '✦', col: '#ffe14d', name: 'Gun tier ' + (G.tier + 1) + ' → ' + (G.tier + 2), desc: TIERS[G.tier + 1].name, cost: 45 + G.tier * 15 },
    ...owned.map(u => ({ k: 'up', u, icon: u.icon, col: u.col, name: u.name, desc: `Lv ${LV[u.id]} → ${LV[u.id] + 1} · ${u.desc(LV[u.id] + 1)}`, cost: 30 + LV[u.id] * 10 })),
    relic && { k: 'relic', icon: relic.icon, col: relic.col, name: relic.name, desc: relic.desc, cost: 60 },
    { k: 'repair', icon: '✚', col: '#5cffb0', name: 'Repair kit', desc: 'Restore 2 HP', cost: 20 },
  ].filter(Boolean);
  const render = () => {
    show(`<div class="lv in" style="color:#ffc94d">TRADER</div><div class="h2 in">¤ ${G.coins} coins</div>${statusLine()}` +
      offers.map((o, i) => `<button class="card in" data-s="${i}" ${o.sold || G.coins < o.cost ? 'disabled' : ''} style="border-color:${o.col}55;${o.sold || G.coins < o.cost ? 'opacity:.4' : ''}"><div class="ic" style="color:${o.col}">${o.icon}</div><div style="flex:1"><b>${o.name}</b><p>${o.desc}</p></div><div class="price">${o.sold ? 'SOLD' : '¤ ' + o.cost}</div></button>`).join('') +
      relicLine() + `<button class="btn in" id="leave">Continue →</button>`);
    box.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
      const o = offers[+b.dataset.s]; if (o.sold || G.coins < o.cost) return;
      G.coins -= o.cost; o.sold = true; AU.sfx('pick'); buzz(20);
      if (o.k === 'tier') { G.tier++; G.power = 0; if (G.tier < TIERS.length - 1) { o.sold = false; o.cost += 15; o.name = 'Gun tier ' + (G.tier + 1) + ' → ' + (G.tier + 2); o.desc = TIERS[G.tier + 1].name; } }
      else if (o.k === 'relic') { relic.f(); G.relics.push(relic.id); }
      else if (o.k === 'up') { applyUpgrade(o.u); if (LV[o.u.id] < o.u.max) { o.sold = false; o.cost += 10; o.desc = `Lv ${LV[o.u.id]} → ${LV[o.u.id] + 1} · ${o.u.desc(LV[o.u.id] + 1)}`; } }
      else P.hp = Math.min(P.maxHp, P.hp + 2);
      render();
    });
    document.getElementById('leave').onclick = () => { G.step++; AU.sfx('ui'); mapScreen(); };
  };
  G.state = 'map'; render();
}
function relicPick(next) {
  const avail = RELICS.filter(r => !G.relics.includes(r.id)).sort(() => Math.random() - 0.5).slice(0, 2);
  if (!avail.length) { next(); return; }
  show(`<div class="lv in" style="color:#ff2e63">ELITE REWARD</div><div class="h2 in">Choose a relic</div><p class="tag in">Every relic has a price. Choose wisely.</p>` +
    avail.map((r, i) => `<button class="card in" data-r="${i}" style="border-color:${r.col}55"><div class="ic" style="color:${r.col};box-shadow:inset 0 0 0 1.5px ${r.col}66">${r.icon}</div><div><b>${r.name}</b><p>${r.desc}</p></div></button>`).join('') +
    `<button class="btn ghost in" id="skipr" style="font-size:14px;padding:10px">Take nothing</button>`);
  let picked = false;
  box.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { if (picked) return; picked = true; const r = avail[+b.dataset.r]; r.f(); G.relics.push(r.id); AU.sfx('pick'); b.classList.add('chosen'); setTimeout(next, 260); });
  document.getElementById('skipr').onclick = next;
}
function victory() {
  G.state = 'over'; G.totalT += G.t; setPlayUi(false);
  G.score += Math.round(10000 * P.coinMul);
  AU.sfx('streak'); flash(0.6, '#ffe14d');
  endScreen(true);
}

function hangarScreen() {
  const s = Save.bump(() => {}), credits = s.credits || 0, meta = s.meta || {};
  show(`<div class="lv in">HANGAR</div><div class="h2 in">¤ ${credits} credits</div><p class="tag in">Permanent upgrades for every future run. Earn credits by scoring.</p>` +
    META.map((m, i) => {
      const lv = meta[m.id] || 0, maxed = lv >= m.max, cost = metaCost(m, lv), can = !maxed && credits >= cost;
      return `<button class="card in" data-m="${i}" ${can ? '' : 'disabled'} style="border-color:${m.col}55;${can || maxed ? '' : 'opacity:.55'}"><div class="ic" style="color:${m.col}">${m.icon}</div><div style="flex:1"><b>${m.name}</b><p>${m.desc(Math.max(1, maxed ? lv : lv + 1))}</p><div class="pips">${Array.from({ length: m.max }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('')}</div></div><div class="price">${maxed ? 'MAX' : '¤ ' + cost}</div></button>`;
    }).join('') + `<button class="btn in" id="bk">Back</button>`);
  box.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    const m = META[+b.dataset.m]; const cur = (Save.get().meta || {})[m.id] || 0, cost = metaCost(m, cur);
    if (cur >= m.max || (Save.get().credits || 0) < cost) return;
    Save.bump(s => { s.credits -= cost; s.meta = s.meta || {}; s.meta[m.id] = cur + 1; });
    AU.sfx('level'); buzz(30); hangarScreen();
  });
  document.getElementById('bk').onclick = () => { AU.sfx('ui'); titleScreen(); };
}

// ---------- records (local top 10 per mode) ----------
const Board = {
  get(mode) { try { return JSON.parse(localStorage.getItem('ns_board_' + mode)) || []; } catch (e) { return []; } },
  add(mode, entry) { const b = this.get(mode); b.push(entry); b.sort((a, c) => c.score - a.score); const top = b.slice(0, 10); try { localStorage.setItem('ns_board_' + mode, JSON.stringify(top)); } catch (e) {} return top.indexOf(entry); },
};
function recordsScreen(mode, highlight = -1, back) {
  const b = Board.get(mode);
  const rows = b.length ? b.map((e, i) => `<tr class="${i === highlight ? 'me' : ''}"><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${esc(e.name)}</td><td>${esc(e.detail)}</td><td>${e.score.toLocaleString('en-US')}</td></tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:18px">No records yet — be the first!</td></tr>`;
  show(`<div class="lv in">RECORDS</div><div class="tabs in"><button class="${mode === 'endless' ? 'on' : ''}" id="te">Endless</button><button class="${mode === 'campaign' ? 'on' : ''}" id="tc">Campaign</button></div>
    <table class="board in"><thead><tr><th>#</th><th>Pilot</th><th>Run</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="small in">Saved on this device · online leaderboard coming later</p>
    <button class="btn in" id="bk">${back ? 'Continue' : 'Back'}</button>`);
  document.getElementById('te').onclick = () => recordsScreen('endless', mode === 'endless' ? highlight : -1, back);
  document.getElementById('tc').onclick = () => recordsScreen('campaign', mode === 'campaign' ? highlight : -1, back);
  document.getElementById('bk').onclick = () => { AU.sfx('ui'); (back || titleScreen)(); };
}
function saveScore(name) {
  if (G.saved) return -1; G.saved = true;
  const nm = (name || 'Pilot').trim().slice(0, 12) || 'Pilot';
  Save.bump(s => s.name = nm);
  const t = Math.floor(G.totalT + G.t);
  const detail = G.mode === 'campaign' ? (G.sys >= SYSTEMS.length ? 'All 5 ✓' : 'System ' + (G.sys + 1)) : fmt(t);
  return Board.add(G.mode, { name: nm, score: G.score, detail, date: Date.now() });
}

function applyUpgrade(u) {
  if (u.id === 'heal') { P.hp = P.maxHp; return; }
  LV[u.id]++;
  if (u.id === 'might') P.might += 0.2; if (u.id === 'haste') P.haste *= 0.88; if (u.id === 'speed') P.speed *= 1.1;
  if (u.id === 'magnet') P.magnet *= 1.35; if (u.id === 'heart') { P.maxHp++; P.hp = P.maxHp; HUD.heartHit = -1; }
  if (u.id === 'chain') WP.chainCd = 20; if (u.id === 'nova') WP.novaCd = 30;
}
function levelUpScreen() {
  G.state = 'levelup'; joy = null;
  // fair offer: always one upgrade for a weapon you already own, a new weapon early on, then anything
  const avail = UPGRADES.filter(u => u.id !== 'blaster' && LV[u.id] < u.max), WEAP = ['orbit', 'chain', 'nova'];
  const mix = a => a.sort(() => Math.random() - 0.5);
  const ownedUp = mix(avail.filter(u => LV[u.id] > 0 && WEAP.includes(u.id))), newW = mix(avail.filter(u => LV[u.id] === 0 && WEAP.includes(u.id)));
  let pick = [];
  if (ownedUp.length) pick.push(ownedUp[0]);
  if (newW.length && G.level <= 7) pick.push(newW[0]);
  for (const u of mix(avail.slice())) { if (pick.length >= 3) break; if (!pick.includes(u)) pick.push(u); }
  pick = mix(pick);
  if (!pick.length) pick.push({ id: 'heal', icon: '✚', col: '#5cffb0', name: 'Repair', max: 99, desc: () => 'Restore all HP' });
  show(`<div class="lv in">LEVEL ${G.level}</div><div class="h2 in">Choose a power</div>` +
    pick.map((u, i) => {
      const lv = (LV[u.id] || 0) + 1;
      return `<button class="card in" data-i="${i}" style="border-color:${u.col}55"><div class="ic" style="color:${u.col};box-shadow:inset 0 0 0 1.5px ${u.col}66">${u.icon}</div><div><b>${u.name}</b>${lv === 1 && u.id !== 'heal' ? '<span class="new">NEW</span>' : u.max < 99 ? `<span class="lvl">Lv ${lv - 1} → ${lv}</span>` : ''}<p>${u.desc(lv)}</p>${u.max < 99 ? `<div class="pips">${Array.from({ length: u.max }, (_, k) => `<i class="${k < lv - 1 ? 'on' : k === lv - 1 ? 'next' : ''}"></i>`).join('')}</div>` : ''}</div></button>`;
    }).join('') + `<button class="btn ghost in" id="rr" style="font-size:14px;padding:10px">↻ Reroll ${G.rerolls > 0 ? '· ' + G.rerolls + ' left' : '· watch ad'}</button>`);
  document.getElementById('rr').onclick = () => {
    AU.sfx('ui');
    if (G.rerolls > 0) { G.rerolls--; levelUpScreen(); }
    else rewardedAd(levelUpScreen, levelUpScreen);
  };
  let chosen = false;
  box.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
    if (chosen) return; chosen = true;
    const u = pick[+b.dataset.i]; AU.sfx('pick'); buzz(20);
    b.classList.add('chosen'); box.querySelectorAll('.card,.h2,.lv').forEach(c => { if (c !== b) c.classList.add('fade'); });
    applyUpgrade(u);
    setTimeout(() => hide(() => {
      G.state = 'play'; P.inv = Math.max(P.inv, 45);
      text(P.x, P.y - 34, u.name.toUpperCase(), u.col, 20); ring(P.x, P.y, 10, 120, u.col, 26, 5); burst(P.x, P.y, u.col, 26, 5, 3); flash(0.15, u.col);
    }), 260);
  });
}

function gameOver(again) {
  G.state = 'over'; setPlayUi(false); joy = null;
  if (again !== true) {
    AU.sfx('over'); shake(22); flash(0.6, '#ff2e63'); punch(0.25); G.deathT = 0;
    burst(P.x, P.y, '#3cf0ff', 60, 7, 4); shatter(P.x, P.y, '#3cf0ff', 18, 6, 8); ring(P.x, P.y, 10, 240, '#3cf0ff', 44, 7); ring(P.x, P.y, 10, 160, '#ffffff', 30, 3);
  }
  setTimeout(() => {
    const s = again === true ? Save.bump(() => {}) : Save.bump(s => { s.rounds++; s.best = Math.max(s.best, Math.floor(G.t)); s.bestKills = Math.max(s.bestKills, G.kills); });
    endScreen(false);
  }, again === true ? 0 : 1300);
}

function endScreen(won) {
  const mode = G.mode, board = Board.get(mode), t = Math.floor(G.totalT + G.t);
  const rank = board.filter(e => e.score > G.score).length;
  const top = rank < 10, best = rank === 0 && G.score > 0;
  const head = won ? `<div class="lv in">★ GALAXY CLEARED ★</div><div class="h2 in">All 5 systems saved</div>`
    : mode === 'campaign' ? `<div class="lv in" style="color:#ff2e63">RUN OVER</div><div class="h2 in">Fell in ${SYSTEMS[Math.min(G.sys, 4)].name}</div>`
    : `<div class="lv in" style="color:#ff2e63">RUN OVER</div><div class="h2 in">You survived ${fmt(t)}</div>`;
  const name = esc(Save.get().name || '');
  const earned = Math.floor(G.score / 40) + (mode === 'campaign' ? G.coins : 0), delta = Math.max(0, earned - G.banked); G.banked = Math.max(G.banked, earned);
  const bank = Save.bump(s => s.credits = (s.credits || 0) + delta).credits;
  show(`${head}
    <div class="credits in">+${delta} credits <span>· ${bank} in the hangar</span></div>
    <div class="score in"><span>SCORE</span><b id="sc">0</b>${best ? '<em>NEW #1 RECORD</em>' : top ? `<em>TOP 10 · #${rank + 1}</em>` : ''}</div>
    <div class="stats in"><div class="stat"><b>${G.kills}</b><span>Kills</span></div><div class="stat"><b>${G.level}</b><span>Level</span></div><div class="stat"><b>${G.bestCombo}</b><span>Best combo</span></div></div>
    ${!won && !G.revived ? '<button class="btn cyan in" id="rev">▶ Watch ad to revive</button>' : ''}
    ${top ? `<div class="namebox in"><input id="nm" maxlength="12" placeholder="Your pilot name" value="${name}" autocomplete="off"><button class="btn" id="sv">Save</button></div>` : ''}
    <div class="row in"><button class="btn ghost" id="again">Play again</button><button class="btn ghost" id="menu">Menu</button></div>`);
  // count-up score
  const el = document.getElementById('sc'), target = G.score, t0 = performance.now();
  const tick = now => { const k = clamp((now - t0) / 900, 0, 1), e = 1 - Math.pow(1 - k, 3); if (el) el.textContent = Math.round(target * e).toLocaleString('en-US'); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const commit = () => { if (top && !G.saved) return saveScore((document.getElementById('nm') || {}).value); return -1; };
  const rev = document.getElementById('rev');
  if (rev) rev.onclick = () => rewardedAd(() => hide(() => {
    G.revived = true; P.hp = P.maxHp; P.inv = 150; G.state = 'play'; setPlayUi(true); HUD.heartHit = -1;
    near(P.x, P.y, 420, e => { if (e.type !== 'boss') { e.dead = true; burst(e.x, e.y, e.color, 8, 5); shatter(e.x, e.y, e.color, 3, 5, 5); } });
    ring(P.x, P.y, 10, 420, '#3cf0ff', 40, 9); ring(P.x, P.y, 10, 300, '#fff', 30, 3); AU.sfx('nova'); shake(16); flash(0.6, '#3cf0ff'); punch(0.12); ebullets = [];
  }), () => { G.revived = true; endScreen(won); });
  const sv = document.getElementById('sv');
  if (sv) sv.onclick = () => { const i = commit(); AU.sfx('streak'); recordsScreen(mode, i, () => titleScreen()); };
  document.getElementById('again').onclick = () => { commit(); AU.sfx('ui'); hide(() => start(mode)); };
  document.getElementById('menu').onclick = () => { commit(); hide(titleScreen); };
}
function rewardedAd(onReward, onSkip) {
  Save.bump(s => s.adsOffered++); let left = 5;
  show(`<div class="ad in">Test ad — a real video ad plays here<b id="cd">${left}</b></div>
    <div class="row in"><button class="btn ghost" id="skip">No thanks</button><button class="btn cyan" id="claim" disabled style="opacity:.4">Claim</button></div>`);
  const claim = document.getElementById('claim');
  const t = setInterval(() => { left--; const cd = document.getElementById('cd'); if (cd) cd.textContent = left > 0 ? left : '✓'; if (left <= 0) { clearInterval(t); claim.disabled = false; claim.style.opacity = 1; } }, 1000);
  document.getElementById('skip').onclick = () => { clearInterval(t); onSkip(); };
  claim.onclick = () => { clearInterval(t); Save.bump(s => s.adsWatched++); onReward(); };
}

function togglePause() {
  if (G.state === 'play') {
    G.state = 'pause'; joy = null; setPlayUi(false);
    show(`<div class="h2 in">Paused</div><button class="btn in" id="res">RESUME</button><button class="btn ghost in" id="snd">Sound: ${AU.on ? 'ON' : 'OFF'}</button><button class="btn ghost in" id="quit">Quit run</button>`);
    document.getElementById('res').onclick = togglePause;
    document.getElementById('snd').onclick = e => { AU.on = !AU.on; Save.bump(s => s.sound = AU.on); e.target.textContent = 'Sound: ' + (AU.on ? 'ON' : 'OFF'); };
    document.getElementById('quit').onclick = () => { hide(); P.hp = 0; gameOver(); };
  } else if (G.state === 'pause') { hide(() => { G.state = 'play'; setPlayUi(true); }); }
}
hudbtn.onclick = togglePause;
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') togglePause(); });

// ---------- main loop ----------
let lastT = performance.now(), acc = 0;
function loop(now) {
  const dt = Math.min(100, now - lastT); lastT = now;
  if (G.state === 'play') {
    if (G.hitStop > 0) G.hitStop--;
    else {
      acc += dt * (G.slow > 0 ? 0.25 : 1);
      while (acc >= 1000 / 60) { acc -= 1000 / 60; update(); if (G.state !== 'play') break; }
      if (G.slow > 0 && --G.slow === 0 && G.state === 'play') levelUpScreen();
    }
  } else if (G.state === 'title') updateTitle();
  else if (G.state === 'over') G.deathT++;

  if (G.state !== 'title') {
    // camera: follow with look-ahead, zoom out as the screen fills up, punch-in on big moments
    const crowd = clamp(enemies.length / 260, 0, 1) * 0.1;
    let zt = baseZoom() - crowd + (G.cine > 0 ? 0.1 : 0) + (G.state === 'over' ? 0.35 : 0) + (G.slow > 0 ? 0.08 : 0);
    cam.punch *= 0.88;
    cam.z = lerp(cam.z, zt, G.state === 'over' ? 0.03 : 0.06) + cam.punch * 0.15;
    const boss = G.cine > 60 && enemies.find(e => e.type === 'boss');
    const fx = boss ? lerp(P.x, boss.x, 0.45) : P.x + P.vx * 14, fy = boss ? lerp(P.y, boss.y, 0.45) : P.y + P.vy * 14;
    cam.x = lerp(cam.x, fx, 0.12); cam.y = lerp(cam.y, fy, 0.12);
  }
  // dash button cooldown ring
  if (G.state === 'play' && P) {
    const p = P.dashCd > 0 ? 100 - P.dashCd / (P.dashMax * P.haste * P.dashMul) * 100 : 100;
    dashBtn.style.setProperty('--p', p + '%'); dashBtn.classList.toggle('ready', P.dashCd <= 0);
  }
  draw();
  requestAnimationFrame(loop);
}
titleScreen();
requestAnimationFrame(loop);
