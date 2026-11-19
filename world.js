'use strict';
// =====================================================================
// NEON SWARM v5 — the rework after the first real-phone playtest.
// Problems seen in the video (minute 9 of an Endless run):
//   · constant screen shake      → trauma-based shake + Shake setting
//   · challenge disappears       → pacing director (build / horde / calm)
//                                  + health that follows YOUR power
//   · the world feels tiny       → 9 regions, landmarks, beacons, radar
//   · upgrades feel random       → synergy sets that reward a build
// =====================================================================

const SETTINGS = { shake: 1 };
(function () { const v = Save.get().shake; if (v === 0 || v === 0.5) SETTINGS.shake = v; })();

// ---------- synergy sets ----------
const TAGS = { orbit: 'blade', might: 'blade', chain: 'arc', haste: 'arc', nova: 'blast', missile: 'blast', drone: 'tech', magnet: 'tech', heart: 'hull', speed: 'hull' };
const SETS = {
  blade: { name: 'Blade', icon: '⚔', col: '#d18bff', b3: '+10% critical chance', b6: 'Blades and crits hit 50% harder' },
  arc: { name: 'Arc', icon: 'ϟ', col: '#ffe14d', b3: 'Lightning jumps +2', b6: 'Every crit throws a spark' },
  blast: { name: 'Blast', icon: '✹', col: '#ff6b3c', b3: 'Explosions 25% bigger', b6: 'Kills can detonate' },
  tech: { name: 'Tech', icon: '⦿', col: '#5cffb0', b3: '+1 drone', b6: 'Drones fire 35% faster, wider pickup' },
  hull: { name: 'Hull', icon: '⬢', col: '#7fd1ff', b3: 'Dash releases a shock wave', b6: 'Regenerate 1 HP every 40 s' },
};
let SETB = {};
const BLASTR = () => (SETB.blast3 ? 1.25 : 1);
function setLv(tag) { let n = 0; for (const id in TAGS) if (TAGS[id] === tag) n += LV[id] || 0; return n; }
function refreshSets() {
  for (const tag in SETS) for (const th of [3, 6]) {
    const key = tag + th;
    if (!SETB[key] && setLv(tag) >= th) {
      SETB[key] = true; const S = SETS[tag];
      if (key === 'blade3') P.crit += 0.1;
      if (key === 'tech6') P.magnet *= 1.3;
      if (G.state !== 'title') { toast(S.icon + ' ' + S.name.toUpperCase() + ' ' + th + ' · ' + S[th === 3 ? 'b3' : 'b6'], S.col); AU.sfx('streak'); }
    }
  }
}
const _applyUpgrade = applyUpgrade;
applyUpgrade = function (u) { _applyUpgrade(u); if (P) refreshSets(); };
function tagChip(u) {
  const t = TAGS[u.id]; if (!t) return '';
  const S = SETS[t], n = setLv(t), next = n < 3 ? 3 : 6;
  return `<span class="tagc" style="color:${S.col};border-color:${S.col}66">${S.icon} ${S.name} ${Math.min(n + 1, 6)}/${next}</span>`;
}
function setsBar() {
  const owned = Object.keys(SETS).filter(t => setLv(t) > 0);
  if (!owned.length) return '<p class="tag in">Pick powers of the same set to unlock set bonuses at 3 and 6.</p>';
  return `<div class="sets in">${owned.map(t => { const S = SETS[t], n = setLv(t); return `<span style="color:${S.col};border-color:${S.col}${n >= 3 ? 'cc' : '44'}">${S.icon} ${S.name} <b>${n}</b>${n >= 6 ? ' ★★' : n >= 3 ? ' ★' : ''}</span>`; }).join('')}</div>`;
}
let arcCd = 0;
function arcSpark(e) {
  if (G.frame - arcCd < 6) return; arcCd = G.frame;
  const t = nearest(e.x, e.y, 170, new Set([e])); if (!t) return;
  bolts.push({ pts: [{ x: e.x, y: e.y }, { x: t.x, y: t.y }], life: 10 }); damage(t, 14, 0, 0);
}
let chainDepth = 0;
const _onKill = onKill;
onKill = function (e) {
  _onKill(e);
  if (SETB.blast6 && !e.elite && e.type !== 'boss' && chainDepth < 2 && Math.random() < 0.14) {
    chainDepth++; const R = 70 * BLASTR(); explode(e.x, e.y, R, '#ff6b3c');
    near(e.x, e.y, R, o => { if (!o.dead && o !== e) damage(o, 26, 0, 0); });
    chainDepth--;
  }
};

// ---------- pacing director ----------
// Endless runs in waves of BUILD (pressure rises) → HORDE (peak) → CALM (breathe, loot).
// Enemy health follows the wave number AND how strong your build is, so it never gets trivial.
const PHASES = [['build', 50], ['horde', 16], ['calm', 12]];
const CYCLE = PHASES.reduce((a, p) => a + p[1], 0);
const DIR = {
  wave: 1, phase: 'build', phaseK: 0, lastPhase: '',
  power() {
    if (!P || !LV) return 1;
    const w = (LV.orbit || 0) + (LV.chain || 0) + (LV.nova || 0) + (LV.missile || 0) + (LV.drone || 0);
    return 1 + G.tier * 0.45 + w * 0.22 + Object.keys(EVO).length * 2.5 + (P.might - 1) * 1.6 + (1 / P.haste - 1) * 1.6;
  },
  adapt() { const expected = 1 + D() / 55; return Math.pow(clamp(this.power() / expected, 0.75, 2.6), 0.85); },
  hpMul() { if (!G.mode || G.state === 'title') return 1; return (G.mode === 'endless' ? Math.pow(1.13, this.wave - 1) : 1) * this.adapt(); },
  rateMul() {
    let m = 1;
    if (G.mode === 'endless') m = this.phase === 'horde' ? Math.min(2.1, 1.25 + 0.12 * this.wave) : this.phase === 'calm' ? 0.12 : 0.7 + 0.5 * this.phaseK;
    if (BEACON.active) m *= 1.4;
    return m;
  },
  capMul() { return G.mode !== 'endless' ? 1 : this.phase === 'horde' ? 1.35 : this.phase === 'calm' ? 0.5 : 1; },
  update() {
    if (G.mode !== 'endless') return;
    const t = G.t % CYCLE; this.wave = Math.floor(G.t / CYCLE) + 1;
    let acc = 0;
    for (const [name, len] of PHASES) { if (t < acc + len) { this.phase = name; this.phaseK = (t - acc) / len; break; } acc += len; }
    const key = this.wave + this.phase;
    if (key !== this.lastPhase) { this.lastPhase = key; this.enter(this.phase); }
    // the old fixed timers are driven from here in Endless
    if (G.nextWave > G.t + 1 && G.nextWave !== Infinity) G.nextWave = Infinity;
    if (G.nextBoss > G.t + 1 && G.nextBoss !== Infinity) G.nextBoss = Infinity;
  },
  enter(ph) {
    if (ph === 'build' && this.wave > 1) toast('WAVE ' + this.wave + ' · enemies grow stronger', '#8d93c4');
    if (ph === 'horde') {
      const boss = this.wave % 3 === 0;
      banner(boss ? 'HORDE + BOSS' : 'HORDE · WAVE ' + this.wave, '#ff2e63', boss ? 'The Hive Core is coming' : 'Hold your ground', 120);
      G.nextWave = G.t; if (boss) G.nextBoss = G.t; else if (this.wave >= 2) spawnElite();
      AU.sfx('warn'); flash(0.15, '#ff2e63');
    }
    if (ph === 'calm') {
      banner('CALM', '#5cffb0', 'Catch your breath · loot is coming', 110);
      if (P.hp < P.maxHp) { P.hp++; HUD.heartHit = -1; }
      const a = Math.random() * TAU; items.push({ x: clamp(P.x + Math.cos(a) * 160, 40, WORLD - 40), y: clamp(P.y + Math.sin(a) * 160, 40, WORLD - 40), kind: this.wave % 2 === 0 ? 'chest' : 'heart', v: 1, t: 0 });
      AU.tone(523, 0.3, 'sine', 0.05); AU.tone(659, 0.4, 'sine', 0.04, 0, 0.12);
    }
  },
};

// ---------- the big world: 9 regions, landmarks, beacons ----------
const REG = 3000;
const REGIONS = [
  { name: 'Void Rim', col: '#8a2be2' }, { name: 'Crystal Fields', col: '#b06bff' }, { name: 'Ember Vents', col: '#ff6b3c' },
  { name: 'Scrap Yards', col: '#ffc94d' }, { name: 'Core Plaza', col: '#3c9bff' }, { name: 'Bio Gardens', col: '#5cffb0' },
  { name: 'Frost Array', col: '#bff9ff' }, { name: 'Neon Docks', col: '#3cf0ff' }, { name: 'Hive Outskirts', col: '#ff2e63' },
];
const regionAt = (x, y) => REGIONS[clamp(Math.floor(y / REG), 0, 2) * 3 + clamp(Math.floor(x / REG), 0, 2)];
let landmarks = [], BEACONS = [], dust = [], lastRegion = null;
const BEACON = { active: null };

const LM = {}; // cached landmark art
function lmArt(kind, col) {
  const key = kind + col; if (LM[key]) return LM[key];
  const S = kind === 'ring' ? 420 : kind === 'wreck' ? 380 : 260, c = document.createElement('canvas'); c.width = c.height = S * 2;
  const g = c.getContext('2d'); g.scale(2, 2); g.translate(S / 2, S / 2); g.lineJoin = 'round'; g.lineCap = 'round';
  const OUT = SPR.OUT;
  if (kind === 'ring') { // broken orbital ring lying on the deck
    for (let i = 0; i < 7; i++) {
      const a0 = i * 0.9, a1 = a0 + 0.6;
      g.beginPath(); g.arc(0, 0, 170, a0, a1); g.lineWidth = 34; g.strokeStyle = OUT; g.stroke();
      g.beginPath(); g.arc(0, 0, 170, a0 + 0.02, a1 - 0.02); g.lineWidth = 26; g.strokeStyle = '#1d2346'; g.stroke();
      g.beginPath(); g.arc(0, 0, 162, a0 + 0.05, a1 - 0.05); g.lineWidth = 3; g.strokeStyle = col + 'aa'; g.stroke();
    }
  } else if (kind === 'wreck') { // crashed capital ship hull
    g.rotate(-0.4);
    g.beginPath(); g.moveTo(160, 0); g.lineTo(60, -60); g.lineTo(-150, -48); g.lineTo(-170, 0); g.lineTo(-150, 50); g.lineTo(60, 62); g.closePath();
    g.lineWidth = 7; g.strokeStyle = OUT; g.stroke(); g.fillStyle = '#1a1f3d'; g.fill();
    g.fillStyle = '#232a52'; for (let i = 0; i < 6; i++) g.fillRect(-130 + i * 40, -30, 28, 60);
    g.strokeStyle = col + '88'; g.lineWidth = 3; g.beginPath(); g.moveTo(-150, 0); g.lineTo(140, 0); g.stroke();
    g.fillStyle = col; for (let i = 0; i < 5; i++) { g.globalAlpha = 0.7; g.fillRect(-120 + i * 50, -44, 8, 5); g.fillRect(-120 + i * 50, 39, 8, 5); }
    g.globalAlpha = 1; g.beginPath(); g.moveTo(40, -20); g.lineTo(90, 10); g.lineTo(30, 30); g.closePath(); g.fillStyle = OUT; g.fill(); // hull breach
  } else { // crystal spire cluster
    for (const [x, h, w, a] of [[-40, 120, 34, -0.25], [30, 90, 30, 0.28], [-6, 170, 40, 0], [60, 60, 22, 0.5], [-70, 70, 24, -0.5]]) {
      g.save(); g.translate(x, 80); g.rotate(a); g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -h + w); g.lineTo(0, -h); g.lineTo(w / 2, -h + w); g.lineTo(w / 2, 0); g.closePath();
      g.lineWidth = 6; g.strokeStyle = OUT; g.stroke(); const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0); gr.addColorStop(0, col); gr.addColorStop(1, '#1d2346'); g.fillStyle = gr; g.fill();
      g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(-w / 2 + 4, -h + w, 4, h - w - 6); g.restore();
    }
  }
  c.w = S; c.h = S; return (LM[key] = c);
}
function buildWorld() {
  landmarks = []; BEACONS = [];
  for (let r = 0; r < 9; r++) {
    const rx = (r % 3) * REG, ry = Math.floor(r / 3) * REG, col = REGIONS[r].col;
    for (let i = 0; i < 4; i++) {
      const x = rx + 300 + hash(r * 7 + i, 11) * (REG - 600), y = ry + 300 + hash(r * 5 + i, 23) * (REG - 600);
      if (Math.hypot(x - WORLD / 2, y - WORLD / 2) < 450) continue; // keep the spawn point clear
      landmarks.push({ x, y, kind: ['ring', 'wreck', 'spire', 'spire'][(i + r) % 4], col });
    }
    for (let i = 0; i < 2; i++) BEACONS.push({ x: rx + 400 + hash(r * 13 + i, 41) * (REG - 800), y: ry + 400 + hash(r * 17 + i, 53) * (REG - 800), prog: 0, ready: true, coolUntil: 0, col });
  }
  BEACONS.push({ x: WORLD / 2 + 620, y: WORLD / 2 - 380, prog: 0, ready: true, coolUntil: 0, col: '#3cf0ff' }); // one close to the start
  dust = Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random(), d: rnd(0.2, 1), s: rnd(1, 2.6), ph: Math.random() * TAU }));
}
buildWorld();

function worldNewRun() {
  SETB = {}; arcCd = 0; lastRegion = null; BEACON.active = null;
  for (const b of BEACONS) { b.prog = 0; b.ready = true; b.coolUntil = 0; }
  DIR.wave = 1; DIR.phase = 'build'; DIR.lastPhase = '1build';
  if (G.mode === 'endless') { G.nextWave = Infinity; G.nextBoss = Infinity; G.nextElite = Infinity; }
  G.regen = 0;
}
const _onNewRun = onNewRun;
onNewRun = function () { _onNewRun(); worldNewRun(); refreshSets(); };

function worldUpdate() {
  DIR.update();
  // regions: announce when you cross into a new one
  const reg = regionAt(P.x, P.y);
  if (reg !== lastRegion) { if (lastRegion && G.mode === 'endless') toast('◈ ' + reg.name.toUpperCase(), reg.col); lastRegion = reg; }
  // beacons: stand inside for 4 s to capture, then choose a reward
  BEACON.active = null;
  if (G.mode === 'endless') for (const b of BEACONS) {
    if (!b.ready) { if (G.t >= b.coolUntil) b.ready = true; continue; }
    const inside = (P.x - b.x) ** 2 + (P.y - b.y) ** 2 < 95 * 95;
    if (inside) { BEACON.active = b; b.prog = Math.min(1, b.prog + 1 / 240); if (G.frame % 12 === 0) AU.tone(400 + b.prog * 600, 0.05, 'sine', 0.03); if (b.prog >= 1) { beaconReward(b); break; } }
    else b.prog = Math.max(0, b.prog - 1 / 180);
  }
  if (SETB.hull6 && (G.regen = (G.regen || 0) + 1) >= 2400) { G.regen = 0; if (P.hp < P.maxHp) { P.hp++; HUD.heartHit = -1; text(P.x, P.y - 30, '+1 HP', '#7fd1ff', 16); } }
  { const cap = G.hpCap || 8; if (P.maxHp > cap) { P.maxHp = cap; P.hp = Math.min(P.hp, cap); } }
}

const BEACON_REWARDS = [
  { k: 'chest', icon: '▣', col: '#ffc94d', name: 'Treasure chest', desc: 'Open a chest right now' },
  { k: 'repair', icon: '✚', col: '#5cffb0', name: 'Field repair', desc: 'Restore 3 HP' },
  { k: 'power', icon: '✦', col: '#ffe14d', name: 'Overcharge', desc: '+2 gun power' },
  { k: 'relic', icon: '◆', col: '#ff2e63', name: 'Relic', desc: 'A strong relic with a price' },
  { k: 'coins', icon: '¤', col: '#ffc94d', name: 'Salvage', desc: '+60 coins' },
  { k: 'vacuum', icon: '⊕', col: '#4dd6ff', name: 'Tractor pulse', desc: 'Pull in every gem and coin' },
];
function beaconReward(b) {
  b.ready = false; b.prog = 0; b.coolUntil = G.t + 150; BEACON.active = null;
  G.state = 'beacon'; joy = null; setPlayUi(false);
  ring(b.x, b.y, 10, 260, b.col, 34, 8); flash(0.3, b.col); AU.sfx('level'); buzz(50);
  const avail = RELICS.filter(r => !G.relics.includes(r.id)), relic = avail[Math.floor(Math.random() * avail.length)];
  const opts = BEACON_REWARDS.filter(o => o.k !== 'relic' || relic).sort(() => Math.random() - 0.5).slice(0, 3);
  show(`<div class="lv in" style="color:${b.col}">BEACON CAPTURED</div><div class="h2 in">Choose your reward</div><p class="tag in">Beacons recharge after 2½ minutes. Check the radar for the next one.</p>` +
    opts.map((o, i) => `<button class="card in r-rare" data-b="${i}" style="border-color:${o.col}88"><div class="ic" style="color:${o.col}">${o.icon}</div><div><b>${o.k === 'relic' ? relic.name : o.name}</b><p>${o.k === 'relic' ? relic.desc : o.desc}</p></div></button>`).join(''));
  let picked = false;
  box.querySelectorAll('[data-b]').forEach(el => el.onclick = () => {
    if (picked) return; picked = true; const o = opts[+el.dataset.b]; AU.sfx('pick'); el.classList.add('chosen');
    setTimeout(() => hide(() => {
      G.state = 'play'; setPlayUi(true); P.inv = Math.max(P.inv, 60);
      if (o.k === 'chest') openChest();
      else if (o.k === 'repair') { P.hp = Math.min(P.maxHp, P.hp + 3); HUD.heartHit = -1; }
      else if (o.k === 'power') gainPower(2);
      else if (o.k === 'relic') { relic.f(); G.relics.push(relic.id); toast('◆ ' + relic.name, '#ff2e63'); }
      else if (o.k === 'coins') G.coins += 60;
      else { gems.forEach(g => { g.pull = true; g.age = 99; }); coinDrops.forEach(c => c.pull = true); ring(P.x, P.y, 10, 400, '#4dd6ff', 34, 6); }
    }), 240);
  });
}

// floor layer: region tint, landmarks, beacons, drifting dust (world space, under the action)
function drawWorldLayer(hw, hh, vis) {
  if (G.mode !== 'campaign') {
    for (let ry = 0; ry < 3; ry++) for (let rx = 0; rx < 3; rx++) {
      const x0 = Math.max(rx * REG, cam.x - hw), x1 = Math.min((rx + 1) * REG, cam.x + hw), y0 = Math.max(ry * REG, cam.y - hh), y1 = Math.min((ry + 1) * REG, cam.y + hh);
      if (x1 <= x0 || y1 <= y0) continue;
      X.globalAlpha = 0.06; X.fillStyle = REGIONS[ry * 3 + rx].col; X.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    X.globalAlpha = 1;
  }
  for (const l of landmarks) {
    const a = lmArt(l.kind, l.col); if (!vis(l.x, l.y, a.w)) continue;
    X.fillStyle = 'rgba(0,0,0,.35)'; X.beginPath(); X.ellipse(l.x, l.y + a.h * 0.22, a.w * 0.42, a.h * 0.12, 0, 0, TAU); X.fill();
    if (l.kind === 'spire') { X.globalCompositeOperation = 'lighter'; glow(l.x, l.y, a.w * 0.8, l.col, 0.18 + Math.sin(G.frame * 0.03 + l.x) * 0.05); X.globalCompositeOperation = 'source-over'; X.globalAlpha = 1; }
    X.drawImage(a, l.x - a.w / 2, l.y - a.h / 2, a.w, a.h);
  }
  if (G.mode === 'endless') for (const b of BEACONS) {
    if (!vis(b.x, b.y, 220)) continue;
    const on = b.ready, p = 1 + Math.sin(G.frame * 0.06) * 0.06;
    X.fillStyle = 'rgba(8,10,24,.85)'; X.beginPath(); X.arc(b.x, b.y, 95, 0, TAU); X.fill();
    X.strokeStyle = on ? b.col : '#3a3f66'; X.lineWidth = 3; X.setLineDash([14, 10]); X.lineDashOffset = -G.frame * 0.6; X.beginPath(); X.arc(b.x, b.y, 95, 0, TAU); X.stroke(); X.setLineDash([]);
    if (on) {
      X.globalCompositeOperation = 'lighter'; glow(b.x, b.y, 140 * p, b.col, 0.35); glow(b.x, b.y - 40, 60, '#ffffff', 0.25); X.globalCompositeOperation = 'source-over'; X.globalAlpha = 1;
      if (b.prog > 0) { X.strokeStyle = '#ffffff'; X.lineWidth = 8; X.beginPath(); X.arc(b.x, b.y, 95, -Math.PI / 2, -Math.PI / 2 + TAU * b.prog); X.stroke(); }
    }
    X.fillStyle = on ? b.col : '#3a3f66'; X.beginPath(); X.moveTo(b.x, b.y - 26); X.lineTo(b.x + 16, b.y); X.lineTo(b.x, b.y + 26); X.lineTo(b.x - 16, b.y); X.closePath(); X.fill();
    X.lineWidth = 3; X.strokeStyle = SPR.OUT; X.stroke();
    X.font = '800 12px system-ui'; X.textAlign = 'center'; X.textBaseline = 'middle'; X.fillStyle = on ? '#fff' : '#8d93c4';
    X.fillText(on ? (b.prog > 0 ? Math.ceil((1 - b.prog) * 4) + 's' : 'BEACON') : 'RECHARGING ' + Math.ceil(b.coolUntil - G.t) + 's', b.x, b.y + 44);
  }
  // dust motes drifting slowly with a little parallax — gives the floor air and depth
  const span = Math.max(hw, hh) * 2 + 200;
  X.fillStyle = '#c9d6ff';
  for (const m of dust) {
    const px = cam.x - span / 2 + (((m.x * span + G.frame * 0.25 * m.d - cam.x * 0.25 * m.d) % span) + span) % span;
    const py = cam.y - span / 2 + (((m.y * span + Math.sin(G.frame * 0.01 + m.ph) * 20 - cam.y * 0.25 * m.d) % span) + span) % span;
    X.globalAlpha = 0.12 + m.d * 0.18; X.fillRect(px, py, m.s, m.s);
  }
  X.globalAlpha = 1;
}

// ---------- HUD: colour grading, phase pill, radar, beacon pointer ----------
function drawWorldHud() {
  if (G.mode === 'endless' && G.state !== 'title') {
    const ph = DIR.phase;
    if (ph === 'calm') { X.globalAlpha = 0.07; X.fillStyle = '#3cf0ff'; X.fillRect(0, 0, W, H); X.globalAlpha = 1; }
    if (ph === 'horde') { const k = 0.06 + Math.sin(G.frame * 0.1) * 0.03; const vg = X.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(255,46,99,${k})`); X.fillStyle = vg; X.fillRect(0, 0, W, H); }
    // phase pill
    const top = 10 + G.cineH * 0.9, y = top + 102, w = 132, col = ph === 'horde' ? '#ff2e63' : ph === 'calm' ? '#5cffb0' : '#8d93c4';
    X.fillStyle = 'rgba(12,14,30,.75)'; X.beginPath(); X.roundRect(W / 2 - w / 2, y - 10, w, 20, 10); X.fill();
    X.fillStyle = col + '55'; X.beginPath(); X.roundRect(W / 2 - w / 2, y - 10, w * DIR.phaseK, 20, 10); X.fill();
    X.font = '800 10px system-ui'; X.textAlign = 'center'; X.textBaseline = 'middle'; X.fillStyle = col;
    X.fillText('WAVE ' + DIR.wave + ' · ' + ph.toUpperCase(), W / 2, y + 1);
  }
  if (G.mode !== 'endless' || G.state === 'title') return;
  // radar
  const R = 44, cx = W - 12 - R, cy = 10 + G.cineH * 0.9 + 84 + R, range = 1900, sc = R / range;
  X.fillStyle = 'rgba(10,12,28,.72)'; X.beginPath(); X.arc(cx, cy, R, 0, TAU); X.fill();
  X.strokeStyle = 'rgba(60,240,255,.35)'; X.lineWidth = 1.2; X.stroke(); X.beginPath(); X.arc(cx, cy, R * 0.5, 0, TAU); X.strokeStyle = 'rgba(60,240,255,.12)'; X.stroke();
  const sweep = (G.frame * 0.04) % TAU; X.strokeStyle = 'rgba(60,240,255,.25)'; X.beginPath(); X.moveTo(cx, cy); X.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R); X.stroke();
  const dot = (x, y, r, c, edge) => { let dx = (x - P.x) * sc, dy = (y - P.y) * sc; const d = Math.hypot(dx, dy); if (d > R - 3) { if (!edge) return; dx *= (R - 3) / d; dy *= (R - 3) / d; } X.fillStyle = c; X.beginPath(); X.arc(cx + dx, cy + dy, r, 0, TAU); X.fill(); };
  for (let i = 0; i < enemies.length; i += 3) { const e = enemies[i]; if (!e.elite && e.type !== 'boss') dot(e.x, e.y, 1.1, 'rgba(255,77,109,.55)'); }
  // only the two nearest ready beacons are pinned to the radar edge; the rest show when in range
  const near2 = BEACONS.filter(b => b.ready).sort((a, c) => ((a.x - P.x) ** 2 + (a.y - P.y) ** 2) - ((c.x - P.x) ** 2 + (c.y - P.y) ** 2)).slice(0, 2);
  for (const b of BEACONS) dot(b.x, b.y, 3, b.ready ? b.col : '#3a3f66', near2.includes(b));
  for (const it of items) if (it.kind === 'chest') dot(it.x, it.y, 2.6, '#ffc94d', true);
  for (const e of enemies) { if (e.elite) dot(e.x, e.y, 2.8, '#ffc94d', true); if (e.type === 'boss') dot(e.x, e.y, 4, '#ff2e63', true); }
  X.fillStyle = '#fff'; X.beginPath(); X.arc(cx, cy, 2.4, 0, TAU); X.fill();
  X.font = '700 8px system-ui'; X.textAlign = 'center'; X.fillStyle = regionAt(P.x, P.y).col; X.fillText(regionAt(P.x, P.y).name.toUpperCase(), cx, cy + R + 9);
  // pointer to the nearest ready beacon when it is off screen
  let nb = null, nd = 1e9; for (const b of BEACONS) if (b.ready) { const d = Math.hypot(b.x - P.x, b.y - P.y); if (d < nd) { nd = d; nb = b; } }
  if (nb && nd > Math.min(W, H) / (2 * cam.z)) {
    const a = Math.atan2(nb.y - P.y, nb.x - P.x), ex = clamp(W / 2 + Math.cos(a) * W, 30, W - 30), ey = clamp(H / 2 + Math.sin(a) * H, 150, H - 130);
    X.save(); X.translate(ex, ey); X.rotate(a); X.fillStyle = nb.col; X.globalAlpha = 0.85; X.beginPath(); X.moveTo(12, 0); X.lineTo(-6, -8); X.lineTo(-6, 8); X.fill(); X.restore();
    X.globalAlpha = 0.85; X.font = '800 9px system-ui'; X.fillStyle = nb.col; X.fillText(Math.round(nd / 10) + 'm', ex - Math.cos(a) * 18, ey - Math.sin(a) * 18); X.globalAlpha = 1;
  }
}

// ---------- title: shake setting ----------
const _bindTitleExtras = bindTitleExtras;
bindTitleExtras = function () {
  _bindTitleExtras();
  const b = document.createElement('button'); b.className = 'btn ghost'; b.style.cssText = 'font-size:13px;padding:9px';
  const label = v => 'Screen shake: ' + (v === 1 ? 'Full' : v === 0.5 ? 'Low' : 'Off');
  b.textContent = label(SETTINGS.shake);
  b.onclick = () => { SETTINGS.shake = SETTINGS.shake === 1 ? 0.5 : SETTINGS.shake === 0.5 ? 0 : 1; Save.bump(s => s.shake = SETTINGS.shake); b.textContent = label(SETTINGS.shake); AU.sfx('ui'); if (SETTINGS.shake) shake(20); };
  const anchor = [...document.querySelectorAll('#box .btn.ghost')].pop(); if (anchor) anchor.after(b);
};

// boot happens at the end of heroes.js
