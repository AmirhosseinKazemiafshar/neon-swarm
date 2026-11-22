'use strict';
// ---------- eras: every 4 stages a new world, a new enemy, new guardians ----------
// Era 1 Hive Outskirts (1–4) · 2 Ember Wastes (5–8, Spitters) · 3 Frost Abyss (9–12, Splitters)
// 4 Venom Garden (13–16, Bombers) · 5 Hive Heart (17–20, all of them) · then the cycle repeats, harder ("II").

const ERAS = [
  { name: 'Hive Outskirts', col: '#3cf0ff', col2: '#3c2bff', sys: 0, enemy: null },
  { name: 'Ember Wastes', col: '#ff7a2e', col2: '#ff2e63', sys: 1, enemy: 'spitter', intro: 'New enemy: SPITTER · keeps its distance and shoots' },
  { name: 'Frost Abyss', col: '#7fd4ff', col2: '#3c6bff', sys: 2, enemy: 'splitter', intro: 'New enemy: SPLITTER · bursts into a swarm when it dies' },
  { name: 'Venom Garden', col: '#5cff9a', col2: '#1f8f5a', sys: 3, enemy: 'bomber', intro: 'New enemy: BOMBER · blinks red, then explodes — get away!' },
  { name: 'Hive Heart', col: '#ff2e63', col2: '#b04dff', sys: 4, enemy: 'all', intro: 'Every enemy type at once' },
];
const STAGES_PER_ERA = 4;
const eraIdx = k => Math.floor(k / STAGES_PER_ERA);
function eraOf(k) { const i = eraIdx(k), E = ERAS[i % ERAS.length], lap = Math.floor(i / ERAS.length); return Object.assign({}, E, { i, lap, label: 'ERA ' + (i + 1) + ' · ' + E.name.toUpperCase() + (lap ? ' ' + 'I'.repeat(lap + 1) : '') }); }
// which special enemies can appear in an era (they stay once introduced)
function eraSpecials(k) { const i = eraIdx(k), lap = Math.floor(i / ERAS.length), j = i % ERAS.length; if (lap > 0 || j >= 4) return ['spitter', 'splitter', 'bomber']; return ['spitter', 'splitter', 'bomber'].slice(0, j); }

// start of a stage: world colours, and a banner when a new era begins
const _playSimpleE = playSimple;
playSimple = function (k) {
  _playSimpleE(k);
  const E = eraOf(k); G.era = E; G.sys = E.sys % GAL.length;
  nebula.forEach((n, i) => n.c = i % 2 ? E.col : E.col2);
  if (k % STAGES_PER_ERA === 0 && k > 0) {
    banner(E.label, E.col, E.intro || 'A new world', 200);
    if (E.intro) setTimeout(() => G.simple && toast(E.intro, E.col), 2600);
  } else banner('STAGE ' + (k + 1), E.col, E.name + ' · survive · beat the guardian', 130);
};
// a stronger era tint on the floor
const _drawWorldLayerE = drawWorldLayer;
drawWorldLayer = function (hw, hh, vis) {
  _drawWorldLayerE(hw, hh, vis);
  if (G.simple && G.era) { X.globalAlpha = 0.06; X.fillStyle = G.era.col; X.fillRect(cam.x - hw, cam.y - hh, hw * 2, hh * 2); X.globalAlpha = 1; }
};

// ---------- the new enemies (variants of the existing bodies, with their own behaviour and marking) ----------
const _spawnE = spawn;
spawn = function (type, x, y, portal) {
  const n = enemies.length; _spawnE(type, x, y, portal);
  const e = enemies[enemies.length - 1];
  if (!G.simple || enemies.length === n || !e || e.type === 'boss' || G.bossOut) return;
  const sp = eraSpecials(G.stage); if (!sp.length) return;
  const r = Math.random();
  if (type === 'grunt' && sp.includes('spitter') && r < 0.14) { e.spitter = true; e.baseSpd = e.spd; e.shotT = 90 + Math.random() * 90; e.hp = e.max = Math.round(e.max * 1.3); e.color = '#ff7a2e'; }
  else if (type === 'grunt' && sp.includes('bomber') && r > 0.82) { e.bomber = true; e.spd *= 1.35; e.color = '#5cff9a'; }
  else if (type === 'tank' && sp.includes('splitter') && r < 0.6) { e.splitter = true; e.color = '#7fd4ff'; }
};
const _featureUpdateE = featureUpdate;
featureUpdate = function () {
  _featureUpdateE();
  if (!G.simple || G.state !== 'play') return;
  for (const e of enemies) {
    if (e.dead || e.spawnT > 0) continue;
    if (e.spitter) {
      const d = Math.hypot(P.x - e.x, P.y - e.y);
      e.spd = d < 260 ? -e.baseSpd * 0.6 : d < 330 ? 0 : e.baseSpd; // backs off, keeps range
      if (--e.shotT <= 0 && d < 520) {
        e.shotT = 170; const a = Math.atan2(P.y - e.y, P.x - e.x);
        ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 3.1, vy: Math.sin(a) * 3.1, life: 200 }); e.sq = 1;
        if (AU.ok('spit', 200)) AU.tone(420, 0.08, 'triangle', 0.025, -200);
      }
    } else if (e.bomber) {
      const d = Math.hypot(P.x - e.x, P.y - e.y);
      if (!e.fuse && d < 75) { e.fuse = 54; e.spd = 0; if (AU.ok('fuse', 150)) AU.tone(900, 0.4, 'square', 0.03, 400); }
      if (e.fuse && --e.fuse <= 0) {
        e.bomber = false; explode(e.x, e.y, 90, '#5cff9a');
        if (P.inv <= 0 && (P.x - e.x) ** 2 + (P.y - e.y) ** 2 < 95 * 95) hurt(1, e.x, e.y);
        near(e.x, e.y, 95, o => { if (o !== e && !o.dead && o.type !== 'boss' && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 95 * 95) damage(o, 40, 0, 0); });
        damage(e, e.hp + 1, 0, 0);
      }
    }
  }
};
const _onKillE = onKill;
onKill = function (e) {
  _onKillE(e);
  if (G.simple && e.splitter && !G.bossOut) {
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; spawn('swarm', e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20); const s = enemies[enemies.length - 1]; if (s) { s.spawnT = 0; s.vx = Math.cos(a) * 6; s.vy = Math.sin(a) * 6; } }
  }
};

// ---------- guardians: a name, colour and size per secret, plus two new secrets ----------
Object.assign(SECRETS.dash, { name: 'SHIELD WARDEN' });
Object.assign(SECRETS.back, { name: 'IRON CARAPACE' });
Object.assign(SECRETS.pylon, { name: 'THE JUGGERNAUT' });
SECRETS.cores = { name: 'CORE MOTHER', col: '#c08bff', clue: 'Destroy the 4 cores orbiting it to drop its shield' };
SECRETS.light = { name: 'THE SHADE', col: '#fff3b0', clue: 'It can only be hurt while you stand inside the light' };
const GUARD_LOOK = { dash: { col: '#7fe8ff', size: 1 }, back: { col: '#ffd84d', size: 1.05 }, pylon: { col: '#ff6bd5', size: 1.18 }, cores: { col: '#c08bff', size: 1 }, light: { col: '#b9b2ff', size: 0.9 } };
let lightZone = null;
const _bossAIE = bossAI;
bossAI = function (e, dx, dy, d) {
  const r = _bossAIE(e, dx, dy, d);
  if (!G.simple || !e.ai) return r;
  if (!e.eraInit) {
    e.eraInit = true;
    const L = GUARD_LOOK[e.secret]; if (L) { e.color = L.col; e.r *= L.size; } else if (G.era) e.color = G.era.col;
    if (e.secret === 'cores') spawnCores(e);
    if (e.secret === 'light') moveLight();
  }
  if (e.secret === 'cores') coresTick(e);
  if (e.secret === 'light') lightTick(e);
  return r;
};
function spawnCores(b) {
  b.cores = [];
  for (let i = 0; i < 4; i++) {
    spawn('grunt', b.x, b.y); const c = enemies[enemies.length - 1];
    Object.assign(c, { core: true, hide: true, spawnT: 0, spd: 0, r: 15, hp: Math.round(b.max * 0.035), max: Math.round(b.max * 0.035), dmg: 1, xp: 2, color: '#c08bff', coreA: i * TAU / 4 });
    b.cores.push(c);
  }
  ring(b.x, b.y, b.r, b.r * 3, '#c08bff', 26, 4);
}
function coresTick(b) {
  if (!b.cores) return;
  const alive = b.cores.filter(c => !c.dead);
  for (const c of alive) { c.coreA += 0.018; const R = b.r + 70; c.x = b.x + Math.cos(c.coreA) * R; c.y = b.y + Math.sin(c.coreA) * R; c.vx = c.vy = 0; }
  if (!alive.length && b.exposedT <= 0 && !b.coreWait) { expose(b, 360, 60, 'CORES DOWN!'); b.coreWait = true; }
  if (b.coreWait && b.exposedT <= 0) { b.coreWait = false; spawnCores(b); } // the shield comes back with new cores
}
function moveLight() { const a = Math.random() * TAU, R = 150 + Math.random() * 120; lightZone = { x: P.x + Math.cos(a) * R, y: P.y + Math.sin(a) * R, r: 85, t: 480 }; }
function lightTick(b) {
  if (!lightZone) moveLight();
  if (--lightZone.t <= 0) moveLight();
  const inside = (P.x - lightZone.x) ** 2 + (P.y - lightZone.y) ** 2 < lightZone.r ** 2;
  if (inside) { b.exposedT = Math.max(b.exposedT, 3); if (!b.lightFound) { b.lightFound = true; const q = Save.get().simple || {}; if (!(q.found || {}).light) { spSave(S => { S.found = S.found || {}; S.found.light = true; }); toast('★ Weakness found: the light', '#fff3b0'); } } }
}
const _onNewRunE = onNewRun;
onNewRun = function () { _onNewRunE(); lightZone = null; if (G.simple) G.missionsDone = null; /* old credit missions are off in the simple path */ };

// drawing: special enemy marks, bomber fuse, guardian cores and the light zone
const _drawExtrasE = drawExtrasWorld;
drawExtrasWorld = function () {
  if (G.simple && lightZone && enemies.some(e => e.type === 'boss' && e.secret === 'light' && !e.dead)) {
    const z = lightZone, pulse = 1 + Math.sin(G.frame * 0.1) * 0.04;
    X.globalCompositeOperation = 'lighter'; glow(z.x, z.y, z.r * 1.9, '#fff3b0', 0.55); X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
    X.strokeStyle = 'rgba(255,243,176,.85)'; X.lineWidth = 3; X.beginPath(); X.arc(z.x, z.y, z.r * pulse, 0, TAU); X.stroke();
    if (z.t < 90 && (G.frame >> 3) & 1) { X.strokeStyle = 'rgba(255,243,176,.4)'; X.lineWidth = 8; X.stroke(); }
  }
  _drawExtrasE();
  if (!G.simple) return;
  for (const e of enemies) {
    if (e.dead || e.spawnT > 0) continue;
    if (e.spitter) { X.fillStyle = '#ff7a2e'; X.beginPath(); X.arc(e.x, e.y - e.r - 7, 4 + (e.shotT < 30 ? 2 : 0), 0, TAU); X.fill(); }
    else if (e.splitter) { X.strokeStyle = 'rgba(127,212,255,.8)'; X.lineWidth = 2; X.beginPath(); X.arc(e.x, e.y, e.r + 5, 0, TAU); X.stroke(); }
    else if (e.bomber) {
      X.fillStyle = e.fuse && (G.frame >> 2) & 1 ? '#ffffff' : '#ff2e63'; X.beginPath(); X.arc(e.x, e.y - e.r - 6, 4, 0, TAU); X.fill();
      if (e.fuse) { X.strokeStyle = `rgba(255,46,99,${0.4 + (1 - e.fuse / 54) * 0.5})`; X.lineWidth = 3; X.beginPath(); X.arc(e.x, e.y, 90 * (1 - e.fuse / 54 * 0.3), 0, TAU); X.stroke(); }
    } else if (e.core) {
      const b = enemies.find(o => o.type === 'boss' && !o.dead);
      if (b) { X.strokeStyle = 'rgba(192,139,255,.45)'; X.lineWidth = 3; X.beginPath(); X.moveTo(b.x, b.y); X.lineTo(e.x, e.y); X.stroke(); }
      glow(e.x, e.y, 34, '#c08bff', 0.7); X.globalAlpha = 1;
      X.fillStyle = e.flash ? '#ffffff' : '#2a1b3d'; X.strokeStyle = '#c08bff'; X.lineWidth = 3; X.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + G.frame * 0.03; X.lineTo(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r); } X.closePath(); X.fill(); X.stroke();
    }
  }
};
