'use strict';
// ---------- analytics (Phase 4): the numbers for the Phase 7 decision ----------
// Events: round_start, round_end, ad_offered, ad_watched, fun_rating, day_return.
// Always counted on this device (localStorage 'ns_stats'). If ANALYTICS_URL is set, each event is also
// sent there as anonymous JSON (no name, no device id beyond a random player id).
const ANALYTICS_URL = ''; // e.g. a free GoatCounter / Firebase endpoint — set by the team, then redeploy

const Stats = {
  get() { try { return JSON.parse(localStorage.getItem('ns_stats')) || {}; } catch (e) { return {}; } },
  set(s) { try { localStorage.setItem('ns_stats', JSON.stringify(s)); } catch (e) {} },
  log(name, data = {}) {
    const s = this.get(), day = new Date().toISOString().slice(0, 10);
    s.pid = s.pid || Math.random().toString(36).slice(2, 10);
    s.count = s.count || {}; s.count[name] = (s.count[name] || 0) + 1;
    s.days = s.days || {}; s.days[day] = s.days[day] || {}; s.days[day][name] = (s.days[day][name] || 0) + 1;
    if (name === 'fun_rating') { s.fun = s.fun || []; s.fun.push(data.v); if (s.fun.length > 50) s.fun.shift(); }
    this.set(s);
    if (ANALYTICS_URL) try { navigator.sendBeacon(ANALYTICS_URL, JSON.stringify({ e: name, pid: s.pid, day, ...data })); } catch (e) {}
  },
};
// day_return: the first time the game is opened on a new calendar day after the first day
(function () {
  const s = Stats.get(), day = new Date().toISOString().slice(0, 10);
  if (!s.first) { s.first = day; s.seen = [day]; Stats.set(s); Stats.log('first_open'); return; }
  s.seen = s.seen || [];
  if (!s.seen.includes(day)) {
    const dayN = Math.round((new Date(day) - new Date(s.first)) / 864e5);
    s.seen.push(day); Stats.set(s); Stats.log('day_return', { dayN });
  }
})();

// round_start / round_end (one end per run, even with a revive)
const _startStageA = startStage;
startStage = function (k, opt = {}) { _startStageA(k, opt); G.runLogged = false; Stats.log('round_start', { mode: G.simple ? 'simple' : opt.daily ? 'daily' : 'stage', stage: k + 1 }); };
const _startA = start;
start = function (mode) { _startA(mode); G.runLogged = false; Stats.log('round_start', { mode: mode || 'endless' }); };
const _onRunEndA = onRunEnd;
onRunEnd = function () {
  _onRunEndA();
  if (G.runLogged) return; G.runLogged = true;
  Stats.log('round_end', { mode: G.simple ? 'simple' : G.mode, stage: (G.stage || 0) + 1, win: !!(G.won || G.stageDone), secs: Math.round(G.t), kills: G.kills });
};
// rewarded test ad: offered / watched
const _rewardedAdA = rewardedAd;
rewardedAd = function (onReward, onSkip) {
  Stats.log('ad_offered');
  _rewardedAdA(() => { Stats.log('ad_watched'); onReward(); }, onSkip);
};

// fun rating: one small row on the result screen, at most once a day, from the 2nd round on
const _resultScreenA = resultScreen;
resultScreen = function (win, doubled) {
  _resultScreenA(win, doubled);
  const s = Stats.get(), day = new Date().toISOString().slice(0, 10);
  if ((s.count && s.count.round_end || 0) < 2 || s.funDay === day) return;
  const row = document.createElement('div'); row.className = 'fun in';
  row.innerHTML = '<span>Having fun?</span>' + ['😐', '🙂', '😀', '🤩'].map((f, i) => `<button data-f="${i + 1}" aria-label="rating ${i + 1}">${f}</button>`).join('');
  const go = document.getElementById('go'); go.parentNode.insertBefore(row, go);
  row.querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
    Stats.log('fun_rating', { v: +b.dataset.f }); const t = Stats.get(); t.funDay = day; Stats.set(t);
    AU.sfx('pick'); row.innerHTML = '<span>Thanks! 💙</span>';
  });
};

// hidden team panel: tap the logo 5 times on the title screen
function statsPanel() {
  const s = Stats.get(), c = s.count || {}, days = s.seen || [];
  const fun = s.fun && s.fun.length ? (s.fun.reduce((a, b) => a + b, 0) / s.fun.length).toFixed(1) + ' / 4' : '—';
  const sv = sp();
  show(`<div class="lv in">TEAM STATS</div><div class="h2 in">This device</div>
    <div class="mres in">
      <div><span>Rounds started / ended</span><b>${c.round_start || 0} / ${c.round_end || 0}</b></div>
      <div><span>Ad offered / watched</span><b>${c.ad_offered || 0} / ${c.ad_watched || 0}</b></div>
      <div><span>Fun rating (avg)</span><b>${fun}</b></div>
      <div><span>Days played</span><b>${days.length} (first ${s.first || '—'})</b></div>
      <div><span>Came back on another day</span><b>${c.day_return ? 'yes' : 'no'}</b></div>
      <div><span>Simple mode</span><b>stage ${sv.stage + 1} · ${SHIP_TIERS[sv.tier].name}</b></div>
      <div><span>Remote sending</span><b>${ANALYTICS_URL ? 'on' : 'off'}</b></div>
    </div>
    <button class="btn ghost in" id="cp">Copy as text</button><button class="btn in" id="bk">Back</button>`);
  document.getElementById('cp').onclick = () => { try { navigator.clipboard.writeText(JSON.stringify(Stats.get())); document.getElementById('cp').textContent = 'Copied ✓'; } catch (e) {} };
  document.getElementById('bk').onclick = () => { AU.sfx('ui'); titleScreen(); };
}
const _titleScreenA = titleScreen;
titleScreen = function () {
  _titleScreenA();
  const logo = box.querySelector('.logo'); let taps = 0, t0 = 0;
  if (logo) logo.addEventListener('click', () => { const now = performance.now(); taps = now - t0 < 600 ? taps + 1 : 1; t0 = now; if (taps >= 5) statsPanel(); });
};
titleScreen();
