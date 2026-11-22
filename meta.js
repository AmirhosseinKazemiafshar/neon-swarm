'use strict';
// ---------- meta: daily crate + daily missions, ship paints, share card, a clean title ----------
const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA');
const yesterdayKey = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };
const hashStr = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

// ===== daily missions =====
const MISSION_DEFS = [
  { id: 'kills', label: n => `Destroy ${n} enemies`, goals: [300, 600, 1000], val: r => r.kills },
  { id: 'clear', label: n => `Clear ${n} stage${n > 1 ? 's' : ''}`, goals: [1, 2], val: r => r.win ? 1 : 0 },
  { id: 'dash', label: n => `Dash ${n} times`, goals: [25, 50], val: r => r.dashes },
  { id: 'level', label: n => `Reach level ${n} in one run`, goals: [8, 10], val: r => r.level, best: true },
  { id: 'clean', label: () => 'Clear a stage losing 2 HP or less', goals: [1], val: r => r.win && r.hpLost <= 2 ? 1 : 0 },
  { id: 'secret', label: () => 'Beat a guardian that has a secret', goals: [1], val: r => r.win && r.secret ? 1 : 0 },
  { id: 'coins', label: n => `Collect ${n} coins`, goals: [150, 300], val: r => r.coins },
];
function daily() {
  const q = Save.get().simple || {}, d = q.daily || {}, today = dayKey();
  if (d.day === today) return d;
  // a new day: 3 missions picked from the date, the crate refills
  const h = hashStr(today), defs = MISSION_DEFS.slice().sort((a, b) => hashStr(a.id + today) - hashStr(b.id + today)).slice(0, 3);
  const m = defs.map((def, i) => { const gi = (h >> (i * 3)) % def.goals.length; return { id: def.id, goal: def.goals[gi], prog: 0, claimed: false, reward: 20 + gi * 12 }; });
  const fresh = { day: today, crate: false, streak: d.streak || 0, lastCrate: d.lastCrate || '', m };
  spSave(S => S.daily = fresh); return fresh;
}
const missionDef = id => MISSION_DEFS.find(d => d.id === id);
function dailyReady() { const d = daily(); return !d.crate || d.m.some(x => x.prog >= x.goal && !x.claimed); }
function dailyRun(r) {
  const d = daily(); let newly = 0;
  for (const x of d.m) { const def = missionDef(x.id), before = x.prog >= x.goal; x.prog = def.best ? Math.max(x.prog, def.val(r)) : x.prog + def.val(r); if (!before && x.prog >= x.goal) newly++; }
  spSave(S => S.daily = d); return newly;
}
function dailyScreen() {
  const d = daily(), p = sp(), streak = d.lastCrate === yesterdayKey() || d.lastCrate === dayKey() ? (d.streak || 0) : 0;
  const crateReward = 15 + p.stage * 4 + Math.min(streak + 1, 7) * 5;
  show(`<div class="lv in" style="color:#ffd84d">DAILY</div><div class="h2 in">Come back every day</div>
    <button class="btn in ${d.crate ? 'ghost' : 'gold'}" id="crate" ${d.crate ? 'disabled' : ''}>${d.crate ? '✓ Crate opened · back tomorrow' : `🎁 Open crate · +⚙ ${crateReward}`}</button>
    <p class="tag in">${streak ? '🔥'.repeat(Math.min(7, streak)) + ' ' + streak + '-day streak' : 'Start a streak'} · the crate grows every day in a row</p>
    <div class="dm in">${d.m.map((x, i) => { const def = missionDef(x.id), done = x.prog >= x.goal; return `<div class="${done ? 'done' : ''}"><span>${def.label(x.goal)}</span><em>${Math.min(x.prog, x.goal)}/${x.goal}</em>${x.claimed ? '<b>✓</b>' : done ? `<button class="mini gold" data-m="${i}">+⚙ ${x.reward}</button>` : `<b class="r">⚙ ${x.reward}</b>`}</div>`; }).join('')}</div>
    <button class="btn ghost in" id="bk">Back</button>`);
  const cb = document.getElementById('crate');
  if (!d.crate) cb.onclick = () => {
    const s2 = d.lastCrate === yesterdayKey() ? (d.streak || 0) + 1 : 1;
    spSave(S => { S.scrap = (S.scrap || 0) + crateReward; S.daily = Object.assign(d, { crate: true, streak: s2, lastCrate: dayKey() }); });
    AU.sfx('level'); buzz(40); toast('+⚙ ' + crateReward + ' scrap', '#ffd84d'); dailyScreen();
  };
  box.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    const x = d.m[+b.dataset.m]; if (x.claimed) return; x.claimed = true;
    spSave(S => { S.scrap = (S.scrap || 0) + x.reward; S.daily = d; }); AU.sfx('pick'); dailyScreen();
  });
  document.getElementById('bk').onclick = () => { AU.sfx('ui'); titleScreen(); };
}
// count dashes for the mission
const _dashM = dash;
dash = function () { const before = P && P.dashCd; _dashM(); if (G.simple && P.dashCd > 0 && !before) G.dashN = (G.dashN || 0) + 1; };

// ===== ship paints =====
const PAINTS = [
  { id: 'classic', name: 'Classic', col: null, how: 'Default', req: () => true },
  { id: 'ember', name: 'Ember', col: '#ff7a2e', how: 'Clear stage 4', req: p => p.stage >= 4 },
  { id: 'frost', name: 'Frost', col: '#7fd4ff', how: 'Clear stage 8', req: p => p.stage >= 8 },
  { id: 'venom', name: 'Venom', col: '#5cff9a', how: 'Clear stage 12', req: p => p.stage >= 12 },
  { id: 'crimson', name: 'Crimson', col: '#ff2e63', how: 'Clear stage 16', req: p => p.stage >= 16 },
  { id: 'gold', name: 'Gold', col: '#ffd84d', how: 'Evolve into the Titan', req: p => p.tier >= 4 },
  { id: 'prism', name: 'Prism', col: '#c08bff', how: 'Find all 5 guardian weaknesses', req: () => Object.keys((Save.get().simple || {}).found || {}).length >= 5 },
  { id: 'midnight', name: 'Midnight', col: '#3c2bff', how: '7-day crate streak', req: () => (daily().streak || 0) >= 7 },
];
const paintNow = () => { const id = (Save.get().simple || {}).paint || 'classic'; return PAINTS.find(x => x.id === id) || PAINTS[0]; };
const paintCache = {};
function tintShip(spr, col) {
  const key = col + '|' + spr.width; if (paintCache[key] && paintCache[key].src === spr) return paintCache[key].c;
  const c = document.createElement('canvas'); c.width = spr.width; c.height = spr.height; const g = c.getContext('2d');
  g.drawImage(spr, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.5; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  c.w = spr.w; c.h = spr.h; paintCache[key] = { src: spr, c }; return c;
}
function shipPaint(spr) { const p = paintNow(); return p.col ? tintShip(spr, p.col) : spr; }
function newPaints() {
  const p = sp(), seen = (Save.get().simple || {}).paintsSeen || ['classic'];
  const fresh = PAINTS.filter(x => !seen.includes(x.id) && x.req(p));
  if (fresh.length) spSave(S => S.paintsSeen = seen.concat(fresh.map(x => x.id)));
  return fresh;
}
function shipThumb(cv, col) {
  const g = cv.getContext('2d'), spr = SPR.ship(G.ship || 'stormcaller'), s = col ? tintShip(spr, col) : spr, k = Math.min(cv.width / s.w, cv.height / s.h) * 0.8;
  g.clearRect(0, 0, cv.width, cv.height); g.save(); g.translate(cv.width / 2, cv.height / 2); g.rotate(-Math.PI / 2); g.drawImage(s, -s.w * k / 2, -s.h * k / 2, s.w * k, s.h * k); g.restore();
}
function paintScreen() {
  const p = sp(), cur = paintNow().id;
  show(`<div class="lv in" style="color:#c08bff">SHIP PAINT</div><div class="h2 in">Your collection</div>
    <div class="paints in">${PAINTS.map(x => { const ok = x.req(p); return `<button class="pnt ${x.id === cur ? 'on' : ''}" data-p="${x.id}" ${ok ? '' : 'disabled'}><canvas width="72" height="72" data-c="${x.col || ''}"></canvas><b>${x.name}</b><em>${ok ? (x.id === cur ? 'EQUIPPED' : 'Tap to use') : '🔒 ' + x.how}</em></button>`; }).join('')}</div>
    <button class="btn ghost in" id="bk">Back</button>`);
  box.querySelectorAll('canvas[data-c]').forEach(cv => shipThumb(cv, cv.dataset.c || null));
  box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { spSave(S => S.paint = b.dataset.p); AU.sfx('pick'); paintScreen(); });
  document.getElementById('bk').onclick = () => { AU.sfx('ui'); titleScreen(); };
}

// ===== share card after a guardian win =====
function shareCard() {
  const W2 = 1080, H2 = 1350, c = document.createElement('canvas'); c.width = W2; c.height = H2; const g = c.getContext('2d'), E = G.era || eraOf(G.stage), p = sp();
  const bg = g.createLinearGradient(0, 0, 0, H2); bg.addColorStop(0, '#16123f'); bg.addColorStop(1, '#070912'); g.fillStyle = bg; g.fillRect(0, 0, W2, H2);
  const gl = g.createRadialGradient(W2 / 2, 640, 20, W2 / 2, 640, 420); gl.addColorStop(0, E.col + '55'); gl.addColorStop(1, E.col + '00'); g.fillStyle = gl; g.fillRect(0, 0, W2, H2);
  g.textAlign = 'center'; g.fillStyle = '#e8fdff'; g.font = '900 120px system-ui, sans-serif'; g.fillText('HIVE', W2 / 2, 190); g.fillStyle = '#ff4d8d'; g.fillText('STORM', W2 / 2, 310);
  g.fillStyle = E.col; g.font = '800 54px system-ui, sans-serif'; g.fillText('STAGE ' + (G.stage + 1) + ' CLEARED', W2 / 2, 420);
  const sec = secretFor(G.stage); g.fillStyle = '#c9c6ff'; g.font = '600 38px system-ui, sans-serif'; g.fillText(sec ? 'Beat ' + SECRETS[sec].name : E.name, W2 / 2, 480);
  const spr = SPR.ship(G.ship || 'stormcaller'), pc = paintNow().col, s = pc ? tintShip(spr, pc) : spr, k = 420 / Math.max(s.w, s.h);
  g.save(); g.translate(W2 / 2, 760); g.rotate(-Math.PI / 2); g.drawImage(s, -s.w * k / 2, -s.h * k / 2, s.w * k, s.h * k); g.restore();
  g.fillStyle = '#ffffff'; g.font = '800 44px system-ui, sans-serif'; g.fillText(SHIP_TIERS[p.tier].name.toUpperCase() + ' · ' + G.kills + ' kills · ' + fmt(G.t), W2 / 2, 1080);
  g.fillStyle = '#8d93c4'; g.font = '600 36px system-ui, sans-serif'; g.fillText('Can you beat it? Play free in your browser:', W2 / 2, 1190);
  g.fillStyle = '#3cf0ff'; g.font = '700 38px system-ui, sans-serif'; g.fillText(location.host + location.pathname.replace(/index\.html$/, ''), W2 / 2, 1250);
  return c;
}
function shareNow() {
  const c = shareCard();
  c.toBlob(async blob => {
    const file = new File([blob], 'hivestorm-stage-' + (G.stage + 1) + '.png', { type: 'image/png' }), text = 'I cleared stage ' + (G.stage + 1) + ' in Hivestorm! ' + location.href.split('?')[0];
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); toast('Image saved · share it with a friend!', '#3cf0ff');
  }, 'image/png');
}

// ===== hooks into the run end and the result screen =====
const _simpleResultM = simpleResult;
simpleResult = function (win) {
  if (!G.paidS) {
    const sec = secretFor(G.stage);
    G.dailyNew = dailyRun({ win, kills: G.kills, dashes: G.dashN || 0, level: G.level, hpLost: G.hpLost || 0, secret: sec, coins: G.coins });
  }
  _simpleResultM(win);
};
const _resultScreenM = resultScreen;
resultScreen = function (win, doubled) {
  _resultScreenM(win, doubled);
  const go = document.getElementById('go'); if (!go) return;
  const notes = [];
  if (G.dailyNew) notes.push(`📋 ${G.dailyNew} daily mission${G.dailyNew > 1 ? 's' : ''} done · claim in Daily`);
  for (const pnt of newPaints()) notes.push(`🎨 New ship paint: ${pnt.name}`);
  if (win && (G.stage + 1) % STAGES_PER_ERA === 0) notes.push(`🌍 Next: ${eraOf(G.stage + 1).label}`);
  if (notes.length) { const n = document.createElement('div'); n.className = 'notes in'; n.innerHTML = notes.map(t => `<p>${t}</p>`).join(''); go.parentNode.insertBefore(n, go); }
  if (win) { const b = document.createElement('button'); b.className = 'btn ghost in'; b.textContent = '📤 Share'; b.onclick = () => { AU.sfx('ui'); shareNow(); }; const menu = document.getElementById('menu'); menu.parentNode.insertBefore(b, menu); }
};
const _onNewRunM = onNewRun;
onNewRun = function () { _onNewRunM(); G.dashN = 0; G.dailyNew = 0; };

// ===== clean title: era line, Endless · Paint · Daily (the old galaxy/Lab/heroes menu is no longer on the title) =====
const _titleScreenM = titleScreen;
titleScreen = function () {
  _titleScreenM();
  const p = sp(), E = eraOf(p.stage), tag = box.querySelector('.tag');
  if (tag) { tag.innerHTML = `<span style="color:${E.col};font-weight:800">${E.label}</span>`; }
  const more = document.getElementById('more');
  if (more) {
    more.textContent = '🎨 Paint'; more.onclick = () => { AU.init(); AU.sfx('ui'); paintScreen(); };
    const d = document.createElement('button'); d.className = 'btn ghost'; d.id = 'daily'; d.innerHTML = '🎁 Daily' + (dailyReady() ? '<i class="dot"></i>' : '');
    d.onclick = () => { AU.init(); AU.sfx('ui'); dailyScreen(); }; more.after(d);
  }
};
