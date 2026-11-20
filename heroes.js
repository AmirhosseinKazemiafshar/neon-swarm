'use strict';
// =====================================================================
// NEON SWARM v6 — heroes, behaviour cards, crafted items.
//   Dota 2  → heroes with a passive, 2 skills (max 4) and an Ultimate at 6/12/18
//   Archero → cards that change how every bullet behaves; optional stop-to-shoot
//   Dota 2  → fragments (components) that combine into items, 3 slots
// Loaded last; it replaces the old upgrade content and boots the game.
// =====================================================================

// ---------- control mode (Archero-style option) ----------
SETTINGS.control = Save.get().control === 'stop' ? 'stop' : 'auto';
const moving = () => Math.hypot(P.vx, P.vy) > 0.7;

// ---------- heroes ----------
SPR.SHIP_THEMES.stormcaller = ['#d8fbff', '#4fd8f0', '#1c86b0', '#1e7fa8', '#ffe14d', 0];
SPR.SHIP_THEMES.pyro = ['#fff0c4', '#ff8a3c', '#b8370c', '#8f2a08', '#ffe14d', 1];
SPR.SHIP_THEMES.warden = ['#e6dcff', '#9b7bff', '#4b2bb0', '#3d2490', '#5cffb0', 2];
const HEROES = {
  stormcaller: { name: 'Stormcaller', col: '#4fd8f0', icon: 'ϟ', passive: 'Every 4th volley throws chain lightning',
    q: { id: 'h_q', name: 'Ball Lightning', icon: '◉', desc: l => `A rolling orb shocks everything it passes · ${10 + l * 7} dmg` },
    w: { id: 'h_w', name: 'Thunder Ring', icon: '◎', desc: l => `A ring of thunder bursts around you · ${18 + l * 9} dmg` },
    ult: { name: 'Tempest', icon: '☈', desc: r => `6 s storm strikes enemies all over the screen · ${50 + r * 35} dmg` } },
  pyro: { name: 'Pyro', col: '#ff8a3c', icon: '♨', passive: 'All your shots set enemies on fire',
    q: { id: 'h_q', name: 'Flame Wave', icon: '◭', desc: l => `A cone of fire where you face · ${22 + l * 10} dmg + burn` },
    w: { id: 'h_w', name: 'Ember Trail', icon: '⁂', desc: l => `Moving leaves burning ground for ${(1.5 + l * 0.5).toFixed(1)} s` },
    ult: { name: 'Meteor Rain', icon: '☄', desc: r => `6 s of meteors on the swarm · ${70 + r * 45} dmg each` } },
  warden: { name: 'Warden', col: '#9b7bff', icon: '⬢', passive: 'Gains a shield every 10 s that blocks one hit',
    q: { id: 'h_q', name: 'Orbit Blades', icon: '✺', desc: l => `${l + 1} blades circle around you · ${10 + l * 5} dmg` },
    w: { id: 'h_w', name: 'Shock Bash', icon: '❂', desc: l => `When hit, and every ${12 - l * 1.5} s: a shock wave · ${25 + l * 14} dmg` },
    ult: { name: 'Aegis', icon: '⛨', desc: r => `${4 + r} s unbreakable, burning aura pushes the swarm away` } },
};
SHIPS.length = 0;
SHIPS.push(
  { id: 'stormcaller', name: 'Stormcaller', cost: 0, desc: 'Chain lightning and storms', stats: '5 HP · fast · Ultimate: Tempest', apply() { P.speed *= 1.06; } },
  { id: 'pyro', name: 'Pyro', cost: 0, desc: 'Burns everything it touches', stats: '5 HP · Ultimate: Meteor Rain', apply() {} },
  { id: 'warden', name: 'Warden', cost: 0, desc: 'Shields, blades and shock waves', stats: '6 HP · slower · Ultimate: Aegis', apply() { P.maxHp += 1; P.hp = P.maxHp; P.speed *= 0.93; } },
);
const hero = () => HEROES[G.ship] || HEROES.stormcaller;

// ---------- behaviour cards (Archero-style) ----------
const CARDS = [
  { id: 'front', icon: '⇈', col: '#3cf0ff', name: 'Front Shot', max: 3, desc: () => '+1 bullet straight ahead' },
  { id: 'diag', icon: '⋎', col: '#3cf0ff', name: 'Diagonal Shot', max: 2, desc: () => '+2 bullets at an angle' },
  { id: 'side', icon: '⇹', col: '#3cf0ff', name: 'Side Shot', max: 1, desc: () => 'Also fire left and right' },
  { id: 'rear', icon: '⇊', col: '#3cf0ff', name: 'Rear Shot', max: 1, desc: () => 'Also fire behind you' },
  { id: 'ricochet', icon: '↯', col: '#b06bff', name: 'Ricochet', max: 3, desc: () => 'Bullets bounce to another enemy +1' },
  { id: 'split', icon: '⑂', col: '#b06bff', name: 'Split Shot', max: 1, desc: () => 'Bullets split in two on hit' },
  { id: 'pierce', icon: '➶', col: '#b06bff', name: 'Piercing', max: 2, desc: () => 'Bullets pass through +1 enemy' },
  { id: 'homing', icon: '⟳', col: '#b06bff', name: 'Homing', max: 1, desc: () => 'Bullets curve toward enemies' },
  { id: 'explosive', icon: '✹', col: '#ff6b3c', name: 'Explosive Rounds', max: 2, desc: l => `Hits explode · ${l === 1 ? 'small' : 'bigger'} blast` },
  { id: 'big', icon: '●', col: '#ff6b3c', name: 'Heavy Rounds', max: 3, desc: () => '+25% bullet damage and size' },
  { id: 'burn', icon: '♨', col: '#ff6b3c', name: 'Fire Rounds', max: 2, desc: () => 'Shots set enemies on fire' },
  { id: 'freeze', icon: '❄', col: '#6fc3ff', name: 'Frost Rounds', max: 2, desc: () => 'Shots slow enemies by 55%' },
  { id: 'poison', icon: '☣', col: '#5cffb0', name: 'Toxic Rounds', max: 2, desc: () => 'Poison that stacks on every hit' },
  { id: 'crit', icon: '✧', col: '#ffe14d', name: 'Eagle Eye', max: 3, desc: () => '+8% critical chance' },
  { id: 'headshot', icon: '☠', col: '#ffe14d', name: 'Death Mark', max: 1, desc: () => '2% chance to destroy a normal enemy instantly' },
  { id: 'rapid', icon: '⏩', col: '#ffe14d', name: 'Rapid Fire', max: 3, desc: () => 'Shoot 18% faster' },
  { id: 'leech', icon: '♥', col: '#ff4d6d', name: 'Vampiric', max: 2, desc: l => `Heal 1 HP every ${l === 1 ? 120 : 80} kills` },
  { id: 'shieldup', icon: '⛨', col: '#7fd1ff', name: 'Level-up Shield', max: 1, desc: () => 'Every level-up grants a shield' },
];
const isCard = id => CARDS.some(c => c.id === id);
// exact "now → next" numbers and a group + tip on every card, so a pick is a decision, not a guess
const sps = n => (60 / (30 / (1 + 0.18 * n))).toFixed(1);
const CARD_INFO = {
  front: { g: 'SHOT PATTERN', d: l => `Bullets straight ahead: <b>${l} → ${l + 1}</b>`, tip: 'More bullets = more chances to trigger every effect' },
  diag: { g: 'SHOT PATTERN', d: l => `Angled bullets: <b>${(l - 1) * 2} → ${l * 2}</b>`, tip: 'Hits enemies coming from the sides' },
  side: { g: 'SHOT PATTERN', d: () => 'Adds <b>1 bullet left + 1 right</b>', tip: 'Covers you when surrounded' },
  rear: { g: 'SHOT PATTERN', d: () => 'Adds <b>1 bullet behind you</b> (75% damage)', tip: 'Protects your back while you run' },
  ricochet: { g: 'BULLET BEHAVIOUR', d: l => `Each bullet bounces to <b>${l - 1} → ${l}</b> more enemies`, tip: 'Best with Fire, Frost or Toxic rounds' },
  split: { g: 'BULLET BEHAVIOUR', d: () => 'On hit, a bullet <b>splits into 2</b> (50% damage each)', tip: 'Great against dense swarms' },
  pierce: { g: 'BULLET BEHAVIOUR', d: l => `Bullets pass through <b>${l - 1} → ${l}</b> enemies`, tip: 'Strong when enemies line up' },
  homing: { g: 'BULLET BEHAVIOUR', d: () => 'Bullets <b>curve toward</b> the nearest enemy', tip: 'Fewer misses with angled and rear shots' },
  explosive: { g: 'BULLET BEHAVIOUR', d: l => `Every hit explodes · blast <b>${l === 1 ? 0 : 46} → ${30 + 16 * l} px</b>`, tip: 'Pairs with Split and Ricochet' },
  big: { g: 'POWER', d: l => `Bullet damage <b>${Math.round(14 * (1 + 0.25 * (l - 1)))} → ${Math.round(14 * (1 + 0.25 * l))}</b>`, tip: 'Simple and always useful' },
  burn: { g: 'ELEMENT', d: l => `Burn <b>${(3 + 2 * l) * 4} dmg/s</b> for <b>${((90 + 30 * l) / 60).toFixed(1)} s</b>`, tip: 'Burn keeps working after the bullet is gone' },
  freeze: { g: 'ELEMENT', d: l => `Slows enemies <b>55%</b> for <b>${((45 + 30 * l) / 60).toFixed(1)} s</b>`, tip: 'Slow enemies can\'t reach you' },
  poison: { g: 'ELEMENT', d: l => `+${l} poison stack per hit · <b>8 dmg/s per stack</b>`, tip: 'Stacks up fast with many bullets' },
  crit: { g: 'POWER', d: () => `Critical chance <b>${Math.round(P.crit * 100)}% → ${Math.round(P.crit * 100) + 8}%</b> (crits deal 2×)`, tip: 'Better the more bullets you fire' },
  headshot: { g: 'POWER', d: () => '<b>2%</b> chance to destroy a normal enemy instantly', tip: 'Elites and bosses are immune' },
  rapid: { g: 'POWER', d: l => `Volleys per second <b>${sps(l - 1)} → ${sps(l)}</b>`, tip: 'Multiplies every other card' },
  leech: { g: 'SURVIVAL', d: l => `Heal <b>1 HP every ${l === 1 ? 120 : 80} kills</b>`, tip: 'Keeps long stages alive' },
  shieldup: { g: 'SURVIVAL', d: () => 'Each level-up gives a <b>shield</b> that blocks 1 hit', tip: 'Safety for risky builds' },
};
for (const c of CARDS) { const i = CARD_INFO[c.id]; if (i) { c.desc = i.d; c.group = i.g; c.tip = i.tip; } }
// Eagle Eye used to do nothing: wire its crit bonus
const _applyUpgradeH = applyUpgrade;
applyUpgrade = function (u) { _applyUpgradeH(u); if (u.id === 'crit') P.crit += 0.08; };
function buildHtml() {
  const own = UPGRADES.filter(u => LV[u.id] > 0);
  if (!own.length) return '';
  return `<div class="build in">${own.map(u => `<div><span style="color:${u.col}">${u.icon}</span><b>${u.name}</b><em>Lv ${LV[u.id]}/${u.max}</em><p>${u.skill ? u.desc(LV[u.id]) : (u.group || '') }</p></div>`).join('')}</div>`;
}

// ---------- fragments → items (Dota-style recipes) ----------
const FRAG = {
  ember: { name: 'Ember', col: '#ff6b3c' }, frost: { name: 'Frost', col: '#6fc3ff' },
  volt: { name: 'Volt', col: '#ffe14d' }, iron: { name: 'Iron', col: '#c9ced9' },
};
const ITEMS = {
  'ember+ember': { id: 'inferno', name: 'Inferno Core', icon: '🔥', col: '#ff6b3c', desc: 'Burning enemies spread fire when they die' },
  'frost+frost': { id: 'glacier', name: 'Glacier Heart', icon: '❄', col: '#6fc3ff', desc: 'A freezing wave every 8 s' },
  'volt+volt': { id: 'overcharger', name: 'Overcharger', icon: 'ϟ', col: '#ffe14d', desc: 'Shoot 40% faster' },
  'iron+iron': { id: 'titan', name: 'Titan Plate', icon: '⬣', col: '#c9ced9', desc: '+2 max HP (cap 10)' },
  'ember+frost': { id: 'steam', name: 'Steam Engine', icon: '♨', col: '#ff9bb0', desc: 'Ultimate charges 45% faster' },
  'ember+volt': { id: 'plasma', name: 'Plasma Lens', icon: '✹', col: '#ffb547', desc: 'Every 5th bullet hit explodes' },
  'ember+iron': { id: 'forge', name: 'Forge Hammer', icon: '⚒', col: '#ff8a3c', desc: '+35% damage' },
  'frost+volt': { id: 'cryo', name: 'Cryo Coil', icon: '❆', col: '#9ff0ff', desc: 'Your lightning and skills freeze' },
  'frost+iron': { id: 'bulwark', name: 'Bulwark', icon: '⛨', col: '#a9c8ff', desc: 'Every 3rd hit you take is ignored' },
  'iron+volt': { id: 'magnetron', name: 'Magnetron', icon: '⊕', col: '#4dd6ff', desc: 'Huge pickup range, +1 coin per kill' },
};
const recipeKey = (a, b) => [a, b].sort().join('+');
const hasItem = id => G.items && G.items.includes(id);

// ---------- run setup ----------
let orbs = [], patches = [], meteors = [];
function heroNewRun() {
  // the upgrade pool is now: this hero's two skills + the behaviour cards
  const H = hero();
  UPGRADES.length = 0;
  UPGRADES.push(
    { id: 'h_q', icon: H.q.icon, col: H.col, name: H.q.name, max: 4, desc: l => H.q.desc(l), skill: true },
    { id: 'h_w', icon: H.w.icon, col: H.col, name: H.w.name, max: 4, desc: l => H.w.desc(l), skill: true },
    ...CARDS);
  for (const u of UPGRADES) LV[u.id] = 0;
  LV.h_q = 1; // every hero starts with its first skill
  for (const k of ['orbit', 'chain', 'nova', 'missile', 'drone']) LV[k] = 0; // old weapons are retired
  Object.assign(G, { hero: G.ship, ult: 0, ultCharge: 0, ultActive: 0, ultT: 0, shield: 0, shieldT: 0, volley: 0, items: [], heldFrag: null, bulwark: 0, plasmaN: 0, leechN: 0, hpCap: 8, nextCore: Infinity, ultUses: 0 });
  orbs = []; patches = []; meteors = [];
  WP.qCd = 90; WP.wCd = 150; WP.glacier = 480;
}
const _onNewRun2 = onNewRun;
onNewRun = function () { _onNewRun2(); heroNewRun(); };
TIERS.length = 1;                                                     // gun tiers are replaced by cards
gainPower = function (n = 1) { G.ultCharge = Math.min(1, (G.ultCharge || 0) + 0.25 * n); text(P.x, P.y - 30, 'ULTIMATE +' + 25 * n + '%', hero().col, 16); };
{ const b = BEACON_REWARDS.find(o => o.k === 'power'); if (b) { b.name = 'Ultimate charge'; b.desc = 'Fill half your Ultimate bar'; } }
for (let i = MISSION_POOL.length - 1; i >= 0; i--) if (MISSION_POOL[i].k === 'tier' || MISSION_POOL[i].k === 'evolve') MISSION_POOL.splice(i, 1);
MISSION_POOL.push({ k: 'ult', label: n => `Use your Ultimate ${n} time${n > 1 ? 's' : ''} in one run`, tiers: [2, 5, 10] }, { k: 'items', label: n => `Craft ${n} item${n > 1 ? 's' : ''} in one run`, tiers: [1, 2, 3] });
{ const _rv = runValue; runValue = k => k === 'ult' ? (G.ultUses || 0) : k === 'items' ? (G.items ? G.items.length : 0) : _rv(k); }
{ const i = META.findIndex(m => m.id === 'start'); if (i >= 0) META.splice(i, 1); }
setsBar = function () {
  const it = (G.items || []).map(id => Object.values(ITEMS).find(x => x.id === id));
  const held = G.heldFrag ? `<span style="color:${FRAG[G.heldFrag].col};border-color:${FRAG[G.heldFrag].col}88">◆ ${FRAG[G.heldFrag].name} fragment</span>` : '';
  if (!it.length && !held) return '';
  return `<div class="sets in">${it.map(x => `<span style="color:${x.col};border-color:${x.col}88">${x.icon} ${x.name}</span>`).join('')}${held}</div>`;
};
tagChip = function (u) { return u.skill ? `<span class="tagc" style="color:${hero().col};border-color:${hero().col}66">${hero().name} skill</span>` : ''; };

// ---------- main gun built from cards ----------
function gunPattern() {
  const pat = [], front = 1 + (LV.front || 0);
  for (let i = 0; i < front; i++) pat.push([0, (i - (front - 1) / 2) * 8]);
  for (let k = 0; k < (LV.diag || 0); k++) { const a = 0.55 + k * 0.2; pat.push([a, 0], [-a, 0]); }
  if (LV.side) pat.push([Math.PI / 2, 0], [-Math.PI / 2, 0]);
  if (LV.rear) pat.push([Math.PI, 0]);
  return pat;
}
fireBlaster = function () {
  const target = nearest(P.x, P.y, 560); if (!target) return;
  const stop = SETTINGS.control === 'stop';
  const base = Math.atan2(target.y - P.y, target.x - P.x), px = -Math.sin(base), py = Math.cos(base);
  const dmg = 14 * (1 + 0.25 * (LV.big || 0)) * (stop ? 1.25 : 1);
  for (const [da, off] of gunPattern()) {
    const a = base + da, rear = Math.abs(da) > 1.4;
    bullets.push({ x: P.x + Math.cos(a) * 16 + px * off, y: P.y + Math.sin(a) * 16 + py * off, vx: Math.cos(a) * 11, vy: Math.sin(a) * 11, life: 60,
      pierce: LV.pierce || 0, dmg: rear ? dmg * 0.75 : dmg, hitSet: null, lv: 1 + (LV.big || 0),
      bounce: LV.ricochet || 0, split: !!LV.split, homing: !!LV.homing, explosive: LV.explosive || 0,
      burn: (LV.burn || 0) + (G.hero === 'pyro' ? 1 : 0), freeze: LV.freeze || 0, poison: LV.poison || 0 });
  }
  P.recoil = 3; P.muzzle = 4; P.muzzleAng = base; AU.sfx('shoot');
  if (G.hero === 'stormcaller' && ++G.volley % 4 === 0) chainZap(P.x, P.y, 3, 18 + G.level * 1.5);
};
function homeBullet(b) {
  const t = nearest(b.x, b.y, 300, b.hitSet); if (!t) return;
  const a = Math.atan2(b.vy, b.vx), ta = Math.atan2(t.y - b.y, t.x - b.x); let d = ta - a; d = Math.atan2(Math.sin(d), Math.cos(d));
  const na = a + clamp(d, -0.12, 0.12), sp = Math.hypot(b.vx, b.vy); b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
}
// returns true when the bullet should keep flying (it bounced)
function onBulletHit(b, e) {
  if (b.burn) { e.burnT = 90 + 30 * b.burn; e.burnD = 3 + 2 * b.burn; }
  if (b.freeze) e.slowT = 45 + 30 * b.freeze;
  if (b.poison) { e.poisonS = Math.min(12, (e.poisonS || 0) + b.poison); e.poisonT = 180; }
  if (b.explosive) blast(b.x, b.y, 30 + 16 * b.explosive, b.dmg * 0.5, '#ff8a3c', e);
  if (hasItem('plasma') && ++G.plasmaN % 5 === 0) blast(b.x, b.y, 70, b.dmg * 1.2, '#ffb547', null);
  if (LV.headshot && !e.elite && e.type !== 'boss' && !e.dead && Math.random() < 0.02) { text(e.x, e.y - e.r - 12, 'DEATH MARK', '#ffe14d', 15); damage(e, e.hp + 1, 0, 0); }
  if (b.split && !b.child) {
    for (const s of [-0.7, 0.7]) { const a = Math.atan2(b.vy, b.vx) + s; bullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 10, vy: Math.sin(a) * 10, life: 28, pierce: 0, dmg: b.dmg * 0.5, hitSet: new Set([e]), lv: 1, child: true, burn: b.burn, freeze: b.freeze, poison: b.poison }); }
  }
  if (b.bounce > 0) {
    const skip = b.hitSet || new Set(); skip.add(e); b.hitSet = skip;
    const t = nearest(b.x, b.y, 260, skip);
    if (t) { const a = Math.atan2(t.y - b.y, t.x - b.x), sp = Math.hypot(b.vx, b.vy); b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.bounce--; b.life = 40; return true; }
  }
  return false;
}
function blast(x, y, R, dmg, col, skip) {
  explode(x, y, R * BLASTR(), col);
  near(x, y, R, o => { if (o !== skip && !o.dead && (o.x - x) ** 2 + (o.y - y) ** 2 < (R + o.r) ** 2) damage(o, dmg, 0, 0); });
}
function chainZap(x, y, jumps, dmg) {
  let cur = nearest(x, y, 420); if (!cur) return;
  const hit = new Set(), pts = [{ x, y }];
  for (let j = 0; j < jumps && cur; j++) { hit.add(cur); pts.push({ x: cur.x, y: cur.y }); const c = cur; cur = nearest(c.x, c.y, 190, hit); damage(c, dmg, 0, 0); if (hasItem('cryo')) c.slowT = 90; }
  bolts.push({ pts, life: 12 }); AU.sfx('zap');
}

// ---------- weapons + skills each frame ----------
updateWeapons = function () {
  const stop = SETTINGS.control === 'stop';
  const rate = 30 / (1 + 0.18 * (LV.rapid || 0)) * P.haste * (hasItem('overcharger') ? 0.71 : 1) * (stop ? 0.8 : 1);
  if (--WP.blasterCd <= 0 && !(stop && moving())) { fireBlaster(); WP.blasterCd = rate; }
  const H = G.hero, q = LV.h_q || 0, w = LV.h_w || 0, cryo = hasItem('cryo');
  if (H === 'stormcaller') {
    if (q && --WP.qCd <= 0) { WP.qCd = (420 - q * 50) * P.haste; const t = nearest(P.x, P.y, 600); const a = t ? Math.atan2(t.y - P.y, t.x - P.x) : P.ang; orbs.push({ x: P.x, y: P.y, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2, life: 190, tick: 0, dmg: 10 + q * 7 }); AU.tone(180, 0.4, 'sine', 0.06, 300); }
    if (w && --WP.wCd <= 0) { WP.wCd = (540 - w * 60) * P.haste; const R = (120 + w * 22) * BLASTR(); ring(P.x, P.y, 10, R, '#4fd8f0', 24, 8); ring(P.x, P.y, 10, R * 0.75, '#ffffff', 16, 3); AU.sfx('nova'); shake(5); near(P.x, P.y, R, e => { const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1; if (d < R + e.r) { damage(e, 18 + w * 9, dx / d * 7, dy / d * 7); if (cryo) e.slowT = 90; } }); }
  } else if (H === 'pyro') {
    if (q && --WP.qCd <= 0) {
      WP.qCd = (360 - q * 42) * P.haste; const t = nearest(P.x, P.y, 400); const a = t ? Math.atan2(t.y - P.y, t.x - P.x) : P.ang, L = 190 + q * 30;
      for (let i = 0; i < 26 && parts.length < PCAP; i++) { const aa = a + rnd(-0.5, 0.5), s = rnd(5, 11); parts.push({ x: P.x, y: P.y, vx: Math.cos(aa) * s, vy: Math.sin(aa) * s, life: 26, max: 26, size: rnd(5, 10), color: Math.random() < 0.5 ? '#ff8a3c' : '#ffe14d', drag: 0.93 }); }
      near(P.x, P.y, L, e => { const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy); let da = Math.atan2(dy, dx) - a; da = Math.atan2(Math.sin(da), Math.cos(da)); if (d < L && Math.abs(da) < 0.55) { damage(e, 22 + q * 10, dx / d * 6, dy / d * 6); e.burnT = 150; e.burnD = 4 + q; if (cryo) e.slowT = 90; } });
      AU.noise(0.3, 0.1, 1200); shake(3);
    }
    if (w && moving() && G.frame % 7 === 0) patches.push({ x: P.x - Math.cos(P.ang) * 14, y: P.y - Math.sin(P.ang) * 14, r: 26 + w * 3, life: 90 + w * 30, max: 90 + w * 30, d: 4 + w * 2 });
  } else if (H === 'warden') {
    if (q) { // orbit blades
      const n = q + 1, R = 64 + q * 8; WP.orbitAng += 0.06 + q * 0.008;
      for (let i = 0; i < n; i++) {
        const a = WP.orbitAng + i * TAU / n, bx = P.x + Math.cos(a) * R, by = P.y + Math.sin(a) * R;
        near(bx, by, 40, e => { if (!e.dead && G.frame - e.orbitHit > 18 && (e.x - bx) ** 2 + (e.y - by) ** 2 < (e.r + 12) ** 2) { e.orbitHit = G.frame; damage(e, 10 + q * 5, Math.cos(a + 1.57) * 3, Math.sin(a + 1.57) * 3); if (cryo) e.slowT = 60; } });
      }
    }
    if (w && --WP.wCd <= 0) { WP.wCd = (720 - w * 90) * P.haste; shockBash(); }
    if (++G.shieldT >= 600) { G.shieldT = 0; if (G.shield < 1 + (q >= 4 ? 1 : 0)) { G.shield++; ring(P.x, P.y, 10, 40, '#9b7bff', 16, 3); } }
  }
  // ultimate in progress
  if (G.ultActive > 0) { G.ultActive--; runUlt(); }
};
function shockBash() {
  const w = LV.h_w || 0; if (!w) return; const R = (120 + w * 20) * BLASTR();
  ring(P.x, P.y, 10, R, '#9b7bff', 22, 8); AU.sfx('nova'); shake(5);
  near(P.x, P.y, R, e => { const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1; if (d < R + e.r) { damage(e, 25 + w * 14, dx / d * 10, dy / d * 10); if (hasItem('cryo')) e.slowT = 90; } });
}

// ---------- ultimate (Dota: ranks at level 6 / 12 / 18) ----------
const ULT_LEVELS = [6, 12, 18];
function ultReady() { return G.ult > 0 && G.ultCharge >= 1 && G.ultActive <= 0 && G.state === 'play'; }
function castUlt() {
  if (!ultReady()) { if (G.ult === 0) toast('Ultimate unlocks at level 6', hero().col); return; }
  G.ultCharge = 0; G.ultUses = (G.ultUses || 0) + 1;
  const H = G.hero, r = G.ult;
  G.ultActive = H === 'warden' ? (4 + r) * 60 : 360; G.ultT = 0;
  banner(hero().ult.name.toUpperCase(), hero().col, '', 80); flash(0.35, hero().col); punch(0.08); buzz(80);
  AU.tone(110, 0.8, 'sawtooth', 0.08, 200); AU.noise(0.6, 0.12, 900);
  if (H === 'warden') { P.inv = Math.max(P.inv, G.ultActive); ring(P.x, P.y, 10, 260, '#9b7bff', 30, 10); }
}
function runUlt() {
  const H = G.hero, r = G.ult, t = ++G.ultT, cryo = hasItem('cryo');
  if (H === 'stormcaller' && t % 7 === 0) {
    const vis = enemies.filter(e => !e.dead && Math.abs(e.x - cam.x) < W / cam.z / 2 && Math.abs(e.y - cam.y) < H_view() / 2);
    for (let k = 0; k < 2 && vis.length; k++) {
      const e = vis[Math.floor(Math.random() * vis.length)];
      bolts.push({ pts: [{ x: e.x + rnd(-30, 30), y: e.y - 420 }, { x: e.x + rnd(-20, 20), y: e.y - 200 }, { x: e.x, y: e.y }], life: 12 });
      flashes.push({ x: e.x, y: e.y, r: 50, life: 8, max: 8, color: '#4fd8f0' });
      damage(e, 50 + r * 35, 0, 0); if (cryo) e.slowT = 90; if (AU.ok('ultzap', 70)) AU.sfx('zap');
    }
  } else if (H === 'pyro' && t % 10 === 0) {
    const t2 = nearest(P.x + rnd(-260, 260), P.y + rnd(-360, 360), 400) || P;
    meteors.push({ x: t2.x + rnd(-40, 40), y: t2.y + rnd(-40, 40), t: 0, dmg: 70 + r * 45 });
  } else if (H === 'warden' && t % 15 === 0) {
    const R = 150 + r * 25; ring(P.x, P.y, R * 0.6, R, '#9b7bff', 14, 5);
    near(P.x, P.y, R, e => { const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1; if (d < R + e.r) { damage(e, 18 + r * 12, dx / d * 14, dy / d * 14); e.burnT = 60; e.burnD = 5; } });
  }
}
const H_view = () => H / cam.z;

// ---------- per-frame status, items, skills ----------
function heroUpdate() {
  if (!G.hero) return;
  // enemy status effects tick 4x per second
  if (G.frame % 15 === 0) for (const e of enemies) {
    if (e.dead) continue;
    if (e.burnT > 0) { e.burnT -= 15; damage(e, e.burnD || 3, 0, 0); }
    if (e.poisonT > 0) { e.poisonT -= 15; damage(e, (e.poisonS || 1) * 2, 0, 0); }
  }
  // ball lightning orbs
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i]; o.x += o.vx; o.y += o.vy; o.life--;
    if (++o.tick % 10 === 0) near(o.x, o.y, 80, e => { if (!e.dead && (e.x - o.x) ** 2 + (e.y - o.y) ** 2 < 80 * 80) { damage(e, o.dmg, 0, 0); if (hasItem('cryo')) e.slowT = 60; if (Math.random() < 0.3) bolts.push({ pts: [{ x: o.x, y: o.y }, { x: e.x, y: e.y }], life: 6 }); } });
    if (o.life <= 0) orbs.splice(i, 1);
  }
  // pyro fire ground
  for (let i = patches.length - 1; i >= 0; i--) {
    const f = patches[i];
    if (G.frame % 15 === 0) near(f.x, f.y, f.r + 20, e => { if (!e.dead && (e.x - f.x) ** 2 + (e.y - f.y) ** 2 < (f.r + e.r) ** 2) { damage(e, f.d, 0, 0); e.burnT = Math.max(e.burnT || 0, 60); e.burnD = Math.max(e.burnD || 0, 3); } });
    if (--f.life <= 0) patches.splice(i, 1);
  }
  // meteors
  for (let i = meteors.length - 1; i >= 0; i--) { const m = meteors[i]; if (++m.t >= 34) { meteors.splice(i, 1); blast(m.x, m.y, 85, m.dmg, '#ff6b3c', null); } }
  // items
  if (hasItem('glacier') && --WP.glacier <= 0) { WP.glacier = 480; const R = 210; ring(P.x, P.y, 10, R, '#6fc3ff', 26, 7); AU.tone(1200, 0.4, 'sine', 0.05, -800); near(P.x, P.y, R, e => { if ((e.x - P.x) ** 2 + (e.y - P.y) ** 2 < (R + e.r) ** 2) { e.slowT = 150; damage(e, 15, 0, 0); } }); }
}
const _featureUpdate = featureUpdate;
featureUpdate = function () { _featureUpdate(); heroUpdate(); };

// kills charge the ultimate; vampiric, inferno, magnetron; fragments drop from tough enemies
const _onKill3 = onKill;
onKill = function (e) {
  _onKill3(e);
  if (!G.hero) return;
  if (G.ultActive <= 0) G.ultCharge = Math.min(1, (G.ultCharge || 0) + (e.type === 'boss' ? 0.5 : e.elite ? 0.2 : 1 / 90) * (hasItem('steam') ? 1.45 : 1));
  if (LV.leech && ++G.leechN >= (LV.leech === 1 ? 120 : 80)) { G.leechN = 0; if (P.hp < P.maxHp) { P.hp++; HUD.heartHit = -1; text(P.x, P.y - 30, '+1 HP', '#ff4d6d', 16); } }
  if (hasItem('magnetron')) G.coins++;
  if (hasItem('inferno') && e.burnT > 0) { let n = 0; near(e.x, e.y, 130, o => { if (o !== e && !o.dead && n < 3) { o.burnT = 120; o.burnD = Math.max(o.burnD || 0, 5); n++; } }); burst(e.x, e.y, '#ff8a3c', 8, 4, 3); }
  const keys = Object.keys(FRAG), drop = n => { for (let i = 0; i < n; i++) items.push({ x: e.x + rnd(-30, 30), y: e.y + rnd(-30, 30), kind: 'frag', ft: keys[Math.floor(Math.random() * 4)], t: 0 }); };
  if (e.type === 'boss') drop(2); else if (e.elite) drop(1); else if (e.type === 'tank' && Math.random() < 0.06) drop(1);
};
function onFrag(ft) {
  AU.sfx('pick'); burst(P.x, P.y, FRAG[ft].col, 18, 5, 3);
  if (!G.heldFrag) { G.heldFrag = ft; toast('◆ ' + FRAG[ft].name + ' fragment · find one more to craft', FRAG[ft].col); return; }
  const item = ITEMS[recipeKey(G.heldFrag, ft)]; G.heldFrag = null;
  if (G.items.includes(item.id)) { G.coins += 40; toast(item.name + ' already built · +40 coins', '#ffc94d'); return; }
  if (G.items.length >= 3) { G.coins += 40; toast('Item slots full · +40 coins', '#ffc94d'); return; }
  G.items.push(item.id);
  if (item.id === 'titan') { G.hpCap = 10; P.maxHp += 2; P.hp += 2; }
  if (item.id === 'forge') P.might += 0.35;
  if (item.id === 'magnetron') P.magnet *= 1.6;
  banner('CRAFTED · ' + item.name.toUpperCase(), item.col, item.desc, 130); flash(0.3, item.col); ring(P.x, P.y, 10, 180, item.col, 30, 6); AU.sfx('level');
}

// shield, bulwark, aegis: return true when the hit is blocked
function heroHurt(dmg, sx, sy) {
  if (!G.hero) return false;
  if (G.hero === 'warden' && G.ultActive > 0) return true;
  if (hasItem('bulwark') && ++G.bulwark % 3 === 0) { P.inv = 40; ring(P.x, P.y, 10, 60, '#a9c8ff', 16, 4); text(P.x, P.y - 30, 'BLOCKED', '#a9c8ff', 15); return true; }
  if (G.shield > 0) { G.shield--; P.inv = 50; ring(P.x, P.y, 10, 80, '#7fd1ff', 18, 5); text(P.x, P.y - 30, 'SHIELD', '#7fd1ff', 15); AU.tone(700, 0.15, 'triangle', 0.06, -300); if (G.hero === 'warden') shockBash(); return true; }
  if (G.hero === 'warden' && LV.h_w) setTimeout(shockBash, 0);
  return false;
}

// ---------- level-up: hero skills, cards, and the Ultimate at 6 / 12 / 18 ----------
levelUpScreen = function () {
  G.state = 'levelup'; joy = null;
  if (LV.shieldup) G.shield = Math.min(3, G.shield + 1);
  const mix = a => a.sort(() => Math.random() - 0.5), H = hero();
  const allowedUlt = Math.min(ultCap(), ULT_LEVELS.filter(l => G.level >= l).length);
  const skills = mix(UPGRADES.filter(u => u.skill && LV[u.id] < u.max && LV[u.id] < Math.ceil(G.level / 2) && LV[u.id] < skillCap()));
  const cards = mix(UPGRADES.filter(u => !u.skill && LV[u.id] < u.max));
  let pick = [];
  if (G.ult < allowedUlt) pick.push({ id: 'ult', icon: H.ult.icon, col: H.col, name: H.ult.name, max: 3, ult: true, desc: () => H.ult.desc(G.ult + 1) });
  if (skills.length) pick.push(skills[0]);
  for (const c of cards) { if (pick.length >= 3) break; pick.push(c); }
  if (pick.length < 3 && skills[1]) pick.push(skills[1]);
  if (!pick.length) pick.push({ id: 'heal', icon: '✚', col: '#5cffb0', name: 'Repair', max: 99, desc: () => 'Restore all HP' });
  show(`<div class="lv in">LEVEL ${G.level}</div><div class="h2 in">Choose one</div>${setsBar()}` +
    pick.map((u, i) => {
      const lv = u.ult ? G.ult + 1 : (LV[u.id] || 0) + 1, cls = u.ult ? 'r-legend' : u.skill ? 'r-epic' : 'r-rare';
      const kind = u.ult ? 'ULTIMATE' : u.skill ? H.name.toUpperCase() + ' SKILL' : 'CARD';
      return `<button class="card in ${cls}" data-i="${i}"><div class="ic" style="color:${u.col};box-shadow:inset 0 0 0 1.5px ${u.col}66">${u.icon}</div><div><small class="kind" style="color:${u.col}">${kind}</small><b>${u.name}</b>${u.max < 99 ? `<span class="lvl">${lv === 1 ? 'NEW' : 'Lv ' + (lv - 1) + ' → ' + lv}</span>` : ''}<p>${u.desc(lv)}</p>${u.tip ? `<p class="tip">${u.group ? u.group + ' · ' : ''}${u.tip}</p>` : ''}${u.max < 99 && u.max > 1 ? `<div class="pips">${Array.from({ length: u.max }, (_, k) => `<i class="${k < lv - 1 ? 'on' : k === lv - 1 ? 'next' : ''}"></i>`).join('')}</div>` : ''}</div></button>`;
    }).join('') + `<button class="btn ghost in" id="rr" style="font-size:14px;padding:10px">↻ Reroll ${G.rerolls > 0 ? '· ' + G.rerolls + ' left' : '· watch ad'}</button>`);
  document.getElementById('rr').onclick = () => { AU.sfx('ui'); if (G.rerolls > 0) { G.rerolls--; levelUpScreen(); } else rewardedAd(levelUpScreen, levelUpScreen); };
  let chosen = false;
  box.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
    if (chosen) return; chosen = true;
    const u = pick[+b.dataset.i]; AU.sfx('pick'); buzz(20);
    b.classList.add('chosen'); box.querySelectorAll('.card,.h2,.lv').forEach(c => { if (c !== b) c.classList.add('fade'); });
    if (u.ult) G.ult++; else if (u.id === 'heal') P.hp = P.maxHp; else applyUpgrade(u);
    setTimeout(() => hide(() => {
      G.state = 'play'; setPlayUi(true); P.inv = Math.max(P.inv, 45);
      text(P.x, P.y - 34, u.name.toUpperCase(), u.col, 20); ring(P.x, P.y, 10, 120, u.col, 26, 5); burst(P.x, P.y, u.col, 26, 5, 3); flash(0.15, u.col);
    }), 260);
  });
};

// ---------- ultimate button + HUD ----------
const ultBtn = document.createElement('button'); ultBtn.id = 'ult'; ultBtn.setAttribute('aria-label', 'Ultimate'); ultBtn.innerHTML = '<span>ULT<small>LV 6</small></span>';
document.body.appendChild(ultBtn);
ultBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); castUlt(); });
addEventListener('keydown', e => { if ((e.key === 'e' || e.key === 'E') && !(e.target && e.target.tagName === 'INPUT')) castUlt(); });
function ultUi(on) { ultBtn.style.display = on ? 'block' : 'none'; }
let ultLast = '';
function drawHeroBadge(lx, ly) {
  if (!G.hero) return 0;
  const H = hero();
  X.fillStyle = 'rgba(18,21,42,.85)'; X.beginPath(); X.roundRect(lx, ly, 50, 26, 7); X.fill(); X.strokeStyle = H.col; X.lineWidth = 1.5; X.stroke();
  X.font = '900 11px system-ui'; X.textAlign = 'center'; X.textBaseline = 'middle'; X.fillStyle = H.col;
  X.fillText(H.icon + ' ' + (G.shield > 0 ? '⛨' + G.shield : H.name.slice(0, 5).toUpperCase()), lx + 25, ly + 13);
  for (let k = 0; k < 3; k++) { X.fillStyle = k < G.ult ? '#ff2e63' : 'rgba(255,255,255,.15)'; X.fillRect(lx + 4 + k * 15, ly + 29, 12, 2.5); }
  // item slots + held fragment, bottom-left
  const by = H_screenBottom();
  for (let k = 0; k < 3; k++) {
    const id = G.items[k], it = id && Object.values(ITEMS).find(x => x.id === id), x = 12 + k * 34;
    X.fillStyle = 'rgba(18,21,42,.8)'; X.beginPath(); X.roundRect(x, by, 30, 30, 8); X.fill();
    X.strokeStyle = it ? it.col : 'rgba(255,255,255,.12)'; X.lineWidth = 1.5; X.stroke();
    if (it) { X.font = '15px system-ui'; X.fillStyle = it.col; X.fillText(it.icon, x + 15, by + 16); }
  }
  if (G.heldFrag) { const f = FRAG[G.heldFrag]; X.fillStyle = f.col; X.beginPath(); X.moveTo(120, by + 5); X.lineTo(128, by + 15); X.lineTo(120, by + 25); X.lineTo(112, by + 15); X.closePath(); X.fill(); X.strokeStyle = SPR.OUT; X.lineWidth = 2; X.stroke(); }
  // ultimate button state
  const pct = G.ult ? Math.round(G.ultCharge * 100) : 0, st = G.ult ? (G.ultActive > 0 ? 'ON' : pct >= 100 ? 'READY' : pct + '%') : 'LV 6';
  const key = pct + st + G.ult;
  if (key !== ultLast) { ultLast = key; ultBtn.style.setProperty('--p', pct + '%'); ultBtn.style.setProperty('--uc', H.col); ultBtn.classList.toggle('ready', G.ult > 0 && pct >= 100); ultBtn.innerHTML = `<span>${H.ult.icon}<small>${st}</small></span>`; }
  return 56;
}
const H_screenBottom = () => H - 46 - G.cineH;

// ---------- world drawing for skills and status ----------
function drawFrag(it, fy, p) {
  const f = FRAG[it.ft], x = it.x, y = it.y + fy, s = 11 * p;
  X.save(); X.translate(x, y); X.rotate(Math.sin(it.t * 0.05) * 0.4);
  X.fillStyle = f.col; X.beginPath(); X.moveTo(0, -s); X.lineTo(s * 0.75, 0); X.lineTo(0, s); X.lineTo(-s * 0.75, 0); X.closePath(); X.fill();
  X.lineWidth = 3; X.strokeStyle = SPR.OUT; X.stroke(); X.fillStyle = 'rgba(255,255,255,.6)'; X.beginPath(); X.moveTo(0, -s * 0.7); X.lineTo(s * 0.3, -s * 0.1); X.lineTo(0, 0); X.closePath(); X.fill();
  X.restore();
}
const _drawExtrasWorld = drawExtrasWorld;
drawExtrasWorld = function () {
  // fire ground under everything
  if (patches.length) { X.globalCompositeOperation = 'lighter'; for (const f of patches) glow(f.x, f.y, f.r * 1.6, '#ff6b3c', 0.45 * f.life / f.max); X.globalAlpha = 1; X.globalCompositeOperation = 'source-over'; }
  _drawExtrasWorld();
  // status markers on enemies
  for (const e of enemies) {
    if (e.dead || e.spawnT > 0) continue;
    if (e.burnT > 0 && G.frame % 4 === 0 && parts.length < PCAP - 40) parts.push({ x: e.x + rnd(-e.r, e.r) * 0.6, y: e.y - e.r * 0.3, vx: rnd(-0.3, 0.3), vy: -rnd(0.8, 1.8), life: 18, max: 18, size: rnd(3, 5), color: Math.random() < 0.5 ? '#ff8a3c' : '#ffe14d', drag: 0.96 });
    if (e.slowT > 0) { X.strokeStyle = 'rgba(111,195,255,.75)'; X.lineWidth = 2.5; X.beginPath(); X.arc(e.x, e.y, e.r + 4, 0, TAU); X.stroke(); }
    if (e.poisonT > 0 && G.frame % 10 === 0 && parts.length < PCAP - 40) parts.push({ x: e.x + rnd(-e.r, e.r) * 0.5, y: e.y, vx: 0, vy: -0.6, life: 26, max: 26, size: 4, color: '#5cffb0', drag: 1 });
  }
  X.globalCompositeOperation = 'lighter';
  for (const o of orbs) { glow(o.x, o.y, 46 + Math.sin(G.frame * 0.3) * 6, '#4fd8f0', 0.9); glow(o.x, o.y, 16, '#ffffff', 1); }
  for (const m of meteors) { const k = m.t / 34; glow(m.x, m.y - 300 * (1 - k), 30, '#ffb547', 1); }
  if (G.hero === 'warden' && G.ultActive > 0) glow(P.x, P.y, 180 + Math.sin(G.frame * 0.2) * 12, '#9b7bff', 0.5);
  X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  for (const m of meteors) { const k = m.t / 34; X.strokeStyle = `rgba(255,107,60,${0.3 + k * 0.6})`; X.lineWidth = 2; X.beginPath(); X.arc(m.x, m.y, 85 * (1 - k * 0.5), 0, TAU); X.stroke(); }
  if (G.hero === 'warden' && LV.h_q) {
    const n = LV.h_q + 1, R = 64 + LV.h_q * 8;
    for (let i = 0; i < n; i++) { const a = WP.orbitAng + i * TAU / n; blit(SPR.blade(), P.x + Math.cos(a) * R, P.y + Math.sin(a) * R, 0.9, a * 3); }
  }
  if (G.shield > 0) { X.strokeStyle = `rgba(127,209,255,${0.5 + Math.sin(G.frame * 0.15) * 0.2})`; X.lineWidth = 3; X.beginPath(); X.arc(P.x, P.y, 26, 0, TAU); X.stroke(); }
  if (SETTINGS.control === 'stop' && moving() && G.state === 'play') { X.fillStyle = 'rgba(255,255,255,.35)'; X.font = '800 9px system-ui'; X.textAlign = 'center'; X.fillText('MOVING', P.x, P.y + 30); }
};

// ---------- title: control mode switch ----------
const _bindTitleExtras2 = bindTitleExtras;
bindTitleExtras = function () {
  _bindTitleExtras2();
  const b = document.createElement('button'); b.className = 'btn ghost'; b.style.cssText = 'font-size:13px;padding:9px';
  const label = v => 'Controls: ' + (v === 'stop' ? 'Stop to shoot (+25% dmg)' : 'Auto-fire');
  b.textContent = label(SETTINGS.control);
  b.onclick = () => { SETTINGS.control = SETTINGS.control === 'stop' ? 'auto' : 'stop'; Save.bump(s => s.control = SETTINGS.control); b.textContent = label(SETTINGS.control); AU.sfx('ui'); };
  const anchor = [...document.querySelectorAll('#box .btn.ghost')].pop(); if (anchor) anchor.after(b);
};

// boot happens at the end of galaxy.js
