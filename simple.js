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
const upCost = l => 15 + l * 12;
const evoCost = t => 60 + t * 50;
function sp() {
  const s = Save.get(), m = s.simple || {};
  return { stage: m.stage || 0, tier: m.tier || 0, up: Object.assign({ dmg: 0, hp: 0, rate: 0 }, m.up || {}), crystals: s.credits || 0 };
}
function spSave(fn) { Save.bump(x => { x.simple = x.simple || {}; x.simple.up = x.simple.up || {}; fn(x.simple, x); }); }
const allMaxed = (p = sp()) => UPS.every(u => p.up[u.id] >= upCap(p.tier));
function shipLook(tier) { const T = SHIP_TIERS[tier]; G.shipScale = T.scale; G.flameCol = T.flame; }

// ===== runs =====
let SIMPLE_NEXT = false;
const _onNewRunS = onNewRun;
onNewRun = function () {
  _onNewRunS();
  G.simple = SIMPLE_NEXT; G.paidS = false; scr.classList.remove('solid');
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
  SIMPLE_NEXT = true; startStage(k, { mods: [MODS[0]] }); SIMPLE_NEXT = false;
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
  if (G.simple) for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'frag') items.splice(i, 1);
};

// ===== results: always a reward, upgrades right there, one tap to go again =====
const simpleReward = win => Math.round(6 + G.kills * 0.22 + G.coins * 0.3 + (win ? 25 + G.stage * 6 : 0));
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
    spSave((S, x) => { x.credits = (x.credits || 0) + G.lastCr; if (win) S.stage = Math.max(S.stage || 0, G.stage + 1); });
    onRunEnd(); AU.sfx(win ? 'level' : 'pick');
  }
  resultScreen(win, false);
}
function resultScreen(win, doubled) {
  const k = G.stage, left = Math.max(0, G.stageLen - G.t);
  const sub = win ? 'The guardian is down!' : G.bossOut ? 'So close — the guardian was out!' : 'The guardian comes in ' + fmt(left);
  show(`<div class="lv in" style="color:${win ? '#5cffb0' : '#ff2e63'}">STAGE ${k + 1} ${win ? 'CLEARED' : 'FAILED'}</div>
    <p class="tag in">${sub}</p>
    <div class="gain in">+💠 <b id="sc">0</b></div>
    ${doubled ? '' : '<button class="btn cyan in" id="dbl">▶ Double it · watch ad</button>'}
    <div id="ups" class="in"></div>
    <button class="btn in play" id="go">${win ? 'NEXT STAGE ›' : '↻ TRY AGAIN'}</button>
    <button class="btn ghost in" id="menu">Menu</button>`);
  // a calm, solid backdrop: no banners, numbers or toasts from the run behind the result
  scr.classList.add('solid'); G.banner = null; texts.length = 0; if (typeof toasts !== 'undefined') toasts.length = 0;
  countUp('sc', G.lastCr * (doubled ? 2 : 1), n => n);
  upgradePanel(!win);
  const dbl = document.getElementById('dbl');
  if (dbl) dbl.onclick = () => { AU.sfx('ui'); rewardedAd(() => { Save.bump(x => x.credits = (x.credits || 0) + G.lastCr); resultScreen(win, true); }, () => resultScreen(win, true)); };
  document.getElementById('go').onclick = () => { AU.sfx('ui'); hide(() => playSimple(win ? k + 1 : k)); };
  document.getElementById('menu').onclick = () => { AU.sfx('ui'); titleScreen(); };
}

// ===== the 3 upgrades + ship evolution (shared by the title and the result screen) =====
function upgradePanel(nudge) {
  const el = document.getElementById('ups'); if (!el) return;
  const p = sp(), T = SHIP_TIERS[p.tier], cap = upCap(p.tier), next = SHIP_TIERS[p.tier + 1];
  const canAny = UPS.some(u => p.up[u.id] < cap && p.crystals >= upCost(p.up[u.id]));
  const evoReady = allMaxed(p) && next;
  el.innerHTML = `<div class="tierline"><span style="color:${T.col}">✦ ${T.name.toUpperCase()}</span> · 💠 ${p.crystals}</div>
    <div class="up3">${UPS.map(u => {
      const l = p.up[u.id], max = l >= cap, cost = upCost(l), can = !max && p.crystals >= cost, inTier = l - PER_TIER * p.tier;
      return `<button class="upb ${can ? 'can' : ''}" data-u="${u.id}" ${max ? 'disabled' : ''}><i style="color:${u.col}">${u.icon}</i><b>${u.name}</b><em>${u.val(l)}</em>
        <span class="upp">${Array.from({ length: PER_TIER }, (_, i) => `<s class="${i < inTier ? 'on' : ''}"></s>`).join('')}</span>
        <span class="cost">${max ? 'MAX' : '💠 ' + cost}</span></button>`;
    }).join('')}</div>
    ${evoReady ? `<button class="btn evo" id="evo" ${p.crystals >= evoCost(p.tier) ? '' : 'disabled'}>✦ EVOLVE → ${next.name.toUpperCase()} · 💠 ${evoCost(p.tier)}<small>${next.perk}</small></button>`
      : next ? `<p class="hint">${nudge && canAny ? 'Upgrade, then try again!' : `Max all three to evolve into <b style="color:${next.col}">${next.name}</b>`}</p>` : '<p class="hint">Fully evolved: the Titan</p>'}`;
  el.querySelectorAll('[data-u]').forEach(b => b.onclick = () => {
    const id = b.dataset.u, q = sp(), l = q.up[id], cost = upCost(l);
    if (l >= upCap(q.tier) || q.crystals < cost) { AU.sfx('ui'); b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); return; }
    spSave((S, x) => { x.credits -= cost; S.up[id] = (S.up[id] || 0) + 1; });
    AU.sfx('pick'); buzz(15); upgradePanel(nudge);
    const nb = document.querySelector(`[data-u="${id}"]`); if (nb) nb.classList.add('bought');
  });
  const ev = document.getElementById('evo');
  if (ev) ev.onclick = () => {
    const q = sp(); if (!allMaxed(q) || q.crystals < evoCost(q.tier) || !SHIP_TIERS[q.tier + 1]) return;
    spSave((S, x) => { x.credits -= evoCost(q.tier); S.tier = q.tier + 1; });
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
  show(`<div class="logo in">NEON<span>SWARM</span></div>
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
