'use strict';
// =====================================================================
// NEON SWARM v6 step 2 — the galaxy.
//   6 systems × 10 stages (≈6 min: 5 min of waves, then the boss), 3 stars each,
//   Nightmare after all 60, a daily challenge, and an economy:
//   ⭐ stars open systems and heroes · 💠 crystals buy research, blueprints, core upgrades
//   · hero mastery (from playing) raises skill and Ultimate caps.
// =====================================================================

const GAL = [
  { name: 'Kepler Drift', col: '#3cf0ff', boss: 'Hive Core' },
  { name: 'Ember Belt', col: '#ff6b3c', boss: 'Magma Core' },
  { name: 'Glass Nebula', col: '#5cffb0', boss: 'Prism Core' },
  { name: 'Void Reach', col: '#b06bff', boss: 'Void Core' },
  { name: 'Frost Array', col: '#9ff0ff', boss: 'Cryo Core' },
  { name: 'Hive Prime', col: '#ff2e63', boss: 'Hive Mother' },
];
const STAGES_PER = 10, STAGE_TOTAL = GAL.length * STAGES_PER;
const STAR_GATE = [0, 20, 45, 75, 110, 150];
const HERO_GATE = { stormcaller: 0, pyro: 15, warden: 40 };
const STAGE_LEN = 300; // seconds of waves before the boss
const MODS = [
  { id: 'none', name: 'Standard sector', desc: '', apply() {} },
  { id: 'swift', name: 'Swift swarm', desc: 'Enemies move 20% faster', apply() { P.enemyFast *= 1.2; } },
  { id: 'horde', name: 'Dense swarm', desc: '30% more enemies · +20% crystals', apply() { G.rateBonus = 1.3; G.crystalBonus = 1.2; } },
  { id: 'armored', name: 'Armored swarm', desc: 'Enemies have 25% more health · +25% crystals', apply() { G.hpBonus = 1.25; G.crystalBonus = 1.25; } },
  { id: 'elites', name: 'Elite patrols', desc: 'Elites every 45 s (more fragments)', apply() { G.eliteGap = 45; } },
  { id: 'bounty', name: 'Bounty zone', desc: 'Enemies drop twice the coins', apply() { G.bounty = true; } },
];
// 7 cards at the start (one evolution, Inferno Shells, is reachable from the first run); the rest are researched
const BASE_CARDS = ['front', 'diag', 'rapid', 'big', 'burn', 'freeze', 'explosive'];
const RESEARCH = { side: 60, crit: 60, pierce: 70, poison: 70, homing: 80, ricochet: 90, split: 110 };
const BASE_ITEMS = ['overcharger', 'titan', 'forge', 'glacier'];
const BLUEPRINT = { magnetron: 80, inferno: 90, steam: 100, cryo: 100, bulwark: 110, plasma: 120 };
const MASTERY = [0, 150, 500, 1200, 2500];

// ---------- persistent progress ----------
function prog() {
  const s = Save.get();
  return {
    stars: s.gstars || [], nstars: s.nstars || [], crystals: s.credits || 0,
    research: s.research || [], blueprints: s.blueprints || [], mastery: s.mastery || {}, daily: s.daily || {},
  };
}
const totalStars = (p = prog()) => p.stars.reduce((a, b) => a + (b || 0), 0) + p.nstars.reduce((a, b) => a + (b || 0), 0);
const sysUnlocked = (i, p = prog()) => i === 0 || (totalStars(p) >= STAR_GATE[i] && (p.stars[i * STAGES_PER - 1] || 0) > 0);
const stageUnlocked = (k, nm, p = prog()) => { const arr = nm ? p.nstars : p.stars; if (nm && !allCleared(p)) return false; return sysUnlocked(Math.floor(k / STAGES_PER), p) && (k === 0 || (arr[k - 1] || 0) > 0); };
const allCleared = (p = prog()) => (p.stars[STAGE_TOTAL - 1] || 0) > 0;
const heroUnlocked = id => totalStars() >= (HERO_GATE[id] || 0);
const masteryLv = id => { const xp = (prog().mastery[id] || 0); let l = 0; for (let i = 0; i < MASTERY.length; i++) if (xp >= MASTERY[i]) l = i; return l; };
function skillCap() { return 2 + Math.min(2, masteryLv(G.ship)); }
function ultCap() { return 1 + Math.min(2, masteryLv(G.ship)); }
const fmtC = n => '💠 ' + n;

// missions that belonged to the old route Campaign are swapped for stage goals
for (let i = MISSION_POOL.length - 1; i >= 0; i--) if (MISSION_POOL[i].k === 'system') MISSION_POOL.splice(i, 1);
MISSION_POOL.push({ k: 'perfect', label: () => 'Clear a stage with all 3 stars', tiers: [1, 1, 1] }, { k: 'clear', label: n => `Clear ${n} stage${n > 1 ? 's' : ''}`, tiers: [1, 1, 1, 1] });
{ const _rv2 = runValue; runValue = k => k === 'perfect' ? (G.perfect ? 1 : 0) : k === 'clear' ? (G.cleared ? 1 : 0) : _rv2(k); }
// card pool = base cards + researched ones; blueprints gate item recipes
const _onNewRunG = onNewRun;
onNewRun = function () {
  const s = Save.get(); if (!heroUnlocked(s.ship)) Save.bump(x => x.ship = 'stormcaller');
  _onNewRunG();
  const known = new Set([...BASE_CARDS, ...prog().research]);
  for (let i = UPGRADES.length - 1; i >= 0; i--) { const u = UPGRADES[i]; if (!u.skill && !known.has(u.id)) UPGRADES.splice(i, 1); }
  Object.assign(G, { stage: -1, nightmare: false, daily: false, bossOut: false, stageDone: false, hpLost: 0, hpBonus: 1, rateBonus: 1, crystalBonus: 1, eliteGap: 0, bounty: false, paid: false, perfect: false, cleared: false });
};
onFrag = (function (orig) {
  return function (ft) {
    if (G.heldFrag) {
      const item = ITEMS[recipeKey(G.heldFrag, ft)], known = BASE_ITEMS.includes(item.id) || prog().blueprints.includes(item.id);
      if (!known) { G.heldFrag = null; G.coins += 25; AU.sfx('pick'); toast('Unknown recipe: ' + item.name + ' · get its blueprint in the Lab', '#ff8a3c'); return; }
    }
    orig(ft);
  };
})(onFrag);

// ---------- stage runs ----------
function stageMod(k, nm) { return k % STAGES_PER === 9 ? MODS[0] : MODS[Math.floor(hash(k * 3 + (nm ? 7 : 0), 91) * MODS.length)]; }
function stageLabel(k) { return (Math.floor(k / STAGES_PER) + 1) + '-' + (k % STAGES_PER + 1); }
function startStage(k, opt = {}) {
  newRun('stage');
  const mod = opt.mods ? null : stageMod(k, opt.nightmare);
  Object.assign(G, { stage: k, nightmare: !!opt.nightmare, daily: !!opt.daily, sys: Math.floor(k / STAGES_PER), diffBase: 15 + k * 9 + (opt.nightmare ? 260 : 0) });
  (opt.mods || [mod]).forEach(m => m.apply());
  G.mods = (opt.mods || [mod]).filter(m => m.id !== 'none');
  G.nextWave = Infinity; G.nextBoss = Infinity; G.eliteGap = G.eliteGap || 80; G.nextElite = G.eliteGap;
  const S = GAL[G.sys]; nebula.forEach((n, i) => n.c = i % 2 ? S.col : '#3c2bff');
  G.state = 'play'; setPlayUi(true); AU.startMusic(); cam.z = baseZoom() * 1.25;
  banner((opt.daily ? 'DAILY · ' : opt.nightmare ? 'NIGHTMARE ' : 'STAGE ') + stageLabel(k), opt.nightmare ? '#ff2e63' : S.col, G.mods.length ? G.mods.map(m => m.name).join(' · ') : S.name, 140);
  ring(P.x, P.y, 10, 160, S.col, 34, 6); burst(P.x, P.y, S.col, 30, 6, 3);
}
const _hurtG = hurt;
hurt = function (d, x, y) { const before = P.hp; _hurtG(d, x, y); if (P.hp < before) G.hpLost += before - P.hp; };
const _featureUpdateG = featureUpdate;
featureUpdate = function () {
  _featureUpdateG();
  if (G.mode !== 'stage') return;
  if (!G.bossOut && G.t >= STAGE_LEN) {
    G.bossOut = true; G.nextBoss = G.t; // the boss code in update() fires next frame
    setTimeout(() => {
      const b = enemies.find(e => e.type === 'boss'); if (!b) return;
      const big = G.stage % STAGES_PER === 9, mul = (1 + G.stage * 0.06) * (big ? 2.2 : 1) * (G.nightmare ? 1.8 : 1);
      b.hp = b.max = Math.round(b.hp * mul); b.r *= big ? 1.25 : 1; b.color = GAL[G.sys].col;
      banner(big ? GAL[G.sys].boss.toUpperCase() : 'SECTOR GUARDIAN', GAL[G.sys].col, big ? 'System boss' : 'Destroy it to clear the stage', 140);
    }, 60);
  }
};
const _onKillG = onKill;
onKill = function (e) {
  _onKillG(e);
  if (G.mode === 'stage' && G.bounty && Math.random() < 0.16) coinBurst(e.x, e.y, 1);
  if (G.mode === 'stage' && e.type === 'boss' && !G.stageDone) { G.stageDone = true; setTimeout(stageWin, 1800); }
};
// HUD: countdown to the boss
const _drawFeatureHudG = drawFeatureHud;
drawFeatureHud = function () {
  _drawFeatureHudG();
  if (G.mode !== 'stage' || G.state === 'title') return;
  const top = 10 + G.cineH * 0.9, left = Math.max(0, STAGE_LEN - G.t);
  X.font = '800 10px system-ui'; X.textAlign = 'center'; X.textBaseline = 'middle';
  X.fillStyle = G.bossOut ? '#ff2e63' : '#8d93c4';
  X.fillText(G.bossOut ? (G.stageDone ? 'STAGE CLEAR' : 'BOSS FIGHT') : 'BOSS IN ' + Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0'), W / 2, top + 120);
  X.textAlign = 'right'; X.fillStyle = GAL[G.sys].col; X.fillText((G.nightmare ? 'NIGHTMARE ' : '') + stageLabel(G.stage), W - 12, top + 84);
};
// system-tinted floor for stages
const _drawWorldLayerG = drawWorldLayer;
drawWorldLayer = function (hw, hh, vis) {
  _drawWorldLayerG(hw, hh, vis);
  if (G.mode === 'stage') { X.globalAlpha = G.nightmare ? 0.1 : 0.045; X.fillStyle = G.nightmare ? '#ff2e63' : GAL[G.sys].col; X.fillRect(cam.x - hw, cam.y - hh, hw * 2, hh * 2); X.globalAlpha = 1; }
};

function rewardCrystals(win) {
  const base = win ? 18 + G.stage * 2 : Math.floor(G.kills / 40);
  return Math.round((base + Math.floor(G.coins / 3)) * (G.nightmare ? 1.6 : 1) * (G.crystalBonus || 1));
}
function addMastery(win) { const xp = Math.round(G.kills / 8 + (win ? 40 : 10)); Save.bump(s => { s.mastery = s.mastery || {}; s.mastery[G.ship] = (s.mastery[G.ship] || 0) + xp; }); return xp; }
function stageWin() {
  // a level-up or chest can be open when the boss dies: wait until it closes, then show the win
  if (G.state === 'levelup' || G.state === 'chest' || G.state === 'beacon' || G.state === 'pause') { setTimeout(stageWin, 400); return; }
  if (G.state !== 'play') return;
  G.state = 'over'; setPlayUi(false); joy = null;
  const k = G.stage, starsNow = 1 + (G.hpLost <= 2 ? 1 : 0) + (G.t <= STAGE_LEN + 90 ? 1 : 0);
  G.perfect = starsNow === 3; G.cleared = true;
  const p = prog(), key = G.nightmare ? 'nstars' : 'gstars', prev = (G.nightmare ? p.nstars : p.stars)[k] || 0;
  const newStars = Math.max(0, starsNow - prev), mlBefore = masteryLv(G.ship);
  let cr = rewardCrystals(true) + newStars * 10;
  if (G.daily) { const today = new Date().toDateString(); if (p.daily.date !== today) cr += 80; Save.bump(s => s.daily = { date: today, done: true, best: Math.max((s.daily && s.daily.date === today && s.daily.best) || 0, G.score) }); }
  else Save.bump(s => { const a = s[key] = s[key] || []; a[k] = Math.max(a[k] || 0, starsNow); });
  Save.bump(s => s.credits = (s.credits || 0) + cr);
  const xp = addMastery(true); onRunEnd();
  const unlocked = [];
  for (const id in HERO_GATE) if (HERO_GATE[id] > 0 && totalStars(p) < HERO_GATE[id] && heroUnlocked(id)) unlocked.push(HEROES[id].name + ' unlocked');
  for (let i = 1; i < GAL.length; i++) if (!sysUnlocked(i, p) && sysUnlocked(i)) unlocked.push(GAL[i].name + ' unlocked');
  if (masteryLv(G.ship) > mlBefore) unlocked.push(hero().name + ' mastery ' + masteryLv(G.ship));
  AU.sfx('level'); flash(0.4, '#ffe14d');
  const hasNext = k + 1 < STAGE_TOTAL && !G.daily;
  show(`<div class="lv in" style="color:#5cffb0">${G.daily ? 'DAILY CHALLENGE' : (G.nightmare ? 'NIGHTMARE ' : 'STAGE ') + stageLabel(k)} CLEARED</div>
    <div class="stars in">${[0, 1, 2].map(i => `<i class="${i < starsNow ? 'on' : ''}" style="animation-delay:${0.35 + i * 0.28}s">★</i>`).join('')}</div>
    <div class="starreq in"><span class="${'on'}">✓ Defeat the boss</span><span class="${G.hpLost <= 2 ? 'on' : ''}">${G.hpLost <= 2 ? '✓' : '✗'} Lose 2 HP or less</span><span class="${G.t <= STAGE_LEN + 90 ? 'on' : ''}">${G.t <= STAGE_LEN + 90 ? '✓' : '✗'} Boss down within 1:30</span></div>
    <div class="score in"><span>REWARD</span><b id="sc">0</b></div>
    <p class="tag in">+${xp} ${hero().name} mastery${newStars ? ' · +' + newStars + ' new ★' : ''}</p>
    ${unlocked.length ? `<div class="mres in">${unlocked.map(u => `<div><span>🔓 ${u}</span></div>`).join('')}</div>` : ''}${missionResultsHtml()}
    ${hasNext && stageUnlocked(k + 1, G.nightmare) ? `<button class="btn in" id="nx">NEXT STAGE ›</button>` : ''}
    <div class="row in"><button class="btn ghost" id="rt">Retry</button><button class="btn ghost" id="mp">Galaxy map</button></div>`);
  countUp('sc', cr, fmtC);
  const nx = document.getElementById('nx'); if (nx) nx.onclick = () => { AU.sfx('ui'); hide(() => startStage(k + 1, { nightmare: G.nightmare })); };
  document.getElementById('rt').onclick = () => { AU.sfx('ui'); hide(() => G.daily ? startDaily() : startStage(k, { nightmare: G.nightmare })); };
  document.getElementById('mp').onclick = () => { AU.sfx('ui'); galaxyScreen(G.sys); };
}
function countUp(id, target, f) {
  const el = document.getElementById(id), t0 = performance.now();
  const tick = now => { const k = clamp((now - t0) / 900, 0, 1), e = 1 - Math.pow(1 - k, 3); if (el) el.textContent = f(Math.round(target * e)); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
// losing a stage: partial reward, revive by ad once
endScreen = (function (orig) {
  return function (won) {
    if (G.mode !== 'stage') return orig(won);
    const cr = rewardCrystals(false);
    if (!G.paid) { G.paid = true; Save.bump(s => s.credits = (s.credits || 0) + cr); addMastery(false); onRunEnd(); }
    const left = Math.max(0, STAGE_LEN - G.t);
    show(`<div class="lv in" style="color:#ff2e63">${G.daily ? 'DAILY CHALLENGE' : 'STAGE ' + stageLabel(G.stage)} FAILED</div>
      <div class="h2 in">${G.bossOut ? 'So close — the boss was out!' : 'Boss in ' + fmt(left)}</div>
      <div class="score in"><span>SALVAGED</span><b>${fmtC(cr)}</b></div>${missionResultsHtml()}
      <p class="tag in">Tip: research new cards and blueprints in the Lab, or try another hero.</p>
      ${G.revived ? '' : '<button class="btn cyan in" id="rev">▶ Watch ad to revive</button>'}
      <div class="row in"><button class="btn" id="rt">Retry</button><button class="btn ghost" id="mp">Galaxy map</button></div>`);
    const rev = document.getElementById('rev');
    if (rev) rev.onclick = () => rewardedAd(() => hide(() => {
      G.revived = true; P.hp = P.maxHp; P.inv = 150; G.state = 'play'; setPlayUi(true);
      near(P.x, P.y, 420, e => { if (e.type !== 'boss') { e.dead = true; burst(e.x, e.y, e.color, 8, 5); } });
      ring(P.x, P.y, 10, 420, '#3cf0ff', 40, 9); AU.sfx('nova'); flash(0.6, '#3cf0ff'); ebullets = [];
    }), () => { G.revived = true; endScreen(won); });
    document.getElementById('rt').onclick = () => { AU.sfx('ui'); hide(() => G.daily ? startDaily() : startStage(G.stage, { nightmare: G.nightmare })); };
    document.getElementById('mp').onclick = () => { AU.sfx('ui'); galaxyScreen(G.sys); };
  };
})(endScreen);

// ---------- galaxy map ----------
let mapNightmare = false;
function galaxyScreen(sysIdx) {
  G.state = 'map'; setPlayUi(false); joy = null;
  const p = prog(), ts = totalStars(p), nm = mapNightmare && allCleared(p);
  if (sysIdx === undefined) { sysIdx = 0; for (let i = 0; i < GAL.length; i++) if (sysUnlocked(i, p)) sysIdx = i; }
  const S = GAL[sysIdx], arr = nm ? p.nstars : p.stars, open = sysUnlocked(sysIdx, p);
  const tabs = GAL.map((g, i) => `<button class="${i === sysIdx ? 'on' : ''} ${sysUnlocked(i, p) ? '' : 'lock'}" data-s="${i}" style="--c:${g.col}">${sysUnlocked(i, p) ? i + 1 : '🔒'}</button>`).join('');
  const nodes = Array.from({ length: STAGES_PER }, (_, n) => {
    const k = sysIdx * STAGES_PER + n, st = arr[k] || 0, un = stageUnlocked(k, nm, p), boss = n === STAGES_PER - 1;
    return `<button class="node ${un ? '' : 'lock'} ${boss ? 'boss' : ''} ${un && !st ? 'next' : ''}" data-k="${k}" style="--c:${S.col}" ${un ? '' : 'disabled'}>
      <b>${boss ? '✹' : n + 1}</b><em>${un ? '★'.repeat(st) + '<i>' + '★'.repeat(3 - st) + '</i>' : '🔒'}</em></button>`;
  }).join('');
  const sysStars = arr.slice(sysIdx * STAGES_PER, sysIdx * STAGES_PER + STAGES_PER).reduce((a, b) => a + (b || 0), 0);
  show(`<div class="galtop in"><span>⭐ ${ts}</span><span>${fmtC(p.crystals)}</span></div>
    <div class="systabs in">${tabs}</div>
    <div class="lv in" style="color:${nm ? '#ff2e63' : S.col}">${nm ? 'NIGHTMARE · ' : ''}SYSTEM ${sysIdx + 1}</div><div class="h2 in">${S.name}</div>
    ${open ? `<p class="tag in">${sysStars} / 30 ★ in this system · boss: ${S.boss}</p><div class="path in">${nodes}</div>`
      : `<div class="mres in" style="text-align:center"><div style="justify-content:center">🔒 Needs ⭐ ${STAR_GATE[sysIdx]} stars and the previous system's boss</div></div><p class="tag in">You have ⭐ ${ts}. Replay earlier stages for 3 stars.</p>`}
    ${allCleared(p) ? `<button class="btn ghost in" id="nmt">${nm ? 'Normal mode' : '☠ Nightmare mode'}</button>` : ''}
    <button class="btn ghost in" id="bk">Back</button>`);
  box.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { AU.sfx('ui'); galaxyScreen(+b.dataset.s); });
  box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { AU.sfx('ui'); stageSheet(+b.dataset.k, nm); });
  const t = document.getElementById('nmt'); if (t) t.onclick = () => { mapNightmare = !mapNightmare; galaxyScreen(sysIdx); };
  document.getElementById('bk').onclick = () => { AU.sfx('ui'); titleScreen(); };
}
function stageSheet(k, nm) {
  const p = prog(), st = (nm ? p.nstars : p.stars)[k] || 0, mod = stageMod(k, nm), sys = Math.floor(k / STAGES_PER), boss = k % STAGES_PER === 9;
  show(`<div class="lv in" style="color:${nm ? '#ff2e63' : GAL[sys].col}">${nm ? 'NIGHTMARE ' : ''}STAGE ${stageLabel(k)}</div>
    <div class="h2 in">${boss ? GAL[sys].boss : mod.name}</div>
    <div class="stars in small">${[0, 1, 2].map(i => `<i class="${i < st ? 'on' : ''}">★</i>`).join('')}</div>
    <div class="starreq in"><span>★ Defeat the boss</span><span>★ Lose 2 HP or less</span><span>★ Boss down within 1:30 of appearing</span></div>
    ${mod.desc ? `<p class="tag in">⚑ ${mod.desc}</p>` : ''}
    <p class="tag in">5 min of waves, then the ${boss ? 'system boss' : 'guardian'} · reward ≈ ${fmtC(Math.round((18 + k * 2) * (nm ? 1.6 : 1)))}</p>
    <p class="tag in">Hero: <b style="color:${HEROES[Save.get().ship || 'stormcaller'].col}">${HEROES[Save.get().ship || 'stormcaller'].name}</b> · mastery ${masteryLv(Save.get().ship || 'stormcaller')}</p>
    <button class="btn in" id="go">LAUNCH</button><button class="btn ghost in" id="bk">Back</button>`);
  document.getElementById('go').onclick = () => { AU.init(); AU.sfx('ui'); hide(() => startStage(k, { nightmare: nm })); flash(0.4, GAL[sys].col); };
  document.getElementById('bk').onclick = () => { AU.sfx('ui'); galaxyScreen(sys); };
}

// ---------- daily challenge ----------
function dailyDef() {
  const d = new Date(), seed = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate(), p = prog();
  const reached = Math.max(0, p.stars.findIndex(x => !x)), k = Math.max(3, Math.min(STAGE_TOTAL - 1, (reached < 0 ? STAGE_TOTAL : reached) + 2));
  const pool = MODS.slice(1), a = pool[seed % pool.length], b = pool[(seed * 7 + 3) % pool.length];
  return { k, mods: a === b ? [a] : [a, b] };
}
function startDaily() { const d = dailyDef(); startStage(d.k, { daily: true, mods: d.mods }); }

// ---------- lab: research, blueprints, core ----------
function labScreen(tab = 'cards') {
  const p = prog();
  let body = '';
  if (tab === 'cards') {
    body = CARDS.map(c => {
      const base = BASE_CARDS.includes(c.id), done = base || p.research.includes(c.id), cost = RESEARCH[c.id];
      return `<button class="card in ${done ? '' : 'r-rare'}" data-r="${c.id}" ${done || p.crystals < cost ? 'disabled' : ''} style="${done ? 'opacity:.8' : p.crystals < cost ? 'opacity:.55' : ''}"><div class="ic" style="color:${c.col}">${c.icon}</div><div style="flex:1"><b>${c.name}</b><p>${c.desc(1)}</p></div><div class="price">${done ? (base ? 'BASE' : '✓') : fmtC(cost)}</div></button>`;
    }).join('');
  } else if (tab === 'items') {
    body = Object.entries(ITEMS).map(([key, it]) => {
      const base = BASE_ITEMS.includes(it.id), done = base || p.blueprints.includes(it.id), cost = BLUEPRINT[it.id];
      const rec = key.split('+').map(f => `<i style="color:${FRAG[f].col}">◆</i>`).join('+');
      return `<button class="card in ${done ? '' : 'r-rare'}" data-b="${it.id}" ${done || p.crystals < cost ? 'disabled' : ''} style="${done ? 'opacity:.8' : p.crystals < cost ? 'opacity:.55' : ''}"><div class="ic" style="color:${it.col}">${it.icon}</div><div style="flex:1"><b>${it.name}</b> <span class="rec">${rec}</span><p>${it.desc}</p></div><div class="price">${done ? (base ? 'BASE' : '✓') : fmtC(cost)}</div></button>`;
    }).join('');
  } else {
    body = Object.keys(HEROES).map(id => { const l = masteryLv(id), xp = p.mastery[id] || 0, nx = MASTERY[l + 1];
      return `<div class="card in" style="cursor:default"><div class="ic" style="color:${HEROES[id].col}">${HEROES[id].icon}</div><div style="flex:1"><b>${HEROES[id].name}</b> <span class="lvl">Mastery ${l}</span><p>Skills up to Lv ${2 + Math.min(2, l)} · Ultimate up to rank ${1 + Math.min(2, l)}${heroUnlocked(id) ? '' : ' · 🔒 ⭐ ' + HERO_GATE[id]}</p><div class="pips">${MASTERY.slice(1).map((m, i) => `<i class="${l > i ? 'on' : ''}"></i>`).join('')}</div><p>${nx ? xp + ' / ' + nx + ' XP' : 'MAX'}</p></div></div>`; }).join('')
      + `<button class="btn ghost in" id="core">Ship core upgrades (HP, damage, speed…) ›</button>`;
  }
  show(`<div class="galtop in"><span>LAB</span><span>${fmtC(p.crystals)}</span></div>
    <div class="tabs in"><button class="${tab === 'cards' ? 'on' : ''}" id="tc">Cards</button><button class="${tab === 'items' ? 'on' : ''}" id="ti">Blueprints</button><button class="${tab === 'heroes' ? 'on' : ''}" id="th">Heroes</button></div>
    <p class="tag in">${tab === 'cards' ? 'Only researched cards can appear when you level up.' : tab === 'items' ? 'Two fragments craft an item only if you know its blueprint.' : 'Mastery grows every time you play a hero.'}</p>
    ${body}<button class="btn in" id="bk">Back</button>`);
  document.getElementById('tc').onclick = () => labScreen('cards'); document.getElementById('ti').onclick = () => labScreen('items'); document.getElementById('th').onclick = () => labScreen('heroes');
  box.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { const id = b.dataset.r, c = RESEARCH[id]; if (prog().crystals < c) return; Save.bump(s => { s.credits -= c; s.research = (s.research || []).concat(id); }); AU.sfx('level'); labScreen('cards'); });
  box.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { const id = b.dataset.b, c = BLUEPRINT[id]; if (prog().crystals < c) return; Save.bump(s => { s.credits -= c; s.blueprints = (s.blueprints || []).concat(id); }); AU.sfx('level'); labScreen('items'); });
  const core = document.getElementById('core'); if (core) core.onclick = () => { AU.sfx('ui'); hangarScreen(); };
  document.getElementById('bk').onclick = () => { AU.sfx('ui'); titleScreen(); };
}

// ---------- hero picker (stars gate heroes) ----------
renderShipSel = function () {
  const el = document.getElementById('shipsel'); if (!el) return;
  const s = Save.get(), sh = SHIPS[viewShip], id = sh.id, open = heroUnlocked(id), sel = (s.ship || 'stormcaller') === id, H = HEROES[id], ml = masteryLv(id);
  el.innerHTML = `<button class="arrow" id="shp" aria-label="Previous hero">‹</button>
    <div class="shipcard ${open ? '' : 'locked'}"><canvas id="shipcv" width="112" height="112"></canvas>
      <div><b style="color:${open ? H.col : ''}">${H.icon} ${H.name}</b><p>${H.passive}</p><small>${H.q.name} · ${H.w.name} · ULT ${H.ult.name}</small>
      ${open ? (sel ? `<em>✓ SELECTED</em><span class="mst">Mastery ${ml}</span>` : '<button class="mini" id="shsel">Select</button>') : `<button class="mini" disabled>🔒 ⭐ ${HERO_GATE[id]} stars</button>`}</div></div>
    <button class="arrow" id="shn" aria-label="Next hero">›</button>`;
  const cv = document.getElementById('shipcv'), g = cv.getContext('2d'), sp = SPR.ship(id);
  g.save(); g.translate(56, 56); g.rotate(-Math.PI / 2); g.globalAlpha = open ? 1 : 0.35; g.drawImage(sp, -sp.w * 0.8, -sp.h * 0.8, sp.w * 1.6, sp.h * 1.6); g.restore();
  document.getElementById('shp').onclick = () => { viewShip = (viewShip + SHIPS.length - 1) % SHIPS.length; G.ship = SHIPS[viewShip].id; AU.sfx('ui'); renderShipSel(); };
  document.getElementById('shn').onclick = () => { viewShip = (viewShip + 1) % SHIPS.length; G.ship = SHIPS[viewShip].id; AU.sfx('ui'); renderShipSel(); };
  const b1 = document.getElementById('shsel'); if (b1) b1.onclick = () => { Save.bump(x => x.ship = id); AU.sfx('pick'); renderShipSel(); };
};

// ---------- title ----------
function nextGoal() {
  const p = prog(), ts = totalStars(p);
  for (const id in HERO_GATE) if (!heroUnlocked(id)) return `⭐ ${HERO_GATE[id] - ts} more stars unlock <b>${HEROES[id].name}</b>`;
  for (let i = 1; i < GAL.length; i++) if (!sysUnlocked(i, p)) return ts < STAR_GATE[i] ? `⭐ ${STAR_GATE[i] - ts} more stars open <b>${GAL[i].name}</b>` : `Defeat the ${GAL[i - 1].boss} to open <b>${GAL[i].name}</b>`;
  const cheap = Object.entries(RESEARCH).filter(([id]) => !p.research.includes(id)).sort((a, b) => a[1] - b[1])[0];
  if (cheap) { const c = CARDS.find(x => x.id === cheap[0]); return p.crystals >= cheap[1] ? `You can research <b>${c.name}</b> in the Lab` : `${fmtC(cheap[1] - p.crystals)} more to research <b>${c.name}</b>`; }
  return 'Collect every star · Nightmare awaits';
}
titleScreen = function () {
  G.state = 'title'; setPlayUi(false); const s = Save.bump(() => {});
  newRun(); P.inv = 0;
  for (let i = 0; i < 30; i++) spawn(['grunt', 'swarm', 'tank', 'dasher'][i % 4], WORLD / 2 + rnd(-600, 600), WORLD / 2 + rnd(-700, 700));
  enemies.forEach(e => { e.spawnT = 0; e.tx = e.x; e.ty = e.y; });
  const p = prog(), today = new Date().toDateString(), dailyDone = p.daily.date === today;
  show(`<div class="logo in">NEON<span>SWARM</span></div>
    <div class="galtop in"><span>⭐ ${totalStars(p)}</span><span>${fmtC(p.crystals)}</span></div>
    <div class="shipsel in" id="shipsel"></div>
    <p class="goal in">${nextGoal()}</p>
    <button class="btn in mode" id="gal"><b>GALAXY</b><span>60 stages · 6 systems · ${p.stars.filter(Boolean).length}/60 cleared</span></button>
    <div class="row in"><button class="btn cyan mode" id="day"><b>DAILY</b><span>${dailyDone ? '✓ done today' : '+💠 80 bonus'}</span></button><button class="btn ghost mode" id="endl"><b>ENDLESS</b><span>score attack</span></button></div>
    <div class="row in"><button class="btn ghost" id="lab">🧪 Lab</button><button class="btn ghost" id="rec">🏆 Records</button></div>
    <div class="missions in"><div class="mh">MISSIONS <span>rewards in 💠 crystals</span></div>${activeMissions().map(m => `<div class="mrow"><span>${esc(m.label)}</span><b>+${m.reward}</b></div>`).join('')}</div>
    <div class="settings in" id="sets"></div>
    <p class="small in">Prototype · working title</p>`);
  viewShip = Math.max(0, SHIPS.findIndex(x => x.id === (s.ship || 'stormcaller'))); renderShipSel();
  document.getElementById('gal').onclick = () => { AU.init(); AU.sfx('ui'); galaxyScreen(); };
  document.getElementById('day').onclick = () => { AU.init(); AU.sfx('ui'); const d = dailyDef(); show(`<div class="lv in" style="color:#3cf0ff">DAILY CHALLENGE</div><div class="h2 in">Stage ${stageLabel(d.k)}</div><p class="tag in">${d.mods.map(m => '⚑ ' + m.desc).join('<br>')}</p><p class="tag in">${dailyDone ? 'Already cleared today — play for score.' : 'First clear today: +💠 80'}</p><button class="btn in" id="go">LAUNCH</button><button class="btn ghost in" id="bk">Back</button>`); document.getElementById('go').onclick = () => hide(startDaily); document.getElementById('bk').onclick = titleScreen; };
  document.getElementById('endl').onclick = () => { AU.init(); AU.sfx('ui'); hide(() => start('endless')); flash(0.5, '#3cf0ff'); };
  document.getElementById('lab').onclick = () => { AU.init(); AU.sfx('ui'); labScreen(); };
  document.getElementById('rec').onclick = () => { AU.init(); AU.sfx('ui'); recordsScreen('endless'); };
  // settings row (sound, graphics, shake, controls)
  const sets = document.getElementById('sets'), mk = (label, fn) => { const b = document.createElement('button'); b.className = 'mini'; b.textContent = label(); b.onclick = () => { fn(); b.textContent = label(); AU.sfx('ui'); }; sets.appendChild(b); };
  mk(() => 'Sound ' + (AU.on ? 'on' : 'off'), () => { AU.on = !AU.on; Save.bump(x => x.sound = AU.on); });
  mk(() => 'Graphics ' + ({ auto: 'auto', high: 'high', low: 'low' }[Save.get().gfx || 'auto']), () => { const o = ['auto', 'high', 'low'], c = Save.get().gfx || 'auto', n = o[(o.indexOf(c) + 1) % 3]; Save.bump(x => x.gfx = n); Q.light = n !== 'low'; Q.bloom = n === 'high'; LOWRES = n === 'low'; resize(); });
  mk(() => 'Shake ' + (SETTINGS.shake === 1 ? 'full' : SETTINGS.shake ? 'low' : 'off'), () => { SETTINGS.shake = SETTINGS.shake === 1 ? 0.5 : SETTINGS.shake ? 0 : 1; Save.bump(x => x.shake = SETTINGS.shake); });
  mk(() => 'Vibration ' + (SETTINGS.vibe === false ? 'off' : 'on'), () => { SETTINGS.vibe = SETTINGS.vibe === false; Save.bump(x => x.vibe = SETTINGS.vibe); if (SETTINGS.vibe) buzz(30); });
  mk(() => SETTINGS.control === 'stop' ? 'Stop to shoot' : 'Auto-fire', () => { SETTINGS.control = SETTINGS.control === 'stop' ? 'auto' : 'stop'; Save.bump(x => x.control = SETTINGS.control); });
};
// hangar / records "back" returns to this title automatically (they call titleScreen)

// ---------- boot ----------
titleScreen();
requestAnimationFrame(loop);
