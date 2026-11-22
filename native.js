'use strict';
// ---------- Android app only (Capacitor): back button + full screen. Does nothing in a browser. ----------
(function () {
  const C = window.Capacitor; if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  const App = C.Plugins.App, Bar = C.Plugins.StatusBar;
  try { Bar && Bar.hide(); Bar && Bar.setOverlaysWebView && Bar.setOverlaysWebView({ overlay: true }); } catch (e) {}
  // the back button never throws away a round: it pauses, closes a menu, or leaves from the title
  if (App) App.addListener('backButton', () => {
    if (G.state === 'play') togglePause();
    else if (G.state === 'pause') togglePause();
    else if (G.state === 'title') App.exitApp();
    else if (G.state === 'levelup' || G.state === 'chest' || G.state === 'beacon') { /* a choice is required: stay */ }
    else titleScreen();
  });
  if (App) App.addListener('resume', () => { try { Bar && Bar.hide(); } catch (e) {} });
})();
