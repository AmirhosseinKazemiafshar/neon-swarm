'use strict';
// ---------- arsenal: the gun is the heart of the game ----------
// 1) shot feel  2) a visible look for every card  3) a smaller card pool  4) four evolutions with a visible goal
if (Save.get().vibe === false) SETTINGS.vibe = false;

// ===== 3) card pool =====
// Side Guns (left/right, then rear) replaces Side Shot + Rear Shot; Death Mark is gone (nobody could see it);
// Vampiric and Level-up Shield now live in items (Titan Plate, Bulwark)
for (const id of ['rear', 'headshot', 'leech', 'shieldup']) { const i = CARDS.findIndex(c => c.id === id); if (i >= 0) CARDS.splice(i, 1); }
Object.assign(CARDS.find(c => c.id === 'side'), { name: 'Side Guns', max: 2, tip: 'Covers you when surrounded',
  desc: l => l <= 1 ? 'Adds <b>1 bullet left + 1 right</b>' : 'Also adds <b>1 bullet behind you</b>' });
gunPattern = function () {
  const pat = [], front = 1 + (LV.front || 0);
  for (let i = 0; i < front; i++) pat.push([0, (i - (front - 1) / 2) * 8]);
  for (let k = 0; k < (LV.diag || 0); k++) { const a = 0.55 + k * 0.2; pat.push([a, 0], [-a, 0]); }
  if (LV.side) pat.push([Math.PI / 2, 0], [-Math.PI / 2, 0]);
  if (LV.side >= 2) pat.push([Math.PI, 0]);
  return pat;
};
ITEMS['iron+iron'].desc = '+2 max HP · heal 1 HP every 100 kills';
ITEMS['frost+iron'].desc = 'Blocks every 3rd hit · a shield on every level-up';
// players who already played keep the cards that used to be free
(function () { const s = Save.get(); if (s.rounds > 0 && !s.armory1) Save.bump(x => { x.research = [...new Set([...(x.research || []), 'crit', 'pierce'])]; x.armory1 = true; }); else if (!s.armory1) Save.bump(x => x.armory1 = true); })();

// ===== 4) evolutions =====
const EVOS = [
  { id: 'inferno', name: 'Inferno Shells', col: '#ff6b3c', icon: '☄', need: ['burn', 'explosive'], desc: 'Every blast leaves burning ground' },
  { id: 'glacier', name: 'Glacier Lance', col: '#8fdcff', icon: '❄', need: ['freeze', 'pierce'], desc: 'Ice lances pierce everything and freeze' },
  { id: 'arc', name: 'Arc Storm', col: '#ffe14d', icon: 'ϟ', need: ['rapid', 'ricochet'], desc: 'Hits chain lightning to nearby enemies' },
  { id: 'plague', name: 'Plague Spores', col: '#5cff9a', icon: '☣', need: ['poison', 'split'], desc: 'Poisoned enemies burst and infect others' },
];
const cardMax = id => (CARDS.find(c => c.id === id) || { max: 1 }).max;
const evoTotal = ev => ev.need.reduce((s, id) => s + cardMax(id), 0);
const evoHave = ev => ev.need.reduce((s, id) => s + Math.min(LV[id] || 0, cardMax(id)), 0);
const evoOpen = ev => ev.need.every(id => UPGRADES.some(u => u.id === id)); // both cards can show up this run
const evo = id => G.evo && G.evo[id];
function checkEvos() {
  G.evo = G.evo || {};
  for (const ev of EVOS) if (!evo(ev.id) && ev.need.every(id => (LV[id] || 0) >= cardMax(id))) { G.evo[ev.id] = true; (G.evoQueue = G.evoQueue || []).push(ev); }
}
function evolveFx(ev) {
  banner('EVOLVED · ' + ev.name.toUpperCase(), ev.col, ev.desc, 170); flash(0.45, ev.col); punch(0.12); shake(10); buzz(70);
  ring(P.x, P.y, 10, 260, ev.col, 34, 10); ring(P.x, P.y, 10, 160, '#ffffff', 24, 4); burst(P.x, P.y, ev.col, 50, 7, 4);
  AU.sfx('level'); AU.sfx('streak'); G.hitStop = Math.max(G.hitStop, 6);
}
const _applyUpgradeA = applyUpgrade;
applyUpgrade = function (u) { _applyUpgradeA(u); checkEvos(); };
const _onNewRunA = onNewRun;
onNewRun = function () { _onNewRunA(); G.evo = {}; G.evoQueue = []; G.lvShieldAt = 0; G.titanN = 0; G.arcN = 0; };

// ===== 2) look: the strongest element colours the gun =====
const ELEM = {
  none: { col: '#3cf0ff', core: '#eafdff' },
  burn: { col: '#ff7a2e', core: '#fff0c4' },
  freeze: { col: '#7fd4ff', core: '#ffffff' },
  poison: { col: '#4dff8f', core: '#e6ffe9' },
  volt: { col: '#ffd84d', core: '#fffbe6' },
};
function gunElem() {
  if (evo('arc')) return 'volt';
  let best = 'none', lv = 0;
  const burn = (LV.burn || 0) + (G.hero === 'pyro' ? 1 : 0);
  for (const [k, v] of [['burn', burn], ['freeze', LV.freeze || 0], ['poison', LV.poison || 0]]) if (v > lv) { lv = v; best = k; }
  return best;
}

// ===== 1) shot feel =====
const _fireBlasterA = fireBlaster;
fireBlaster = function () {
  const n0 = bullets.length;
  _fireBlasterA();
  if (bullets.length === n0) return;
  const el = gunElem(), L = ELEM[el], big = LV.big || 0, lance = evo('glacier');
  for (let i = n0; i < bullets.length; i++) {
    const b = bullets[i];
    b.el = el; b.col = L.col; b.core = L.core;
    b.w = 2.4 + big * 0.9 + (lance ? 1 : 0);
    b.len = lance ? 30 : 11 + (LV.pierce || 0) * 6 + big * 2;
    if (lance) { b.pierce = 99; b.freeze = Math.max(b.freeze || 0, 2); b.dmg *= 1.2; }
    if (evo('inferno') && b.explosive) b.explosive += 1;
  }
  P.muzzle = 5; P.muzzleCol = L.col; P.recoil = 3.5 + big * 0.6;
  for (let k = 0; k < 2 && parts.length < PCAP - 60; k++) {
    const a = P.muzzleAng + rnd(-0.5, 0.5), s = rnd(2, 4.5);
    parts.push({ x: P.x + Math.cos(P.muzzleAng) * 22, y: P.y + Math.sin(P.muzzleAng) * 22, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 8, max: 8, size: 2, color: L.core, drag: 0.82 });
  }
};
// a different shot sound per element; heavier rounds sound lower
const _sfxA = AU.sfx;
AU.sfx = function (name) {
  if (name !== 'shoot') return _sfxA.call(this, name);
  if (!this.ok('shoot', 110)) return;
  const el = G.state === 'play' ? gunElem() : 'none', big = LV.big || 0;
  if (el === 'burn') { this.noise(0.08, 0.045, 1300); this.tone(210 - big * 20, 0.07, 'sawtooth', 0.02, -110); }
  else if (el === 'freeze') { this.tone(1500 - big * 120, 0.06, 'sine', 0.026, -700); this.tone(2400, 0.04, 'triangle', 0.011, -900); }
  else if (el === 'poison') { this.tone(300 - big * 25, 0.08, 'triangle', 0.03, 170); this.noise(0.04, 0.02, 900); }
  else if (el === 'volt') { this.noise(0.04, 0.03, 6000); this.tone(1350, 0.05, 'sawtooth', 0.018, -1000); }
  else { this.tone(760 - big * 90, 0.05, 'square', 0.02, -380); this.noise(0.025, 0.022, 5200); }
};
// crits: gold spark, a 2-frame pause and a tiny buzz (all rate-limited)
let critLast = 0;
onCrit = function (e) {
  const now = performance.now();
  burst(e.x, e.y, '#ffe14d', 5, 4, 2.5, 18);
  if (now - critLast < 160) return; critLast = now;
  ring(e.x, e.y, 4, 26, '#ffe14d', 10, 3);
  G.hitStop = Math.max(G.hitStop, 2); buzz(8);
  if (AU.ok('crit', 90)) AU.tone(1900, 0.05, 'triangle', 0.028, 500);
};
let blastBuzz = 0;
const _blastA = blast;
blast = function (x, y, R, dmg, col, skip) {
  _blastA(x, y, R, dmg, col, skip);
  const now = performance.now(); if (now - blastBuzz > 220) { blastBuzz = now; buzz(12); }
};

// ===== hits: ricochet trail + evolution effects =====
const _onBulletHitA = onBulletHit;
onBulletHit = function (b, e) {
  const before = b.bounce || 0, n0 = bullets.length;
  const keep = _onBulletHitA(b, e);
  for (let i = n0; i < bullets.length; i++) { const c = bullets[i]; if (!c.col && b.col) { c.el = b.el; c.col = b.col; c.core = b.core; c.w = b.w * 0.75; c.len = b.len * 0.7; } }
  if ((b.bounce || 0) < before) { b.ric = 14; ring(b.x, b.y, 2, 16, '#c08bff', 9, 2); }
  if (evo('inferno') && b.explosive && patches.length < 36) patches.push({ x: b.x, y: b.y, r: 30, life: 110, max: 110, d: 5 });
  if (evo('arc') && G.arcN < 3 && Math.random() < 0.28) { G.arcN++; chainZap(b.x, b.y, 2, b.dmg * 0.7); }
  if (evo('glacier') && Math.random() < 0.25 && parts.length < PCAP - 40) burst(b.x, b.y, '#dff6ff', 4, 3, 2, 16);
  return keep;
};
const _onKillA = onKill;
onKill = function (e) {
  _onKillA(e);
  if (!G.hero) return;
  if (hasItem('titan') && ++G.titanN >= 100) { G.titanN = 0; if (P.hp < P.maxHp) { P.hp++; HUD.heartHit = -1; text(P.x, P.y - 30, '+1 HP', '#ff4d6d', 16); } }
  if (evo('plague') && e.poisonT > 0) {
    let n = 0; near(e.x, e.y, 150, o => { if (o !== e && !o.dead && n < 4) { o.poisonS = Math.min(12, (o.poisonS || 0) + 3); o.poisonT = 180; n++; } });
    burst(e.x, e.y, '#5cff9a', 12, 4, 3); ring(e.x, e.y, 8, 150, '#5cff9a', 18, 3);
  }
};

// per-step: element trails, ricochet tails, queued evolutions
const _featureUpdateA = featureUpdate;
featureUpdate = function () {
  _featureUpdateA();
  G.arcN = 0;
  if (G.state === 'play' && G.evoQueue && G.evoQueue.length) evolveFx(G.evoQueue.shift());
  for (const b of bullets) if (b.ric > 0) b.ric--;
  const room = PCAP - 80;
  for (let i = 0; i < bullets.length && parts.length < room; i += 2) {
    const b = bullets[i];
    if (!b.el || (G.frame + i) % 4) continue;
    if (b.el === 'burn') parts.push({ x: b.x, y: b.y, vx: rnd(-0.4, 0.4), vy: rnd(-0.6, 0), life: 14, max: 14, size: rnd(2, 3.5), color: Math.random() < 0.5 ? '#ff8a3c' : '#ffd84d', drag: 0.94 });
    else if (b.el === 'poison') parts.push({ x: b.x, y: b.y, vx: 0, vy: -0.4, life: 18, max: 18, size: 2.6, color: '#4dff8f', drag: 1 });
    else if (b.el === 'freeze') parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 10, max: 10, size: 1.8, color: '#ffffff', drag: 1 });
  }
};

// bullets drawn as streaks: a coloured body and a bright core; batched by style so it stays cheap on phones
drawPlayerBullets = function () {
  X.lineCap = 'round';
  const old = [];
  for (const b of bullets) if (!b.col) old.push(b);
  for (const b of old) blit(SPR.bolt(), b.x, b.y, 0.9 + b.lv * 0.12, Math.atan2(b.vy, b.vx));
  for (const pass of [0, 1]) {
    let key = '';
    X.beginPath();
    for (const b of bullets) {
      if (!b.col) continue;
      const k = pass ? b.core + b.w : b.col + b.w;
      if (k !== key) { X.stroke(); X.beginPath(); key = k; X.strokeStyle = pass ? b.core : b.col; X.lineWidth = pass ? b.w : b.w * 2.3; X.globalAlpha = pass ? 1 : 0.6; }
      const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp, L = b.len * (b.ric > 0 ? 2.4 : 1) * (pass ? 0.55 : 1);
      X.moveTo(b.x - ux * L, b.y - uy * L); X.lineTo(b.x, b.y);
    }
    X.stroke();
  }
  X.globalAlpha = 1;
  // explosive rounds get a glowing head
  X.fillStyle = '#fff6d8';
  X.beginPath(); for (const b of bullets) if (b.explosive && b.col) { X.moveTo(b.x + b.w, b.y); X.arc(b.x, b.y, b.w, 0, TAU); } X.fill();
};

// ===== level-up: one upgrade of something you own + one new thing; evolution goal on the card =====
function evoLine(u) {
  if (u.skill || u.ult) return '';
  const ev = EVOS.find(v => v.need.includes(u.id) && !evo(v.id) && evoOpen(v)); if (!ev) return '';
  const left = evoTotal(ev) - evoHave(ev) - 1;
  return `<p class="evo" style="color:${ev.col}">${ev.icon} ${left <= 0 ? 'EVOLVES into ' + ev.name + '!' : ev.name + ' · ' + left + ' step' + (left > 1 ? 's' : '') + ' left'}</p>`;
}
levelUpScreen = function () {
  G.state = 'levelup'; joy = null;
  if (hasItem('bulwark') && G.lvShieldAt !== G.level) { G.lvShieldAt = G.level; G.shield = Math.min(3, G.shield + 1); }
  const mix = a => a.sort(() => Math.random() - 0.5), H = hero();
  const allowedUlt = Math.min(ultCap(), ULT_LEVELS.filter(l => G.level >= l).length);
  const skills = mix(UPGRADES.filter(u => u.skill && LV[u.id] < u.max && LV[u.id] < Math.ceil(G.level / 2) && LV[u.id] < skillCap()));
  const open = UPGRADES.filter(u => !u.skill && LV[u.id] < u.max);
  // cards one step from an evolution come first among the owned ones
  const owned = mix(open.filter(u => LV[u.id] > 0)).sort((a, b) => (evoLine(b).includes('EVOLVES') ? 1 : 0) - (evoLine(a).includes('EVOLVES') ? 1 : 0));
  const fresh = mix(open.filter(u => !LV[u.id]));
  const pick = [];
  if (G.ult < allowedUlt) pick.push({ id: 'ult', icon: H.ult.icon, col: H.col, name: H.ult.name, max: 3, ult: true, desc: () => H.ult.desc(G.ult + 1) });
  if (skills.length) pick.push(skills[0]);
  if (owned[0] && pick.length < 3) pick.push(owned[0]);
  if (fresh[0] && pick.length < 3) pick.push(fresh[0]);
  for (const c of mix([...owned.slice(1), ...fresh.slice(1)])) { if (pick.length >= 3) break; pick.push(c); }
  if (pick.length < 3 && skills[1]) pick.push(skills[1]);
  if (!pick.length) pick.push({ id: 'heal', icon: '✚', col: '#5cffb0', name: 'Repair', max: 99, desc: () => 'Restore all HP' });
  show(`<div class="lv in">LEVEL ${G.level}</div><div class="h2 in">Choose one</div>${setsBar()}` +
    pick.map((u, i) => {
      const lv = u.ult ? G.ult + 1 : (LV[u.id] || 0) + 1, cls = u.ult ? 'r-legend' : u.skill ? 'r-epic' : 'r-rare';
      const kind = u.ult ? 'ULTIMATE' : u.skill ? H.name.toUpperCase() + ' SKILL' : 'CARD';
      return `<button class="card in pvcard ${cls}" data-i="${i}">${typeof pv === 'function' ? pv(u) : u.icon}<div><small class="kind" style="color:${u.col}">${kind}</small><b>${u.name}</b>${u.max < 99 ? `<span class="lvl">${lv === 1 ? 'NEW' : 'Lv ' + (lv - 1) + ' → ' + lv}</span>` : ''}<p>${u.desc(lv)}</p>${evoLine(u)}${u.max < 99 && u.max > 1 ? `<div class="pips">${Array.from({ length: u.max }, (_, k) => `<i class="${k < lv - 1 ? 'on' : k === lv - 1 ? 'next' : ''}"></i>`).join('')}</div>` : ''}</div></button>`;
    }).join('') + `<button class="btn ghost in" id="rr" style="font-size:14px;padding:10px">↻ Reroll ${G.rerolls > 0 ? '· ' + G.rerolls + ' left' : '· watch ad'}</button>`);
  document.getElementById('rr').onclick = () => { AU.sfx('ui'); if (G.rerolls > 0) { G.rerolls--; levelUpScreen(); } else rewardedAd(levelUpScreen, levelUpScreen); };
  let chosen = false;
  box.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
    if (chosen) return; chosen = true;
    const u = pick[+b.dataset.i]; AU.sfx('pick'); buzz(20);
    b.classList.add('chosen'); box.querySelectorAll('.card,.h2,.lv').forEach(c => { if (c !== b) c.classList.add('fade'); });
    if (u.ult) G.ult++; else if (u.id === 'heal') P.hp = P.maxHp; else applyUpgrade(u);
    resume(() => {
      G.state = 'play'; setPlayUi(true); P.inv = Math.max(P.inv, 45);
      text(P.x, P.y - 34, u.name.toUpperCase(), u.col, 20); ring(P.x, P.y, 10, 120, u.col, 26, 5); burst(P.x, P.y, u.col, 26, 5, 3); flash(0.15, u.col);
    });
  });
  if (typeof pvStart === 'function') pvStart();
};

// pause screen: show evolution progress under the build
const _buildHtmlA = buildHtml;
buildHtml = function () {
  const base = _buildHtmlA(), evs = EVOS.filter(ev => evo(ev.id) || (evoOpen(ev) && evoHave(ev) > 0));
  if (!evs.length) return base;
  return base + `<div class="build in">${evs.map(ev => `<div class="evo${evo(ev.id) ? ' done' : ''}"><span style="color:${ev.col}">${ev.icon}</span><b>${ev.name}</b><em>${evo(ev.id) ? 'EVOLVED' : evoHave(ev) + '/' + evoTotal(ev)}</em><p>${ev.desc}</p></div>`).join('')}</div>`;
};
