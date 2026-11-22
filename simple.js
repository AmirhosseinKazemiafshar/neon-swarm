'use strict';
// ---------- simple mode: the main path for new players ----------
// Play a short stage → win or lose, you always keep crystals → buy one of 3 upgrades → one tap to try again.
// When all three upgrades are maxed for your ship, the ship EVOLVES (bigger, new colour, a free gun upgrade).
// Galaxy, Lab, items and research still exist under "More modes".

const SHIP_TIERS = [
  { name: 'Scout', col: '#3cf0ff', scale: 1, flame: '#ff7a2e', give: null, perk: '' },
  { name: 'Striker', col: '#5cffb0', scale: 1.1, flame: '#ffb02e', give: 'front', perk: 'Starts with an extra front gun' },
  { name: 'Gunship', col: '#ffd84d', scale: 1.2, flame: '#ff5a2e', give: 'diag', perk: 'Starts with diagonal guns' },
  { name: 'Destroyer', col: '#ff8a3c', scale: 1.3, flame: '#ff3a6a', give: 'rapid', perk: 'Starts with rapid fire' },
  { name: 'Titan', col: '#c08bff', scale: 1.4, flame: '#b06bff', give: 'big', perk: 'Starts with heavy rounds' },
];
const UPS = [
  { id: 'dmg', icon: '⚔', name: 'Damage', col: '#ff4d6d', val: l => `+${l * 12}%` },
  { id: 'hp', icon: '♥', name: 'Hull', col: '#5cffb0', val: l => `+${l} HP` },
  { id: 'rate', icon: '⚡', name: 'Fire rate', col: '#ffd84d', val: l => `+${l * 8}%` },
];
const PER_TIER = 3;
const upCap = t => PER_TIER * (t + 1);
// scrap (⚙) is its own currency: old galaxy crystals and mission rewards can't buy these, so every upgrade is earned here
const upCost = l => 20 + l * 15;
const evoCost = t => 100 + t * 80;
function sp() {
  const s = Save.get(), m = s.simple || {};
  return { stage: m.stage || 0, tier: m.tier || 0, up: Object.assign({ dmg: 0, hp: 0, rate: 0 }, m.up || {}), crystals: m.scrap || 0 };
}
function spSave(fn) { Save.bump(x => { x.simple = x.simple || {}; x.simple.up = x.simple.up || {}; fn(x.simple, x); }); }
const allMaxed = (p = sp()) => UPS.every(u => p.up[u.id] >= upCap(p.tier));
function shipLook(tier) { const T = SHIP_TIERS[tier]; G.shipScale = T.scale; G.flameCol = T.flame; }

// ===== runs =====
let SIMPLE_NEXT = false;
const _onNewRunS = onNewRun;
onNewRun = function () {
  _onNewRunS();
  G.simple = SIMPLE_NEXT; G.paidS = false; scr.classList.remove('solid'); pylons = []; G.pylonAt = 0;
  if (!G.simple) { G.stageLen = 0; G.shipScale = 1; G.flameCol = null; return; }
  const p = sp();
  // only the 7 base cards and the hero skills: no research, no fragments
  for (let i = UPGRADES.length - 1; i >= 0; i--) { const u = UPGRADES[i]; if (!u.skill && !BASE_CARDS.includes(u.id)) UPGRADES.splice(i, 1); }
  P.might += p.up.dmg * 0.12;
  P.maxHp += p.up.hp; P.hp = P.maxHp; G.hpCap = Math.max(8, P.maxHp);
  P.haste /= 1 + p.up.rate * 0.08;
  for (let t = 1; t <= p.tier; t++) { const u = UPGRADES.find(x => x.id === SHIP_TIERS[t].give); if (u && LV[u.id] < u.max) applyUpgrade(u); }
  shipLook(p.tier);
};
function playSimple(k) {
  // the map art has 60 stages: past that it loops the look, the difficulty keeps rising
  SIMPLE_NEXT = true; startStage(k % STAGE_TOTAL, { mods: [MODS[0]] }); SIMPLE_NEXT = false; G.stage = k;
  G.diffBase = 20 + k * 12; G.stageLen = Math.min(150, 75 + k * 8);
  const T = SHIP_TIERS[sp().tier];
  banner('STAGE ' + (k + 1), T.col, 'Survive · beat the guardian', 130);
}
// fixed difficulty per stage (no "your build is strong, so enemies are too"): upgrades really make you stronger
const _hpMulS = DIR.hpMul;
DIR.hpMul = function () { if (G.simple && G.state !== 'title') return Math.pow(1.17, G.stage) * 0.9; return _hpMulS.call(DIR); };
// once the guardian is out, the swarm thins (25%) so the fight is about the guardian, not a wall of small enemies
const _rateMulS = DIR.rateMul;
DIR.rateMul = function () { const r = _rateMulS.call(DIR); return G.simple && G.bossOut ? r * 0.25 : r; };
const _stageLabelS = stageLabel;
stageLabel = k => G.simple ? String(k + 1) : _stageLabelS(k);
const _onKillS = onKill;
onKill = function (e) {
  _onKillS(e);
  if (G.simple && e.type === 'boss') { P.inv = 9999; enemies.forEach(o => { if (o !== e && !o.dead && o.type !== 'boss') { o.dead = true; burst(o.x, o.y, o.color, 6, 4); } }); ebullets = []; } // the win can't be lost in the last second
  if (G.simple) for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'frag') items.splice(i, 1);
};

// ===== the guardian hunts you: it follows, then winds up and charges in a straight line =====
// (the old Hive Core drifted at 0.8 speed and could simply be outrun)
function bossAI(e, dx, dy, d) {
  if (!G.simple) return null;
  const k = G.stage, chase = Math.min(2.6, 1.7 + k * 0.08);
  if (!e.ai) secretInit(e);
  const A = e.ai; A.t--;
  if (e.exposedT > 0) e.exposedT--;
  if (e.stunT > 0) { e.stunT--; e.sq = 0.3 + Math.sin(G.frame * 0.5) * 0.2; return [0, 0]; }
  // secret 1: dash straight through the shield to shatter it
  if (e.secret === 'dash' && e.exposedT <= 0 && P.dashT > 0 && d < e.r + P.r + 16 && G.frame > (e.brkLock || 0)) { e.brkLock = G.frame + 30; expose(e, 240, 70, 'SHIELD BROKEN!'); return [0, 0]; }
  if (A.m === 'chase') {
    // it turns toward you (not instantly), so its back is open right after a charge
    let df = Math.atan2(dy, dx) - e.face; df = Math.atan2(Math.sin(df), Math.cos(df)); e.face += clamp(df, -0.035, 0.035);
    if (A.t <= 0 && d < 520) { A.m = 'wind'; A.t = 42; A.ang = Math.atan2(dy, dx); e.face = A.ang; AU.tone(160, 0.5, 'sawtooth', 0.05, 260); ring(e.x, e.y, e.r * 2.4, e.r, '#ff2e63', 40, 4); }
    return [dx / d * chase, dy / d * chase];
  }
  if (A.m === 'wind') { e.sq = 0.6 + Math.sin(A.t * 0.6) * 0.4; if (A.t <= 0) { A.m = 'charge'; A.t = 30; } return [0, 0]; }
  if (A.m === 'charge') {
    if (G.frame % 2 === 0) ghosts.push({ x: e.x, y: e.y, ang: A.ang, life: 12, enemy: e.color, r: e.r });
    // secret 3: a charge into a pylon stuns it
    for (let i = pylons.length - 1; i >= 0; i--) { const p = pylons[i]; if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 < (e.r + p.r) ** 2) { pylons.splice(i, 1); explode(p.x, p.y, 70, '#ff6bd5'); expose(e, 300, 120, 'CRASHED!'); if (!pylons.length) G.pylonAt = G.t + 3; return [0, 0]; } }
    if (A.t <= 0) { A.m = 'rest'; A.t = e.secret === 'back' ? 100 : 40; }
    return [Math.cos(A.ang) * (9 + k * 0.3), Math.sin(A.ang) * (9 + k * 0.3)];
  }
  if (A.t <= 0) { A.m = 'chase'; A.t = Math.max(120, 220 - k * 12); } // rest: a short window to punish it
  return [dx / d * 0.5, dy / d * 0.5];
}

// ===== guardian secrets: from stage 3 on, every guardian has a weakness you must discover =====
const SECRETS = {
  dash: { name: 'SHIELDED GUARDIAN', col: '#7fe8ff', clue: 'Its shield shatters if you DASH straight through it' },
  back: { name: 'ARMORED GUARDIAN', col: '#ffd84d', clue: 'Armored in front: after it charges past you, shoot its glowing back' },
  pylon: { name: 'UNSTOPPABLE GUARDIAN', col: '#ff6bd5', clue: 'Hide behind a pylon so its charge crashes into it' },
};
const secretFor = k => k < 2 ? null : ['dash', 'back', 'pylon'][(k - 2) % 3];
let pylons = [];
function placePylons() {
  pylons = []; const a0 = Math.random() * TAU;
  for (let i = 0; i < 4; i++) { const a = a0 + i * TAU / 4; pylons.push({ x: P.x + Math.cos(a) * 250, y: P.y + Math.sin(a) * 250, r: 24 }); }
  for (const p of pylons) ring(p.x, p.y, 4, 40, '#ff6bd5', 20, 3);
}
function secretInit(e) {
  e.ai = { t: 140, m: 'chase', ang: 0 }; e.face = Math.atan2(P.y - e.y, P.x - e.x); e.exposedT = 0;
  e.secret = secretFor(G.stage); if (!e.secret) return;
  const S = SECRETS[e.secret], q = Save.get().simple || {}, fails = (q.fails || {})[G.stage] || 0, known = (q.found || {})[e.secret];
  if (e.secret === 'pylon') placePylons();
  setTimeout(() => banner(S.name, S.col, known || fails >= 2 ? '💡 ' + S.clue : 'Bullets bounce off · find its weakness', 220), 900);
}
function expose(e, t, stun, label) {
  e.exposedT = t; e.stunT = stun; e.ai.m = 'rest'; e.ai.t = stun + 30;
  text(e.x, e.y - e.r - 18, label, '#ff4d6d', 22); ring(e.x, e.y, e.r, e.r * 3, '#ff4d6d', 26, 6); burst(e.x, e.y, '#cfefff', 30, 6, 3);
  flash(0.25, '#ff4d6d'); shake(6); punch(0.05); buzz(40); AU.sfx('big');
  const q = Save.get().simple || {};
  if (!(q.found || {})[e.secret]) { spSave(S => { S.found = S.found || {}; S.found[e.secret] = true; }); toast('★ Weakness found: ' + SECRETS[e.secret].clue.split(':')[0].replace(/ if you.*/, ''), '#ffd84d'); }
}
// bullets (and skills) only hurt a guarded guardian through its weakness
const _damageS = damage;
damage = function (e, dmg, kx = 0, ky = 0) {
  if (G.simple && e.type === 'boss' && e.secret && e.exposedT <= 0) {
    let open = false;
    if (e.secret === 'back') { const l = Math.hypot(kx, ky); open = l > 0 && (kx * Math.cos(e.face) + ky * Math.sin(e.face)) / l > 0.25; }
    if (!open) {
      if (G.frame - (e.blockFx || 0) > 6) { e.blockFx = G.frame; burst(e.x + rnd(-e.r, e.r) * 0.6, e.y + rnd(-e.r, e.r) * 0.6, '#cfefff', 3, 3, 2, 12); if (AU.ok('block', 150)) AU.tone(2300, 0.03, 'triangle', 0.018, -700); }
      if (G.frame - (e.blockTxt || -999) > 150) { e.blockTxt = G.frame; text(e.x, e.y - e.r - 14, 'BLOCKED', '#cfefff', 13); }
      return;
    }
  }
  // weak-spot hits (exposed, or the glowing back) hit 1.5× / 1.8× harder
  const weak = e.secret === 'back' && e.exposedT <= 0;
  return _damageS(e, e.exposedT > 0 ? dmg * 1.5 : weak ? dmg * 1.8 : dmg, kx, ky);
};
// pylons come back if they were all used up
const _featureUpdateS = featureUpdate;
featureUpdate = function () { _featureUpdateS(); if (G.mode === 'stage' && G.bossOut && G.nextBoss !== Infinity && enemies.some(e => e.type === 'boss')) G.nextBoss = Infinity; /* one guardian per stage, never a second one after 2 min */ if (G.simple && G.pylonAt && G.t >= G.pylonAt) { G.pylonAt = 0; if (enemies.some(e => e.type === 'boss' && !e.dead)) placePylons(); } };
// drawing: shield bubble, armored front + glowing back, wind-up aim line, pylons
const _drawExtrasS = drawExtrasWorld;
drawExtrasWorld = function () {
  _drawExtrasS();
  if (!G.simple) return;
  for (const p of pylons) {
    glow(p.x, p.y, 60, '#ff6bd5', 0.35); X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
    X.fillStyle = '#2a1b3d'; X.strokeStyle = '#ff6bd5'; X.lineWidth = 3; X.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + G.frame * 0.01; X.lineTo(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r); } X.closePath(); X.fill(); X.stroke();
  }
  for (const e of enemies) {
    if (e.type !== 'boss' || e.dead || !e.ai) continue;
    if (e.ai.m === 'wind') { X.strokeStyle = `rgba(255,46,99,${0.35 + Math.sin(G.frame * 0.5) * 0.2})`; X.lineWidth = e.r * 0.9; X.lineCap = 'round'; X.beginPath(); X.moveTo(e.x, e.y); X.lineTo(e.x + Math.cos(e.ai.ang) * 420, e.y + Math.sin(e.ai.ang) * 420); X.stroke(); }
    if (!e.secret) continue;
    if (e.exposedT > 0) { if ((G.frame >> 2) & 1) { X.strokeStyle = '#ff4d6d'; X.lineWidth = 3; X.setLineDash([8, 8]); X.beginPath(); X.arc(e.x, e.y, e.r + 10, 0, TAU); X.stroke(); X.setLineDash([]); } continue; }
    if (e.secret === 'back') {
      X.strokeStyle = '#ffd84d'; X.lineWidth = 9; X.lineCap = 'round'; X.beginPath(); X.arc(e.x, e.y, e.r + 8, e.face - 1.5, e.face + 1.5); X.stroke();
      const bx = e.x - Math.cos(e.face) * (e.r + 2), by = e.y - Math.sin(e.face) * (e.r + 2);
      glow(bx, by, 34 + Math.sin(G.frame * 0.2) * 6, '#ff4d6d', 0.8); X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
      X.fillStyle = '#ffe0e6'; X.beginPath(); X.arc(bx, by, 7, 0, TAU); X.fill();
    } else {
      X.strokeStyle = `rgba(127,232,255,${0.55 + Math.sin(G.frame * 0.1) * 0.2})`; X.lineWidth = 4; X.beginPath(); X.arc(e.x, e.y, e.r + 12, 0, TAU); X.stroke();
      X.fillStyle = 'rgba(127,232,255,.08)'; X.fill();
    }
  }
};

// ===== results: always a reward, upgrades right there, one tap to go again =====
// a loss ≈ 10–18 ⚙, a win ≈ 30–45 ⚙: one upgrade every one or two tries
const simpleReward = win => Math.round(3 + G.kills * 0.05 + G.t * 0.05 + (win ? 15 + G.stage * 4 : 0));
const _stageWinS = stageWin;
stageWin = function () {
  if (!G.simple) return _stageWinS();
  if (G.state === 'levelup' || G.state === 'chest' || G.state === 'pause') { setTimeout(stageWin, 400); return; }
  if (G.state !== 'play') return;
  G.state = 'over'; setPlayUi(false); joy = null; flash(0.4, '#ffe14d');
  simpleResult(true);
};
const _endScreenS = endScreen;
endScreen = function (won) { if (!G.simple) return _endScreenS(won); simpleResult(false); };
function simpleResult(win) {
  if (!G.paidS) {
    G.paidS = true; G.lastCr = simpleReward(win); G.won = win;
    spSave(S => { S.scrap = (S.scrap || 0) + G.lastCr; if (win) S.stage = Math.max(S.stage || 0, G.stage + 1); else if (G.bossOut) { S.fails = S.fails || {}; S.fails[G.stage] = (S.fails[G.stage] || 0) + 1; } });
    onRunEnd(); AU.sfx(win ? 'level' : 'pick');
  }
  resultScreen(win, false);
}
function secretHint(win) {
  const sec = secretFor(G.stage); if (win || !sec || !G.bossOut) return '';
  const q = Save.get().simple || {}, fails = (q.fails || {})[G.stage] || 0, known = (q.found || {})[sec];
  if (known || fails >= 2) return `<p class="clue in">💡 ${SECRETS[sec].clue}</p>`;
  return `<p class="clue in">🔒 This guardian has a weakness. Watch it closely…</p>`;
}
function resultScreen(win, doubled) {
  const k = G.stage, left = Math.max(0, G.stageLen - G.t);
  const sub = win ? 'The guardian is down!' : G.bossOut ? 'So close — the guardian was out!' : 'The guardian comes in ' + fmt(left);
  show(`<div class="lv in" style="color:${win ? '#5cffb0' : '#ff2e63'}">STAGE ${k + 1} ${win ? 'CLEARED' : 'FAILED'}</div>
    <p class="tag in">${sub}</p>
    <div class="gain in">+⚙ <b id="sc">0</b></div>
    ${doubled ? '' : '<button class="btn cyan in" id="dbl">▶ Double it · watch ad</button>'}
    ${secretHint(win)}
    <div id="ups" class="in"></div>
    <button class="btn in play" id="go">${win ? 'NEXT STAGE ›' : '↻ TRY AGAIN'}</button>
    <button class="btn ghost in" id="menu">Menu</button>`);
  // a calm, solid backdrop: no banners, numbers or toasts from the run behind the result
  scr.classList.add('solid'); G.banner = null; texts.length = 0; if (typeof toasts !== 'undefined') toasts.length = 0;
  countUp('sc', G.lastCr * (doubled ? 2 : 1), n => n);
  upgradePanel(!win);
  const dbl = document.getElementById('dbl');
  if (dbl) dbl.onclick = () => { AU.sfx('ui'); rewardedAd(() => { spSave(S => S.scrap = (S.scrap || 0) + G.lastCr); resultScreen(win, true); }, () => resultScreen(win, true)); };
  document.getElementById('go').onclick = () => { AU.sfx('ui'); hide(() => playSimple(win ? k + 1 : k)); };
  document.getElementById('menu').onclick = () => { AU.sfx('ui'); titleScreen(); };
}

// ===== the 3 upgrades + ship evolution (shared by the title and the result screen) =====
function upgradePanel(nudge) {
  const el = document.getElementById('ups'); if (!el) return;
  const p = sp(), T = SHIP_TIERS[p.tier], cap = upCap(p.tier), next = SHIP_TIERS[p.tier + 1];
  const canAny = UPS.some(u => p.up[u.id] < cap && p.crystals >= upCost(p.up[u.id]));
  const evoReady = allMaxed(p) && next;
  el.innerHTML = `<div class="tierline"><span style="color:${T.col}">✦ ${T.name.toUpperCase()}</span> · ⚙ ${p.crystals} scrap</div>
    <div class="up3">${UPS.map(u => {
      const l = p.up[u.id], max = l >= cap, cost = upCost(l), can = !max && p.crystals >= cost, inTier = l - PER_TIER * p.tier;
      return `<button class="upb ${can ? 'can' : ''}" data-u="${u.id}" ${max ? 'disabled' : ''}><i style="color:${u.col}">${u.icon}</i><b>${u.name}</b><em>${u.val(l)}</em>
        <span class="upp">${Array.from({ length: PER_TIER }, (_, i) => `<s class="${i < inTier ? 'on' : ''}"></s>`).join('')}</span>
        <span class="cost">${max ? 'MAX' : '⚙ ' + cost}</span></button>`;
    }).join('')}</div>
    ${evoReady ? `<button class="btn evo" id="evo" ${p.crystals >= evoCost(p.tier) ? '' : 'disabled'}>✦ EVOLVE → ${next.name.toUpperCase()} · ⚙ ${evoCost(p.tier)}<small>${next.perk}</small></button>`
      : next ? `<p class="hint">${nudge && canAny ? 'Upgrade, then try again!' : `Max all three to evolve into <b style="color:${next.col}">${next.name}</b>`}</p>` : '<p class="hint">Fully evolved: the Titan</p>'}`;
  el.querySelectorAll('[data-u]').forEach(b => b.onclick = () => {
    const id = b.dataset.u, q = sp(), l = q.up[id], cost = upCost(l);
    if (l >= upCap(q.tier) || q.crystals < cost) { AU.sfx('ui'); b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); return; }
    spSave(S => { S.scrap -= cost; S.up[id] = (S.up[id] || 0) + 1; });
    AU.sfx('pick'); buzz(15); upgradePanel(nudge);
    const nb = document.querySelector(`[data-u="${id}"]`); if (nb) nb.classList.add('bought');
  });
  const ev = document.getElementById('evo');
  if (ev) ev.onclick = () => {
    const q = sp(); if (!allMaxed(q) || q.crystals < evoCost(q.tier) || !SHIP_TIERS[q.tier + 1]) return;
    spSave(S => { S.scrap -= evoCost(q.tier); S.tier = q.tier + 1; });
    const N = SHIP_TIERS[q.tier + 1];
    AU.sfx('level'); AU.sfx('streak'); buzz(60); shipLook(q.tier + 1);
    if (G.state === 'title') { flash(0.5, N.col); ring(P.x, P.y, 10, 300, N.col, 40, 10); burst(P.x, P.y, N.col, 50, 7, 4); banner('EVOLVED · ' + N.name.toUpperCase(), N.col, N.perk, 170); }
    upgradePanel(nudge);
    const t = document.querySelector('.tierline'); if (t) t.classList.add('evolved');
  };
}

// ===== simple title: one big PLAY =====
const classicTitle = titleScreen;
titleScreen = function () {
  G.state = 'title'; setPlayUi(false); Save.bump(() => {}); scr.classList.remove('solid');
  newRun(); P.inv = 0;
  for (let i = 0; i < 30; i++) spawn(['grunt', 'swarm', 'tank', 'dasher'][i % 4], WORLD / 2 + rnd(-600, 600), WORLD / 2 + rnd(-700, 700));
  enemies.forEach(e => { e.spawnT = 0; e.tx = e.x; e.ty = e.y; });
  const p = sp(); shipLook(p.tier);
  show(`<div class="logo in">HIVE<span>STORM</span></div>
    <div class="lv in" style="color:${SHIP_TIERS[p.tier].col}">STAGE ${p.stage + 1}</div>
    <p class="tag in">${p.stage ? 'Beat the guardian to reach the next stage' : 'Survive the swarm, beat the guardian'}</p>
    <button class="btn in play" id="play">▶ PLAY</button>
    <div id="ups" class="in"></div>
    <div class="row in"><button class="btn ghost" id="endl">Endless</button><button class="btn ghost" id="more">More modes</button></div>
    <div class="settings in" id="sets"></div>`);
  upgradePanel(false);
  document.getElementById('play').onclick = () => { AU.init(); AU.sfx('ui'); hide(() => playSimple(sp().stage)); flash(0.4, '#3cf0ff'); };
  document.getElementById('endl').onclick = () => { AU.init(); AU.sfx('ui'); hide(() => start('endless')); };
  document.getElementById('more').onclick = () => { AU.init(); AU.sfx('ui'); moreModes(); };
  const sets = document.getElementById('sets'), mk = (label, fn) => { const b = document.createElement('button'); b.className = 'mini'; b.textContent = label(); b.onclick = () => { fn(); b.textContent = label(); AU.sfx('ui'); }; sets.appendChild(b); };
  mk(() => 'Sound ' + (AU.on ? 'on' : 'off'), () => { AU.on = !AU.on; Save.bump(x => x.sound = AU.on); });
  mk(() => 'Graphics ' + ({ auto: 'auto', high: 'high', low: 'low' }[Save.get().gfx || 'auto']), () => { const o = ['auto', 'high', 'low'], c = Save.get().gfx || 'auto', n = o[(o.indexOf(c) + 1) % 3]; Save.bump(x => x.gfx = n); Q.light = n !== 'low'; Q.bloom = n === 'high'; LOWRES = n === 'low'; resize(); });
  mk(() => 'Shake ' + (SETTINGS.shake === 1 ? 'full' : SETTINGS.shake ? 'low' : 'off'), () => { SETTINGS.shake = SETTINGS.shake === 1 ? 0.5 : SETTINGS.shake ? 0 : 1; Save.bump(x => x.shake = SETTINGS.shake); });
  mk(() => 'Vibration ' + (SETTINGS.vibe === false ? 'off' : 'on'), () => { SETTINGS.vibe = SETTINGS.vibe === false; Save.bump(x => x.vibe = SETTINGS.vibe); if (SETTINGS.vibe) buzz(30); });
};
// the old title (galaxy, daily, Lab, heroes, records) with a way back
function moreModes() {
  classicTitle();
  const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = '‹ Back'; b.onclick = () => { AU.sfx('ui'); titleScreen(); };
  box.appendChild(b);
}
// the title is shown at boot by analytics.js (loaded last)
