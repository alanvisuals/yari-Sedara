(function () {
  "use strict";
  try { document.documentElement.dir = "rtl"; document.documentElement.lang = "ckb"; } catch (e) {}
  var DATA = window.WORDS_DATA;
  var ALPHABET = Array.from("ئابپتجچحخدرڕزژسشعغفڤقکگلڵمنهەوۆیێ");
  var LEVELS = [
    { id: "easy", stars: 1,   name: "ئاسان",    range: "٣–٤ پیت", max: 8 },
    { id: "medium", stars: 2, name: "ناوەند",   range: "٥ پیت",   max: 7 },
    { id: "hard", stars: 3,   name: "قورس",     range: "٦–٧ پیت", max: 6 },
    { id: "extra", stars: 4,  name: "زۆر قورس", range: "٨+ پیت",  max: 5 }
  ];
  var HINTS_PER_DAY = 3, DAY = 24 * 3600 * 1000, PIECES = 10, KEY = "kurdish-hangman-v1";

  var $ = function (id) { return document.getElementById(id); };
  var ku = function (n) { return String(n).replace(/\d/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[d]; }); };
  var NS = "http://www.w3.org/2000/svg";
    /* ---------- sound effects (made in the browser, no files needed) ---------- */
  var SND = { on: true }, actx = null;
  try { SND.on = localStorage.getItem("kh-sound") !== "off"; } catch (e) {}
  function tone(freq, start, dur, type, vol) {
    if (!SND.on) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + start;
      o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
    } catch (e) {}
  }
  var sound = {
    win:   function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.12, 0.25, "triangle", 0.25); }); },
    lose:  function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, i * 0.22, 0.35, "sawtooth", 0.15); }); },
    right: function () { tone(880, 0, 0.12, "sine", 0.18); },
    wrong: function () { tone(180, 0, 0.18, "square", 0.12); }
  };

  /* ---------- storage (per browser; the game works without it) ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(Object.assign({}, S, { game: G }))); } catch (e) {} }
  var saved = load();
  var S = {
    streak: +saved.streak || 0, best: +saved.best || 0,
    hints: Array.isArray(saved.hints) ? saved.hints.filter(function (t) { return typeof t === "number"; }) : [],
    level: LEVELS.some(function (l) { return l.id === saved.level; }) ? saved.level : "easy",
    recent: saved.recent && typeof saved.recent === "object" ? saved.recent : {},
    game: saved.game || null
  };

  /* ---------- words ---------- */
  var pools = {};
  LEVELS.forEach(function (l) {
    var arr = [], lv = DATA.levels[l.id] || {};
    Object.keys(lv).forEach(function (ci) { lv[ci].split(" ").forEach(function (w) { if (w) arr.push({ w: w, c: DATA.cats[ci] }); }); });
    pools[l.id] = arr;
  });
  function lvl(id) { return LEVELS.filter(function (l) { return l.id === id; })[0]; }

  function pickWord() {
    var pool = pools[S.level], rec = S.recent[S.level] || [];
    var fresh = pool.filter(function (x) { return rec.indexOf(x.w) < 0; });
    if (!fresh.length) fresh = pool;
    var it = fresh[Math.floor(Math.random() * fresh.length)];
    rec.push(it.w); if (rec.length > 80) rec.shift();
    S.recent[S.level] = rec;
    return it;
  }

  /* ---------- game state ---------- */
  var G = null;
  function startGame() {
    var it = pickWord();
    G = { word: it.w, cat: it.c, level: S.level, max: lvl(S.level).max, guessed: [], hinted: [], status: "play" };
    persist(); render(true);
  }
  function letters() { return Array.from(G.word); }
  function wrongCount() { return G.guessed.filter(function (c) { return G.word.indexOf(c) < 0; }).length; }
  function revealed(c) { return G.guessed.indexOf(c) >= 0; }
  function inProgress() { return G && G.status === "play" && G.guessed.length > 0; }

  function finish(won) {
    G.status = won ? "won" : "lost";
    if (won) { S.streak++; if (S.streak > S.best) S.best = S.streak; } else { S.streak = 0; }
    persist(); render(false, true);
  }
   function check() {
    if (letters().every(revealed)) { sound.win(); return finish(true); }
    if (wrongCount() >= G.max) { sound.lose(); return finish(false); }
    persist(); render();
  }
  function guess(c) {
    if (!G || G.status !== "play" || revealed(c)) return;
    G.guessed.push(c);
    sound[G.word.indexOf(c) >= 0 ? "right" : "wrong"]();
    check();
  }

  /* ---------- hints: 3 per rolling 24 hours ---------- */
  function activeHints() { var now = Date.now(); return S.hints.filter(function (t) { return now - t < DAY && t <= now + 60000; }); }
  function hintsLeft() { return Math.max(0, HINTS_PER_DAY - activeHints().length); }
  function waitText() {
    var a = activeHints(); if (!a.length) return "";
    var ms = Math.min.apply(null, a) + DAY - Date.now(); if (ms < 0) ms = 0;
    var h = Math.floor(ms / 3600000), m = Math.ceil((ms % 3600000) / 60000);
    if (m === 60) { h++; m = 0; }
    if (h > 0) return ku(h) + " کاتژمێر" + (m ? " و " + ku(m) + " خولەک" : "");
    return ku(Math.max(1, m)) + " خولەک";
  }
  function useHint() {
    if (!G || G.status !== "play" || hintsLeft() < 1) return;
    var left = [];
    letters().forEach(function (c) { if (!revealed(c) && left.indexOf(c) < 0) left.push(c); });
    if (left.length < 2) { toast("تەنها یەک پیت ماوە، خۆت بیدۆزەرەوە!"); return; }
    var c = left[Math.floor(Math.random() * left.length)];
    S.hints = activeHints(); S.hints.push(Date.now());
    G.hinted.push(c); G.guessed.push(c); check();
  }

  /* ---------- UI ---------- */
  var keysEl = $("keys"), wordEl = $("word"), dotsEl = $("dots");
  var KB_ROWS = ["قوەرتیئۆپێڕ", "اسدفگهجکلشڵ", "زخچڤبنمژعغح"];
  KB_ROWS.forEach(function (row, ri) {
    var r = document.createElement("div"); r.className = "krow r" + ri;
    Array.from(row).forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "key"; b.textContent = c; b.setAttribute("data-c", c); b.setAttribute("aria-label", "پیتی " + c);
      r.appendChild(b);
    });
    keysEl.appendChild(r);
  });
  var FIX = { "ي": "ی", "ى": "ی", "ك": "ک", "ھ": "ه", "ة": "ە" };
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !e.key || e.key.length !== 1) return;
    if ($("overlay").hidden === false) return;
    var c = FIX[e.key] || e.key;
    if (ALPHABET.indexOf(c) >= 0) guess(c);
  });
  keysEl.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest(".key"); if (b) guess(b.getAttribute("data-c")); });

  var lvlEl = $("levels");
  LEVELS.forEach(function (l) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "lvl"; b.setAttribute("data-l", l.id);
    b.innerHTML = '<span class="stars">' + "\u2605".repeat(l.stars) + '</span><span class="ln">' + l.name + "<small>" + l.range + "</small></span>";
    lvlEl.appendChild(b);
  });
  lvlEl.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".lvl"); if (!b) return;
    var id = b.getAttribute("data-l"); if (id === S.level) return;
    leave(function () { S.level = id; startGame(); });
  });

  var pendingYes = null;
  function leave(next) {
    if (!inProgress()) { next(); return; }
    pendingYes = function () { S.streak = 0; persist(); next(); };
    $("overlay").hidden = false; $("dno").focus();
  }
  $("dyes").addEventListener("click", function () { $("overlay").hidden = true; var f = pendingYes; pendingYes = null; if (f) f(); });
  $("dno").addEventListener("click", function () { $("overlay").hidden = true; pendingYes = null; });
  $("skipbtn").addEventListener("click", function () { leave(startGame); });
  $("nextbtn").addEventListener("click", startGame);
  $("hintbtn").addEventListener("click", useHint);
    var sb = $("soundbtn");
  function paintSound() { sb.textContent = SND.on ? "🔊" : "🔇"; sb.setAttribute("aria-pressed", SND.on ? "true" : "false"); }
  sb.addEventListener("click", function () {
    SND.on = !SND.on;
    try { localStorage.setItem("kh-sound", SND.on ? "on" : "off"); } catch (e) {}
    paintSound(); if (SND.on) sound.right();
  });
  paintSound();

  var toastT;
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2600); }

  var lastStreak = S.streak;
  function render(fresh, justFinished) {
    var L = lvl(G.level), w = wrongCount(), letts = letters(), over = G.status !== "play";
    // stats
    $("streak").textContent = ku(S.streak); $("best").textContent = ku(S.best);
    if (S.streak > lastStreak) { var n = $("streak"); n.classList.remove("bump"); void n.offsetWidth; n.classList.add("bump"); }
    lastStreak = S.streak;
    Array.prototype.forEach.call(lvlEl.children, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-l") === S.level ? "true" : "false"); });
    // category and lives
    $("cat").textContent = G.cat; $("len").textContent = ku(letts.length) + " پیت";
    dotsEl.innerHTML = "";
    for (var i = 0; i < G.max; i++) { var d = document.createElement("span"); d.className = "dot" + (i < w ? " used" : ""); dotsEl.appendChild(d); }
    $("livestxt").textContent = "هەڵە: " + ku(w) + " / " + ku(G.max);
    // word cells
    if (fresh || wordEl.children.length !== letts.length) {
      wordEl.innerHTML = "";
      letts.forEach(function () { var c = document.createElement("div"); c.className = "cell"; wordEl.appendChild(c); });
    }
    letts.forEach(function (c, i) {
      var cell = wordEl.children[i], shown = revealed(c) || over;
      var was = cell.textContent;
      cell.textContent = shown ? c : "";
      cell.className = "cell" + (over && !revealed(c) ? " miss" : "");
      if (shown && !was && !over) cell.classList.add("pop");
    });
    // keys
    Array.prototype.forEach.call(keysEl.querySelectorAll(".key"), function (b) {
      var c = b.getAttribute("data-c"), g = revealed(c), inw = G.word.indexOf(c) >= 0;
      b.disabled = g || over;
      b.className = "key" + (g ? (G.hinted.indexOf(c) >= 0 ? " hint" : inw ? " hit" : " miss") : "");
    });
    // hint
    var left = hintsLeft();
    $("hintnum").textContent = ku(left);
    $("hintbtn").disabled = left < 1 || over;
    $("hintinfo").textContent = left > 0
      ? ku(left) + " یارمەتی ماوە لەم ٢٤ کاتژمێرە"
      : "یارمەتییەکان تەواو بوون. دوای " + waitText() + " یەکێکیان دەگەڕێتەوە.";
    // figure
    var n = G.status === "won" ? PIECES : (w >= G.max ? PIECES : Math.floor(w * PIECES / G.max));
    for (var k = 0; k < PIECES; k++) $("p" + k).classList.toggle("show", k < n);
    var fig = $("fig"); fig.setAttribute("class", "fig" + (G.status === "won" ? " won" : G.status === "lost" ? " lost" : ""));
    // result
    $("active").hidden = over; $("result").hidden = !over;
    if (over) {
      var won = G.status === "won", r = $("result");
      r.className = "result " + G.status;
      $("rtitle").textContent = won ? "ئافەرین! وشەکەت دۆزیەوە" : "دۆڕاویت! وشەکە ئەمە بوو";
      $("rword").textContent = G.word;
      $("rcat").textContent = "بابەت: " + G.cat;
      $("rstreak").textContent = won ? "زنجیرەی سەرکەوتنت: " + ku(S.streak) : "زنجیرەکەت بوو بە ٠";
      $("nextbtn").textContent = won ? "وشەی دواتر" : "دووبارە یاری بکە";
      if (justFinished) $("nextbtn").focus({ preventScroll: true });
    }
  }

  /* ---------- decorative sun (21 rays) ---------- */
  function sun(g, r0, r1, r2, n) {
    var core = document.createElementNS(NS, "circle");
    core.setAttribute("r", r0); core.setAttribute("fill", "var(--gold)"); g.appendChild(core);
    for (var i = 0; i < n; i++) {
      var a = i * 2 * Math.PI / n - Math.PI / 2, w = Math.PI / n * 0.55, p = document.createElementNS(NS, "polygon");
      var pts = [[r1 * Math.cos(a - w), r1 * Math.sin(a - w)], [r2 * Math.cos(a), r2 * Math.sin(a)], [r1 * Math.cos(a + w), r1 * Math.sin(a + w)]];
      p.setAttribute("points", pts.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" "));
      p.setAttribute("fill", "var(--gold)"); g.appendChild(p);
    }
  }
  sun($("flagsun"), 8, 10, 21, 21);


  /* ---------- scene: village houses and trees (seeded, so it looks the same every time) ---------- */
  (function () {
    var seed = 11; function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
    var pts = [[640, 720], [820, 580], [1000, 500], [1180, 455], [1360, 440], [1536, 430]];
    function ridge(x) { for (var i = 1; i < pts.length; i++) if (x <= pts[i][0]) { var a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); } return 430; }
    function mk(n, at, a, p) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); (p || at).appendChild(e); return e; }
    var hs = $("houses"), tr = $("trees"), greens = ["#2F6B30", "#3E7A3A", "#26582B", "#4A8741", "#1F4D27"], tans = ["#CDB68E", "#BFA57B", "#D8C6A2", "#B59A70"];
    var i, x, y, w, h;
    for (i = 0; i < 70; i++) { x = 700 + rnd() * 836; y = ridge(x) + 10 + rnd() * (700 - ridge(x) - 20); mk("circle", tr, { cx: x, cy: y, r: 9 + rnd() * 13, fill: greens[Math.floor(rnd() * 5)] }); }
    for (i = 0; i < 30; i++) {
      x = 1000 + rnd() * 300; y = ridge(x) + 18 + rnd() * 110; w = 34 + rnd() * 34; h = 24 + rnd() * 20;
      var c = tans[Math.floor(rnd() * 4)];
      mk("rect", hs, { x: x, y: y, width: w, height: h, fill: c });
      mk("rect", hs, { x: x, y: y, width: w, height: 6, fill: "#8C7650" });
      mk("rect", hs, { x: x + 6, y: y + 14, width: 7, height: 9, fill: "#4A3A28" });
      if (w > 50) mk("rect", hs, { x: x + w - 16, y: y + 14, width: 7, height: 9, fill: "#4A3A28" });
    }
    for (i = 0; i < 16; i++) { x = 980 + rnd() * 330; y = ridge(x) + 40 + rnd() * 120; mk("ellipse", tr, { cx: x, cy: y, rx: 5, ry: 18 + rnd() * 8, fill: "#173F20" }); }
    for (i = 0; i < 110; i++) { x = rnd() * 700; y = 520 + rnd() * 170; mk("circle", tr, { cx: x, cy: y, r: 9 + rnd() * 15, fill: greens[Math.floor(rnd() * 5)] }); }
    mk("rect", hs, { x: 40, y: 560, width: 90, height: 56, fill: "#C2AA82" }); mk("rect", hs, { x: 40, y: 560, width: 90, height: 8, fill: "#8C7650" }); mk("rect", hs, { x: 64, y: 580, width: 12, height: 18, fill: "#4A3A28" });
  })();

  /* ---------- boot ---------- */
  var ok = S.game && S.game.status === "play" && S.game.word && pools[S.game.level] && pools[S.game.level].some(function (x) { return x.w === S.game.word; });
  if (ok) { G = S.game; S.level = G.level; render(true); } else { startGame(); }
  setInterval(function () { if (G && hintsLeft() >= 0) { var h = hintsLeft(); $("hintnum").textContent = ku(h); if (G.status === "play") $("hintbtn").disabled = h < 1; $("hintinfo").textContent = h > 0 ? ku(h) + " یارمەتی ماوە لەم ٢٤ کاتژمێرە" : "یارمەتییەکان تەواو بوون. دوای " + waitText() + " یەکێکیان دەگەڕێتەوە."; } }, 30000);
  window.__game = { get G() { return G; }, get S() { return S; }, guess: guess, useHint: useHint };
})();