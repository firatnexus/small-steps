/* ============================================================
   Minik Adımlar · app.js
   ============================================================ */
(() => {
  "use strict";

  const { t, getLang, detectInitialLang, applyLanguage, setLanguage,
          onLanguageChange, buildLangSelect } = window.i18n;

  /* ---------- Sabitler ---------- */
  const STORAGE_KEY   = "small-steps-v2";
  const TASKS_KEY_V1  = "small-steps-tasks-v1";
  const THEME_KEY     = "small-steps-theme";
  const HISTORY_KEY   = "small-steps-history";

  const RING_R = 100;
  const RING_C = 2 * Math.PI * RING_R;

  const DEFAULT_SETTINGS = {
    focus: 25, short: 5, long: 15, longEvery: 4,
    autoStart: false, sound: true
  };

  const THEMES = ["light", "dark", "sepia", "contrast"];
  const THEME_ICONS = { light: "☀️", dark: "🌙", sepia: "📜", contrast: "◐" };
  /* Platform görünümü (v3.6): web = Todoist referansı, uygulama (Android /
     Capacitor) = Things referansı. Android derlemesi <html data-platform="app">
     ile gelir; yine de çalışma anında Capacitor algılanırsa garantiye alınır. */
  const PLATFORM = (() => {
    const root = document.documentElement;
    const native = typeof window !== "undefined" && !!window.Capacitor &&
      (typeof window.Capacitor.isNativePlatform === "function"
        ? window.Capacitor.isNativePlatform() : true);
    if (native) root.dataset.platform = "app";
    else if (!root.dataset.platform) root.dataset.platform = "web";
    return root.dataset.platform === "app" ? "app" : "web";
  })();
  const THEME_META_COLORS = PLATFORM === "app"
    ? { light: "#f2f5f7", dark: "#1b1d20", sepia: "#f4ecd8", contrast: "#000000" }
    : { light: "#fefdfc", dark: "#1f1d1b", sepia: "#f4ecd8", contrast: "#000000" };
  const THEME_I18N = {
    light: "themeLight", dark: "themeDark",
    sepia: "themeSepia", contrast: "themeContrast"
  };

  /* ---------- Yardımcılar ---------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const todayKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  /* Saf takvim yardımcıları (v3.2): YYYY-MM-DD dizgeleri UTC'ye çevrilmeden,
     yerel Date üzerinden işlenir — saat dilimi kaymasına ve yaz saati
     kaymalarına kapalıdır. */
  const dateFromKey = (key) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const addDaysKey = (key, n) => {
    const dt = dateFromKey(key);
    dt.setDate(dt.getDate() + n);
    return todayKey(dt);
  };
  const isWeekendKey = (key) => {
    const wd = dateFromKey(key).getDay();
    return wd === 0 || wd === 6;
  };
  /* Tekrar kuralına göre bir sonraki occurrence: fromKey gününden itibaren.
     daily → +1 gün; weekdays → bir sonraki hafta içi gün; weekly → +7 gün. */
  function nextOccurrence(rule, fromKey) {
    if (rule === "weekly") return addDaysKey(fromKey, 7);
    let k = addDaysKey(fromKey, 1);
    if (rule === "weekdays") {
      while (isWeekendKey(k)) k = addDaysKey(k, 1);
    }
    return k;
  }
  const formatDue = (key) => {
    if (key === todayKey()) return t("dueToday");
    if (key === addDaysKey(todayKey(), 1)) return t("dueTomorrow");
    try {
      return dateFromKey(key).toLocaleDateString(getLang(), { day: "numeric", month: "short" });
    } catch { return key; }
  };

  const formatClock = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const clampInt = (v, min, max, fb) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fb;
    return Math.min(max, Math.max(min, n));
  };

  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  /* ---------- DOM ---------- */
  const els = {
    langSelect:  $("#lang-select"),
    themeToggle: $("#theme-toggle"),
    helpToggle:  $("#help-toggle"),
    form:        $("#task-form"),
    input:       $("#task-input"),
    search:      $("#task-search"),
    list:        $("#task-list"),
    empty:       $("#empty-state"),
    count:       $("#task-count"),
    badge:       $("#count-badge"),
    progress:    $("#progress-fill"),
    filters:     $("#filters"),
    clearDone:   $("#clear-done"),
    clock:       $("#clock"),
    ring:        $("#ring-fill"),
    dots:        $("#cycle-dots"),
    modeChips:   $("#mode-chips"),
    note:        $("#timer-note"),
    startPause:  $("#start-pause"),
    reset:       $("#reset"),
    skip:        $("#skip"),
    toast:       $("#toast"),
    statsLine:   $("#stats-line"),
    setFocus:    $("#set-focus"),
    setShort:    $("#set-short"),
    setLong:     $("#set-long"),
    setEvery:    $("#set-every"),
    setAuto:     $("#set-auto"),
    setSound:    $("#set-sound"),
    // Odak görevi
    focusTask:       $("#focus-task"),
    focusTaskName:   $("#focus-task-name"),
    focusTaskClear:  $("#focus-task-clear"),
    // Veri
    exportData:  $("#export-data"),
    exportCsv:   $("#export-csv"),
    importData:  $("#import-data"),
    importFile:  $("#import-file"),
    importTodoist:     $("#import-todoist"),
    importTodoistFile: $("#import-todoist-file"),
    // Kısayollar
    shortcutsDialog: $("#shortcuts-dialog"),
    shortcutsClose:  $("#shortcuts-close"),
    // GitHub yıldız durumu
    ghStar:      $("#gh-star"),
    ghStarCount: $("#gh-star-count"),
    // İstatistik
    weekChart:   $("#week-chart"),
    weekBadge:   $("#week-badge"),
    heatmap:     $("#heatmap"),
    statFocus:   $("#stat-focus-week"),
    statTasks:   $("#stat-tasks-week"),
    statSessions: $("#stat-sessions-week"),
    // Orman
    forestDays:   $("#forest-days"),
    forestScene:  $("#forest-scene"),
    forestEmpty:  $("#forest-empty"),
    forestSub:    $("#forest-sub"),
    streakBadge:  $("#streak-badge"),
    streakCount:  $("#streak-count")
  };

  /* Sıfır ya da negatif olmayan sayı; eksikse fallback */
  const statOr = (v, fb = 0) => Number.isFinite(v) ? Math.max(0, Math.round(v)) : fb;

  /* ---------- Durum ---------- */
  function normalizeTask(raw) {
    if (!raw || typeof raw !== "object") return null;
    const text = typeof raw.text === "string" ? raw.text.trim().slice(0, 120) : "";
    if (!text) return null;
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
      text, done: raw.done === true,
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
      doneAt: Number.isFinite(raw.doneAt) ? raw.doneAt : (raw.done ? Date.now() : null),
      priority: clampInt(raw.priority, 0, 3, 0),
      focus: Number.isFinite(raw.focus) ? Math.max(0, Math.round(raw.focus)) : 0,
      parentId: typeof raw.parentId === "string" && raw.parentId ? raw.parentId : null,
      repeat: ["daily", "weekdays", "weekly"].includes(raw.repeat) ? raw.repeat : null,
      dueAt: typeof raw.dueAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.dueAt) ? raw.dueAt : null,
      respawnedFrom: typeof raw.respawnedFrom === "string" && raw.respawnedFrom ? raw.respawnedFrom : null
    };
  }

  /* v3.1: görev listesini tek seviyeli alt görev modeline göre temizler.
     - Yinelenen id'ler atılır (ilk kayıt kalır)
     - Kendini/ebeveyni olmayan bir görevi işaret eden parentId temizlenir
     - En fazla 1 seviye derinlik: ebeveyni alt görev olan görevler üst seviyeye alınır */
  function sanitizeTasks(tasks) {
    const byId = new Map();
    const out = [];
    for (const task of tasks) {
      if (!task) continue;
      if (byId.has(task.id)) continue; // yinelenen id
      byId.set(task.id, task);
      out.push(task);
    }
    for (const task of out) {
      if (!task.parentId) continue;
      const parent = byId.get(task.parentId);
      if (!parent || parent === task || parent.parentId) task.parentId = null;
    }
    // Tekrarlayan görevler yalnız başına çalışır: alt görevi olan bir görevin
    // tekrarı olmaz (içe aktarılan eski/uyumsuz verilerde de bu kural uygulanır).
    const cocuklari = new Set(out.filter(t => t.parentId).map(t => t.parentId));
    for (const task of out) {
      if (task.repeat && cocuklari.has(task.id)) task.repeat = null;
    }
    return out;
  }

  function loadState() {
    const fallback = {
      tasks: [], settings: { ...DEFAULT_SETTINGS },
      stats: { date: todayKey(), focusMinutes: 0, forestTotal: 0, bestStreak: 0, streakTail: 0, streakTailEnd: null }, filter: "all",
      search: "", activeTaskId: null
    };

    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch {}

    if (!raw || typeof raw !== "object") {
      try {
        const legacy = JSON.parse(localStorage.getItem(TASKS_KEY_V1) || "null");
        if (Array.isArray(legacy)) fallback.tasks = legacy.map(normalizeTask).filter(Boolean);
      } catch {}
      return fallback;
    }

    const settings = { ...DEFAULT_SETTINGS };
    if (raw.settings && typeof raw.settings === "object") {
      const s = raw.settings;
      settings.focus     = clampInt(s.focus, 1, 90, DEFAULT_SETTINGS.focus);
      settings.short     = clampInt(s.short, 1, 30, DEFAULT_SETTINGS.short);
      settings.long      = clampInt(s.long, 1, 60, DEFAULT_SETTINGS.long);
      settings.longEvery = clampInt(s.longEvery, 2, 8, DEFAULT_SETTINGS.longEvery);
      settings.autoStart = s.autoStart === true;
      settings.sound     = s.sound !== false;
    }

    return {
      tasks: sanitizeTasks(Array.isArray(raw.tasks) ? raw.tasks.map(normalizeTask).filter(Boolean) : []),
      settings,
      stats: {
        date: typeof raw.stats?.date === "string" ? raw.stats.date : todayKey(),
        focusMinutes: Number.isFinite(raw.stats?.focusMinutes)
          ? Math.max(0, raw.stats.focusMinutes) : 0,
        // Orman/seri sayaçları (v3.3) — eski yedeklerde yoktur, 0 başlar
        forestTotal: statOr(raw.stats?.forestTotal),
        bestStreak:  raw.stats?.bestStreak === undefined ? null : statOr(raw.stats?.bestStreak),
        streakTail: statOr(raw.stats?.streakTail),
        streakTailEnd: typeof raw.stats?.streakTailEnd === "string" ? raw.stats.streakTailEnd : null
      },
      filter: ["all", "active", "done"].includes(raw.filter) ? raw.filter : "all",
      search: typeof raw.search === "string" ? raw.search.slice(0, 80) : "",
      activeTaskId: typeof raw.activeTaskId === "string" ? raw.activeTaskId : null,
      migratedDone: raw.migratedDone === true
    };
  }

  let state = loadState();
  ensureToday();

  /* v3 geçişi: tamamlanan görevler artık geçmişe kaydediliyor.
     Eski kullanıcıların mevcut görevleri silinirse istatistikten düşmesin
     diye doneAt tarihlerinden tek seferlik geri doldurma yapılır. */
  function backfillDoneHistory() {
    if (state.migratedDone) return;
    state.migratedDone = true;
    for (const task of state.tasks) {
      if (task.done && task.doneAt) {
        const day = todayKey(new Date(task.doneAt));
        if (!history[day]) history[day] = { focus: 0, done: 0 };
        history[day].done = (history[day].done || 0) + 1;
      }
    }
    saveHistory();
    save();
  }

  function ensureToday() {
    const key = todayKey();
    if (state.stats.date !== key) {
      state.stats.date = key;
      state.stats.focusMinutes = 0;
    }
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
    }, 120);
  }

  /* ---------- Geçmiş ---------- */
  function loadHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
      return typeof raw === "object" && raw !== null ? raw : {};
    } catch { return {}; }
  }
  let history = loadHistory();
  backfillDoneHistory();

  // En uzun seri kaydı: eski yedekte yoksa mevcut kanıttan tohumlanır (bir kez)
  if (state.stats.bestStreak === null) {
    state.stats.bestStreak = Math.max(longestRunInHistory(), calculateStreak());
    save();
  }

  function saveHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
  }

  function recordHistory(day, field, amount = 1) {
    if (!history[day]) history[day] = { focus: 0, done: 0, sessions: 0 };
    history[day][field] = (history[day][field] || 0) + amount;

    const keys = Object.keys(history).sort();
    if (keys.length > 90) {
      const removed = keys.slice(0, keys.length - 90);
      const oldestKept = keys[keys.length - 90];
      /* Seri kuyruğu: 90 günlük pencerenin dışındaki kesintisiz aktif günler.
         Birikmiş kuyruk tarih çapasıyla (streakTailEnd = kuyruğun en yeni günü)
         taşınır: art arda budamalarda gün gün büyür, pencereye bitişik ve
         kesintisiz değilse sıfırlanır. */
      const prevTail = state.stats.streakTail || 0;
      const prevEnd = state.stats.streakTailEnd || null;
      const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
      let tail = 0, tailEnd = null;
      for (const k of removed) {
        const active = (history[k]?.focus || 0) > 0 || (history[k]?.done || 0) > 0;
        // Önceki kuyruğun devamıysa birikmişi devral
        if (tail === 0 && prevTail > 0 && prevEnd && dayDiff(prevEnd, k) === 1) {
          tail = prevTail; tailEnd = prevEnd;
        }
        // Zincir koptuysa (arada pasif/eksik gün) sıfırla
        if (tailEnd !== null && dayDiff(tailEnd, k) !== 1) tail = 0;
        tail = active ? tail + 1 : 0;
        tailEnd = k;
      }
      // Pencereye bitişiklik: kuyruğun son günü ile tutulan en eski gün
      // ardışık VE tutulan gün aktif olmalı — yoksa kuyruk pencereye bağlı değildir
      const lastRemoved = removed[removed.length - 1];
      const keptActive = (history[oldestKept]?.focus || 0) > 0 || (history[oldestKept]?.done || 0) > 0;
      if (!keptActive || dayDiff(lastRemoved, oldestKept) !== 1) tail = 0;
      state.stats.streakTail = tail;
      state.stats.streakTailEnd = tail > 0 ? lastRemoved : null;

      removed.forEach(k => delete history[k]);
    }
    saveHistory();
  }

  function countTasksOnDay(dayKeyStr) {
    // v3: tamamlanmış görevler silinse bile istatistikte kalsın diye
    // artık görev listesinden değil, geçmiş kaydından okunuyor.
    return history[dayKeyStr]?.done || 0;
  }

  /* ---------- Tema ---------- */
  function applyTheme(theme) {
    if (!THEMES.includes(theme)) theme = "light";
    document.documentElement.dataset.theme = theme;

    els.themeToggle.textContent = THEME_ICONS[theme];
    const label = t(THEME_I18N[theme]);
    els.themeToggle.setAttribute("aria-label", label);
    els.themeToggle.setAttribute("title", label);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_META_COLORS[theme]);

    /* v3.6.1: Android'de sayfa durum çubuğunun altına çizilir (edge-to-edge).
       Varsayılan "DEFAULT" stil telefonun sistem temasını izler; uygulama açık
       temadayken telefon koyu moddaysa beyaz simgeler açık zeminde kaybolur.
       Simge rengini uygulamanın kendi temasına bağla. LIGHT = koyu simgeler
       (açık zemin için), DARK = açık simgeler. */
    const bars = window.Capacitor?.Plugins?.SystemBars;
    if (bars && typeof bars.setStyle === "function") {
      const lightBg = theme === "light" || theme === "sepia";
      Promise.resolve(bars.setStyle({ style: lightBg ? "LIGHT" : "DARK" })).catch(() => {});
    }
  }

  function initTheme() {
    let stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch {}
    if (!stored || !THEMES.includes(stored)) {
      stored = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(stored);

    els.themeToggle.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme || "light";
      const idx = THEMES.indexOf(current);
      const next = THEMES[(idx + 1) % THEMES.length];
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch {}
    });
  }

  /* ---------- Toast ---------- */
  let toastTimeout = null;
  function hideToast() { els.toast.classList.remove("show"); }

  function showToast(message, actionLabel, action) {
    els.toast.replaceChildren();
    const span = document.createElement("span");
    span.textContent = message;
    els.toast.append(span);

    if (actionLabel && typeof action === "function") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = actionLabel;
      btn.addEventListener("click", () => { hideToast(); action(); });
      els.toast.append(btn);
    }

    els.toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(hideToast, 5200);
  }

  /* ---------- Görevler ---------- */
  const PRIO_KEYS = ["prioNone", "prioLow", "prioMed", "prioHigh"];

  function activeTask() {
    if (!state.activeTaskId) return null;
    return state.tasks.find(t => t.id === state.activeTaskId) || null;
  }

  /* ---------- Alt görevler (v3.1) ---------- */
  const topTasks = () => state.tasks.filter(t => !t.parentId);
  const childrenOf = (parentId) => state.tasks.filter(t => t.parentId === parentId);

  function setActiveTask(id) {
    state.activeTaskId = id;
    save(); renderTasks(); renderFocusTask();
  }

  /* Aramada Türkçe İ/ı ve benzeri harfler için katlamalı eşleştirme */
  const foldText = (s) => String(s)
    .replace(/İ/g, "i").replace(/I/g, "i")
    .toLowerCase().replace(/ı/g, "i");

  /* Durum ve arama filtreleri üst seviye görevlere uygulanır; alt görevler
     bağlam olarak ebeveyninin altında görünür. Aramada alt görev eşleşmesi
     ebeveyni de listeye çıkarır. */
  function matchesQuery(task, q) {
    return !q || foldText(task.text).includes(q);
  }

  function visibleGroups() {
    const q = foldText(state.search.trim());
    let parents = topTasks();
    if (state.filter === "active") parents = parents.filter(t => !t.done);
    else if (state.filter === "done") parents = parents.filter(t => t.done);
    if (q) {
      parents = parents.filter(p =>
        matchesQuery(p, q) || childrenOf(p.id).some(k => matchesQuery(k, q)));
    }
    return parents;
  }

  function makeIconButton(label, glyph, extra, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `icon-btn${extra ? " " + extra : ""}`;
    btn.textContent = glyph;
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  /* v3.6.1: Satır içi giriş alanlarına odaklanır, sayfayı gereksiz yere
     kaydırmaz. Varsayılan focus() mobil Chrome'da alanı ekranın ORTASINA
     çeker (görünür olsa bile birkaç yüz piksel sıçrama). Burada önce
     preventScroll ile odaklanılır; alan görünür alanın (visualViewport —
     sanal klavye açıkken küçülen alan) dışındaysa yalnızca en yakın kenara
     kaydırılır. Klavye açıldığında tarayıcı odaklı alanı yine görünür tutar. */
  function focusField(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch { el.focus(); }
    const vv = window.visualViewport;
    const top = vv ? vv.offsetTop : 0;
    const bottom = top + (vv ? vv.height : window.innerHeight);
    const r = el.getBoundingClientRect();
    if ((r.top < top + 8 || r.bottom > bottom - 8) && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function startEdit(item, task) {
    if (item.querySelector(".edit-input")) return;
    const textEl = item.querySelector(".task-text");
    const editInput = document.createElement("input");
    editInput.className = "edit-input";
    editInput.type = "text";
    editInput.maxLength = 120;
    editInput.value = task.text;
    editInput.setAttribute("aria-label", t("taskAriaEdit"));

    item.replaceChild(editInput, textEl);
    focusField(editInput);
    editInput.setSelectionRange(editInput.value.length, editInput.value.length);

    let finished = false;
    const commit = (shouldSave) => {
      if (finished) return;
      finished = true;
      if (shouldSave) {
        const value = editInput.value.trim();
        if (value) task.text = value;
      }
      save(); renderTasks();
    };
    editInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter")  { e.preventDefault(); commit(true); }
      if (e.key === "Escape") { e.preventDefault(); commit(false); }
    });
    editInput.addEventListener("blur", () => commit(true));
  }

  /* ---------- Tekrarlayan görevler (v3.2) ----------
     Yalnız alt görevi olmayan üst seviye görevler tekrarlayabilir.
     Tamamlanınca (incomplete → complete geçişi) tam bir kez yeni occurrence
     doğar; erken tamamlama zamanlanan günün ötesine atlar, gecikmede
     birikim oluşmaz. Geri açma yalnızca yeni occurrence'a dokunulmadıysa
     mümkündür — dokunulduysa her iki kayıt da korunur ve neden açıklanır. */
  const REPEAT_KEYS = ["repeatNone", "repeatDaily", "repeatWeekdays", "repeatWeekly"];
  const REPEAT_CYCLE = [null, "daily", "weekdays", "weekly"];

  function spawnSuccessor(task) {
    if (childrenOf(task.id).length) return; // savunma: alt görevlisi görev tekrarlamaz
    let base = todayKey();
    if (task.dueAt && task.dueAt > base) base = task.dueAt; // erken tamamlama
    state.tasks.push({
      id: uid(), text: task.text, done: false,
      createdAt: Date.now(), doneAt: null,
      priority: task.priority, focus: 0, parentId: null,
      repeat: task.repeat, dueAt: nextOccurrence(task.repeat, base),
      respawnedFrom: task.id
    });
  }

  function despawnSuccessor(task) {
    const idx = state.tasks.findIndex(t => t.respawnedFrom === task.id);
    if (idx === -1) {
      // Yeni occurrence silinmiş (kullanıcı sildi) veya v3.2 öncesi veri.
      // v3.2 öncesi veride tekrar alanı zaten olamaz; silinmiş occurrence ise
      // kullanıcının açık tercihi olduğundan geri açmaya izin verilir.
      return true;
    }
    const s = state.tasks[idx];
    const untouched = !s.done && s.text === task.text &&
      s.priority === task.priority && (s.focus || 0) === 0 &&
      s.repeat === task.repeat &&
      childrenOf(s.id).length === 0;
    if (!untouched) return false;
    state.tasks.splice(idx, 1);
    return true;
  }

  function buildTaskItem(task) {
    const item = document.createElement("li");
    item.className = `task${task.parentId ? " subtask" : ""}${task.done ? " done" : ""}${task.priority ? ` prio-${task.priority}` : ""}`;
    item.dataset.id = task.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.setAttribute("aria-label",
      task.done ? t("taskAriaUndo", { text: task.text })
                : t("taskAriaComplete", { text: task.text }));
    checkbox.addEventListener("change", () => {
      const wasDoneAt = task.doneAt;
      const newlyDone = checkbox.checked && !task.done;
      const reopened = !checkbox.checked && task.done;

      if (newlyDone) {
        task.done = true;
        task.doneAt = Date.now();
        if (!task.parentId) {
          recordHistory(todayKey(), "done", 1);
          if (task.repeat) spawnSuccessor(task);
          const total = topTasks().length;
          const done = topTasks().filter(t => t.done).length;
          if (total > 1 && done === total) {
            showToast(t("toastAllDone"));
          }
        }
      } else if (reopened) {
        if (task.repeat && !task.parentId && !despawnSuccessor(task)) {
          // Yeni occurrence'a dokunulmuş: her iki kayıt korunur, geri açılamaz
          showToast(t("toastReopenBlocked"));
          checkbox.checked = true;
          return;
        }
        task.done = false;
        task.doneAt = null;
        if (wasDoneAt && !task.parentId) {
          // Geri alma: sayaç, tamamlanınca yazılan GÜNE geri alınır — bugüne değil.
          // (Dün tamamlanıp bugün geri açılırsa dünün sayacı düşer.)
          const gun = todayKey(new Date(wasDoneAt));
          if ((history[gun]?.done || 0) > 0) recordHistory(gun, "done", -1);
        }
      } else {
        // durum zaten eşleşiyordur (tekrar tıklamalar): sadece eşitle
        task.done = checkbox.checked;
        task.doneAt = task.done ? Date.now() : null;
      }
      save(); renderTasks();
    });

    const text = document.createElement("span");
    text.className = "task-text";
    text.textContent = task.text;
    text.title = t("taskEditTitle");
    text.addEventListener("dblclick", () => startEdit(item, task));

    const meta = document.createElement("span");
    meta.className = "task-meta";
    if (task.focus > 0) {
      const pill = document.createElement("span");
      pill.className = "focus-pill";
      pill.textContent = `${task.focus} ${t("unitMin").trim()}`;
      pill.title = t("focusingOn");
      meta.appendChild(pill);
    }

    // Üst seviye görevde alt görev ilerlemesi rozeti (ör. 2/5)
    if (!task.parentId) {
      const kids = childrenOf(task.id);
      if (kids.length) {
        const kidsDone = kids.filter(k => k.done).length;
        const pill = document.createElement("span");
        pill.className = "focus-pill subtask-pill";
        pill.textContent = `${kidsDone}/${kids.length}`;
        pill.title = t("subtaskProgress");
        meta.appendChild(pill);
      }
    }

    // Tekrar ve tarih rozetleri yalnız aktif görevlerde (tamamlanan occurrence'larda gizli)
    if (!task.done && !task.parentId) {
      if (task.repeat) {
        const pill = document.createElement("span");
        pill.className = "focus-pill repeat-pill";
        pill.textContent = `↻ ${t(REPEAT_KEYS[REPEAT_CYCLE.indexOf(task.repeat)])}`;
        meta.appendChild(pill);
      }
      if (task.dueAt) {
        const pill = document.createElement("span");
        pill.className = "focus-pill due-pill";
        pill.textContent = formatDue(task.dueAt);
        meta.appendChild(pill);
      }
    }

    const actions = document.createElement("div");
    actions.className = "task-actions";

    // Öncelik döngüsü: yok → düşük → orta → yüksek
    const prioBtn = makeIconButton(
      t(PRIO_KEYS[task.priority]), "▲", "prio-btn",
      () => {
        task.priority = ((task.priority || 0) + 1) % 4;
        save(); renderTasks();
      });
    prioBtn.dataset.level = String(task.priority);
    prioBtn.setAttribute("aria-label", t(PRIO_KEYS[task.priority]));
    prioBtn.title = t(PRIO_KEYS[task.priority]);

    // Odak görevi seçimi
    const focusBtn = makeIconButton(t("focusBtnAria"), "◎", "focus-btn", () => {
      setActiveTask(state.activeTaskId === task.id ? null : task.id);
    });
    focusBtn.classList.toggle("is-active", state.activeTaskId === task.id);

    actions.append(
      prioBtn,
      focusBtn,
      makeIconButton(t("taskAriaEdit"), "✏️", "", () => startEdit(item, task)),
      makeIconButton(t("taskAriaDelete"), "🗑️", "danger", () => removeTask(task))
    );

    // Alt görev ekleme düğmesi yalnızca üst seviye VE tekrarsız görevlerde.
    // Tekrarlayan görev başına çalışır — iki kontrol birbirini dışlar (↻ da
    // alt görevlisi görevlerde gizlidir). Tekrar isteyen önce alt görevleri bitirir.
    if (!task.parentId && !task.repeat) {
      actions.insertBefore(
        makeIconButton(t("subtaskAdd"), "＋", "subtask-btn", () => startSubtaskAdd(item, task)),
        actions.lastElementChild
      );
    }

    // Tekrar döngüsü düğmesi: alt görevi olmayan, aktif üst görevlerde.
    // Tamamlanmış occurrence'lar kontrol sunmaz (yanlışlıkla yeni seri doğmasın).
    if (!task.parentId && !task.done && childrenOf(task.id).length === 0) {
      const idx = REPEAT_CYCLE.indexOf(task.repeat || null);
      const repeatBtn = makeIconButton(t(REPEAT_KEYS[idx]), "↻", "repeat-btn", () => {
        task.repeat = REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length];
        save(); renderTasks();
      });
      repeatBtn.classList.toggle("is-active", !!task.repeat);
      repeatBtn.dataset.level = String(idx);
      actions.insertBefore(repeatBtn, actions.lastElementChild);
    }

    item.append(checkbox, text, meta, actions);
    return item;
  }

  /* Alt görev ekleme satırı: üst görevin altında beliren satır içi giriş.
     Enter/Ekle düğmesi ekler, Esc iptal eder, odak kaybolunca kaydedilir. */
  function startSubtaskAdd(item, parentTask) {
    if (item.querySelector(".subtask-add")) return;

    const row = document.createElement("div");
    row.className = "subtask-add";

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 120;
    input.placeholder = t("subtaskPlaceholder");
    input.setAttribute("aria-label", t("subtaskAria"));

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "subtask-add-btn";
    addBtn.textContent = t("add");

    row.append(input, addBtn);
    item.appendChild(row);
    focusField(input);

    let finished = false;
    const finish = (commit) => {
      if (finished) return;
      finished = true;
      if (commit) {
        const value = input.value.trim();
        if (value) {
          state.tasks.push({
            id: uid(), text: value.slice(0, 120), done: false,
            createdAt: Date.now(), doneAt: null,
            priority: 0, focus: 0, parentId: parentTask.id
          });
          save();
        }
      }
      renderTasks();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")  { e.preventDefault(); finish(true); }
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
    addBtn.addEventListener("mousedown", (e) => e.preventDefault()); // odak kaybolmasın
    addBtn.addEventListener("click", () => finish(true));
  }

  /* Silme: üst seviye bir görev, alt görevleriyle birlikte silinir.
     Geri alma yalnızca silinen kayıtları geri koyar — silme toast'ı
     açıkken eklenen yeni görevler korunur. Her kayıt, özgün sırasında
     kendisinden sonra gelen ve hâlâ listede olan ilk komşusunun önüne
     yerleşir; komşu kalmadıysa listenin sonuna eklenir. */
  function restoreTasks(removed, snapshot) {
    for (const task of removed) {
      if (state.tasks.includes(task)) continue;
      const originalIdx = snapshot.indexOf(task);
      let inserted = false;
      for (let i = originalIdx + 1; i < snapshot.length; i++) {
        const nextIdx = state.tasks.indexOf(snapshot[i]);
        if (nextIdx !== -1) {
          state.tasks.splice(nextIdx, 0, task);
          inserted = true;
          break;
        }
      }
      if (!inserted) state.tasks.push(task);
    }
  }

  function removeTask(task) {
    const index = state.tasks.indexOf(task);
    if (index === -1) return;

    const snapshot = state.tasks.slice();
    const kids = task.parentId ? [] : childrenOf(task.id);
    const removed = [task, ...kids];

    state.tasks = state.tasks.filter(t => !removed.includes(t));
    save(); renderTasks();
    if (state.activeTaskId &&
        (state.activeTaskId === task.id || kids.some(k => k.id === state.activeTaskId))) {
      renderFocusTask();
    }

    const message = kids.length ? t("toastDeletedTree", { n: kids.length }) : t("toastDeleted");
    showToast(message, t("toastUndo"), () => {
      restoreTasks(removed, snapshot);
      save(); renderTasks(); renderFocusTask();
    });
  }

  function renderTasks() {
    const groups = visibleGroups();
    const items = [];
    for (const parent of groups) {
      items.push(buildTaskItem(parent));
      for (const kid of childrenOf(parent.id)) items.push(buildTaskItem(kid));
    }
    els.list.replaceChildren(...items);

    const tops = topTasks();
    const total = tops.length;
    const done = tops.filter(t => t.done).length;

    els.empty.textContent = groups.length === 0
      ? t(state.search.trim()
          ? "emptySearch"
          : state.filter === "active" ? "emptyActive"
          : state.filter === "done" ? "emptyDone" : "emptyAll")
      : "";
    els.empty.hidden = groups.length > 0;

    els.badge.textContent = `${done} / ${total}`;
    els.count.textContent = t("count", { done, total });
    els.progress.style.width = total ? `${(done / total) * 100}%` : "0%";
    els.clearDone.disabled = !state.tasks.some(t => t.done);

    $$(".chip", els.filters).forEach(chip => {
      chip.classList.toggle("is-active", chip.dataset.filter === state.filter);
    });

    renderStats();
    renderStatsCard();
    renderFocusTask();
  }

  /* ---------- Odak görevi ---------- */
  function renderFocusTask() {
    const task = activeTask();
    if (!task) {
      if (!state.activeTaskId) { els.focusTask.hidden = true; return; }
      state.activeTaskId = null;
      els.focusTask.hidden = true;
      return;
    }
    els.focusTaskName.textContent = task.text;
    els.focusTask.hidden = false;
  }

  function renderStats() {
    // Gün içindeki tamamlanan görevler de geçmişten okunur:
    // silinen görev gün sayacını düşürmesin (haftalık tabloyla tutarlı).
    const doneToday = countTasksOnDay(todayKey());
    els.statsLine.textContent = t("statsLine", {
      done: doneToday, minutes: state.stats.focusMinutes
    });
  }

  /* ---------- Haftalık istatistik ---------- */
  function lastNDays(n) {
    const days = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    return days;
  }

  function calculateStreak() {
    let streak = 0;
    const now = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const k = todayKey(d);
      const focus = history[k]?.focus || 0;
      const tasks = countTasksOnDay(k);
      const active = focus > 0 || tasks > 0;

      if (active) streak++;
      else if (i === 0) continue;
      else break;
    }
    // Kuyruk yalnızca geriye tarama penceredeki TÜM kayıtları sorunsuz
    // geçtiyse eklenebilir: arada kopukluk varsa kuyruk bugünkü seriye ait değil
    const retained = Object.keys(history).length;
    if (retained > 0 && streak >= retained) streak += state.stats.streakTail || 0;
    return streak;
  }

  /* Geçmişteki (90 günlük pencere dahil) en uzun kesintisiz aktif gün serisi.
     bestStreak yalnız yedekten gelmiyorsa kanıttan tohumlanır. */
  function longestRunInHistory() {
    const keys = Object.keys(history).sort();
    let best = 0, run = 0, prev = null;
    for (const k of keys) {
      const active = (history[k]?.focus || 0) > 0 || (history[k]?.done || 0) > 0;
      if (!active) { run = 0; prev = k; continue; }
      // Gün atlaması varsa (eksik kayıt) seri kesilir
      if (prev) {
        const gap = (new Date(k) - new Date(prev)) / 86400000;
        if (gap > 1) run = 0;
      }
      run++;
      if (run > best) best = run;
      prev = k;
    }
    return best;
  }

  function renderStatsCard() {
    const days = lastNDays(7);
    const today = todayKey();
    const weekKeys = days.map(d => todayKey(d));

    const focusValues = weekKeys.map(k => history[k]?.focus || 0);
    const maxFocus = Math.max(1, ...focusValues);

    els.weekChart.replaceChildren(...days.map((d) => {
      const k = todayKey(d);
      const focus = history[k]?.focus || 0;
      const isToday = k === today;
      const pct = (focus / maxFocus) * 100;

      const col = document.createElement("div");
      col.className = `day-col${isToday ? " today" : ""}`;
      col.title = `${d.toLocaleDateString(getLang())} — ${focus} ${t("unitMin").trim()}`;

      const value = document.createElement("div");
      value.className = "day-value";
      value.textContent = focus > 0 ? String(focus) : "";

      const wrap = document.createElement("div");
      wrap.className = "day-bar-wrap";
      const bar = document.createElement("div");
      bar.className = "day-bar";
      bar.style.height = `${focus > 0 ? Math.max(6, pct) : 4}%`;
      wrap.appendChild(bar);

      const label = document.createElement("div");
      label.className = "day-label";
      try { label.textContent = d.toLocaleDateString(getLang(), { weekday: "short" }); }
      catch { label.textContent = d.toLocaleDateString(undefined, { weekday: "short" }); }

      col.append(value, wrap, label);
      return col;
    }));

    let totalFocus = 0;
    let totalTasks = 0;
    weekKeys.forEach(k => {
      totalFocus += history[k]?.focus || 0;
      totalTasks += countTasksOnDay(k);
    });

    els.statFocus.textContent = String(totalFocus);
    els.statTasks.textContent = String(totalTasks);
    els.statSessions.textContent = String(weekKeys.reduce((s, k) => s + (history[k]?.sessions || 0), 0));
    els.weekBadge.textContent = `${totalFocus}${t("unitMin")}`;

    // En uzun seri kaydı: yalnızca yeni rekor kırıldığında güncelle
    const streak = calculateStreak();
    if (streak > (state.stats.bestStreak || 0)) {
      state.stats.bestStreak = streak;
      save();
    }

    renderHeatmap();
    renderForest(streak);
  }

  /* ---------- Orman (v3.3) ----------
     Tamamlanan her odak oturumu bir ağaç diker. Ağaçlar deterministik
     olarak (gün + sıra numarası tohumu) üretilir: aynı veri her zaman
     aynı ormanı çizer, dosya/asset gerekmez. Son 14 gün gösterilir;
     gün başına en fazla 4 ağaç + "+n" rozeti. Eski veride oturum sayısı
     yoktur (v3.3 öncesi dakika toplamından çıkarılamaz) — orman bu
     sürümle başlar, istatistikler etkilenmez. */
  const FOREST_DAYS = 14;
  const FOREST_TREES_PER_DAY = 4;

  function hashSeed(str) {
    let h = 1779033703;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  /* Basit deterministik PRNG (mulberry32) — ağaç çeşitliliği için */
  function mulberry32(a) {
    return function() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function treeSVG(seed) {
    const r = mulberry32(seed);
    const species = Math.floor(r() * 4);
    const h = 34 + Math.floor(r() * 16);
    const w = 22 + Math.floor(r() * 10);
    const cx = w / 2;
    const trunk = `<rect x="${(cx - 1.6).toFixed(1)}" y="${h - 13}" width="3.2" height="13" rx="1.4" class="tree-trunk"/>`;
    let shapes = "";
    if (species === 0) { // yuvarlak taç
      shapes = `<circle cx="${(cx - 3.5).toFixed(1)}" cy="${h - 15}" r="7.5" class="tree-canopy c2"/>
        <circle cx="${(cx + 3.5).toFixed(1)}" cy="${h - 17}" r="8.5" class="tree-canopy c1"/>
        <circle cx="${cx.toFixed(1)}" cy="${h - 9}" r="6.5" class="tree-canopy c2"/>`;
    } else if (species === 1) { // çam
      shapes = `<path d="M${cx} ${h - 32} L${cx + 8.5} ${h - 14} H${cx - 8.5} Z" class="tree-canopy c1"/>
        <path d="M${cx} ${h - 24} L${cx + 9.5} ${h - 5} H${cx - 9.5} Z" class="tree-canopy c2"/>`;
    } else if (species === 2) { // elips taç
      shapes = `<ellipse cx="${cx.toFixed(1)}" cy="${h - 14}" rx="9.5" ry="11.5" class="tree-canopy c1"/>
        <ellipse cx="${(cx - 3).toFixed(1)}" cy="${h - 19}" rx="6" ry="7" class="tree-canopy c2"/>`;
    } else { // iki kat blok
      shapes = `<rect x="${cx - 6.5}" y="${h - 17}" width="13" height="10" rx="4.5" class="tree-canopy c1"/>
        <rect x="${cx - 4.5}" y="${h - 26}" width="9" height="10" rx="4" class="tree-canopy c2"/>`;
    }
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false">${trunk}${shapes}</svg>`;
  }

  function renderForest(streak) {
    if (!els.forestDays) return;
    const days = lastNDays(FOREST_DAYS);
    const today = todayKey();
    let treeTotal = 0;

    const clusters = days.map((d) => {
      const k = todayKey(d);
      const n = history[k]?.sessions || 0;
      treeTotal += n;
      const shown = Math.min(n, FOREST_TREES_PER_DAY);

      const cl = document.createElement("div");
      cl.className = "day-cluster" + (n === 0 ? " empty" : "") + (k === today ? " today" : "");

      const trees = document.createElement("div");
      trees.className = "day-trees";
      for (let i = 0; i < shown; i++) {
        trees.insertAdjacentHTML("beforeend", treeSVG(hashSeed(`${k}#${i}`)));
      }
      cl.appendChild(trees);

      if (n > FOREST_TREES_PER_DAY) {
        const more = document.createElement("span");
        more.className = "more-pill";
        more.textContent = t("forestMore", { n: n - FOREST_TREES_PER_DAY });
        cl.appendChild(more);
      }

      const label = document.createElement("div");
      label.className = "day-label";
      try { label.textContent = k === today ? t("dueToday") : d.toLocaleDateString(getLang(), { weekday: "short" }); }
      catch { label.textContent = d.toLocaleDateString(undefined, { weekday: "short" }); }
      cl.appendChild(label);

      return cl;
    });

    els.forestDays.replaceChildren(...clusters);
    els.forestDays.setAttribute("aria-label", t("forestAria", { count: treeTotal }));

    // Boş durum yalnız "hiç ağaç dikilmemişse": dikilmiş ama pencerede
    // oturum yoksa (ör. 2 hafta ara vermişse) sahne + toplam gösterilir
    const isEmpty = treeTotal === 0 && (state.stats.forestTotal || 0) === 0;
    els.forestScene.hidden = isEmpty;
    els.forestEmpty.hidden = !isEmpty;

    // Seri rozeti: rakam + yerelleştirilmiş gün etiketi (mobilde de anlaşılır)
    els.streakCount.textContent = streak === 1 ? t("streakDay1", { n: 1 }) : t("streakDays", { n: streak });
    els.streakBadge.title = t("statStreak");
    els.forestSub.textContent = t("forestSub", {
      total: state.stats.forestTotal || 0,
      best: state.stats.bestStreak || 0
    });

    // Mobilde bugünün ağaçları görünsün: taşma varsa bugüne kaydır
    scrollForestToToday();
  }

  /* v3.6.1: Yalnızca orman şeridini YATAY kaydırır. Eskiden
     scrollIntoView({block:"nearest"}) kullanılıyordu; bu, kaydırılabilir tüm
     ataları — pencere dahil — kaydırdığından her görev ekleme/filtre/silme
     (renderTasks → renderStats → renderForest) ve mobil klavye açılışındaki
     resize olayı sayfayı orman kartına atlatıyordu. Burada sadece
     forestScene.scrollLeft değişir; sayfanın dikey konumu korunur.
     Göreli fark (rect farkı) LTR ve RTL'de aynı yönde çalışır. */
  function scrollForestToToday() {
    const scene = els.forestScene;
    const todayCluster = els.forestDays?.querySelector(".day-cluster.today");
    if (!todayCluster || !scene || scene.scrollWidth <= scene.clientWidth) return;
    const s = scene.getBoundingClientRect();
    const c = todayCluster.getBoundingClientRect();
    const pad = 8;
    let dx = 0;
    if (c.right > s.right - pad) dx = c.right - (s.right - pad);
    else if (c.left < s.left + pad) dx = c.left - (s.left + pad);
    if (dx) scene.scrollLeft += dx;
  }

  /* ---------- 90 günlük ısı haritası ---------- */
  function renderHeatmap() {
    const weeks = 13;
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - (weeks * 7 - 1));

    const levelFor = (focus) =>
      focus <= 0 ? 0 : focus < 30 ? 1 : focus < 60 ? 2 : focus < 120 ? 3 : 4;

    const columns = [];
    for (let w = 0; w < weeks; w++) {
      const col = document.createElement("div");
      col.className = "heatmap-col";

      for (let d = 0; d < 7; d++) {
        const idx = w * 7 + d;
        const date = new Date(start);
        date.setDate(start.getDate() + idx);

        const cell = document.createElement("div");
        if (date > today) { cell.className = "heat-cell is-future"; col.appendChild(cell); continue; }

        const key = todayKey(date);
        const focus = history[key]?.focus || 0;
        cell.className = `heat-cell lv-${levelFor(focus)}`;
        cell.title = `${date.toLocaleDateString(getLang())} — ${focus}${t("unitMin")}`;
        col.appendChild(cell);
      }
      columns.push(col);
    }
    els.heatmap.replaceChildren(...columns);
  }

  /* ---------- Yedekleme ---------- */
  function exportBackup() {
    const data = {
      app: "small-steps", version: 3,
      exportedAt: new Date().toISOString(),
      language: getLang(),
      theme: document.documentElement.dataset.theme || null,
      state: {
        tasks: state.tasks, settings: state.settings, filter: state.filter,
        stats: state.stats, activeTaskId: state.activeTaskId
      },
      history
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `small-steps-backup-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- CSV dışa aktarma (v3.1) ----------
     CSV yalnızca görevleri içerir (tam yedek JSON'dır). UTF-8 BOM ve
     RFC 4180 uyumlu kaçış: tırnak içinde çift tırnak, satır sonu CRLF. */
  const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  function exportTasksCsv() {
    const rows = [["type", "text", "done", "priority", "focus_minutes", "parent_text", "repeat", "due_date", "created_at", "completed_at"]];
    for (const parent of topTasks()) {
      rows.push([
        "task", parent.text, parent.done ? "yes" : "no", parent.priority,
        parent.focus, "", parent.repeat || "", parent.dueAt || "",
        new Date(parent.createdAt).toISOString(),
        parent.doneAt ? new Date(parent.doneAt).toISOString() : ""
      ]);
      for (const kid of childrenOf(parent.id)) {
        rows.push([
          "subtask", kid.text, kid.done ? "yes" : "no", kid.priority,
          kid.focus, parent.text, kid.repeat || "", kid.dueAt || "",
          new Date(kid.createdAt).toISOString(),
          kid.doneAt ? new Date(kid.doneAt).toISOString() : ""
        ]);
      }
    }
    const csv = "\uFEFF" + rows.map(r => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `small-steps-tasks-${todayKey()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- Todoist CSV içe aktarma (v3.2) ----------
     Todoist'in resmi CSV biçimi: TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,
     AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE sütunları; ayırıcı virgül
     veya noktalı virgül olabilir (başlıktan otomatik algılanır).
     TYPE=task satırları alınır; INDENT 1 → üst görev, 2+ → son üst görevin
     alt görevi (tek seviyeye düzleştirilir). PRIORITY 1 (p1, en yüksek) →
     3'e eşlenir, 4 → 0'a. DATE yalnız YYYY-MM-DD ile başlıyorsa dueAt
     olarak alınır; doğal dil/tekrar ifadeleri ve bölüm/not satırları
     atlanır — onay penceresi kaç kaydın atlanacağını gösterir. */
  function parseDelimited(text) {
    const src = text.replace(/^\uFEFF/, "");
    const firstLine = src.split(/\r?\n/)[0] || "";
    const delim = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (inQuotes) {
        if (ch === '"') {
          if (src[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        row.push(field); field = "";
      } else if (ch === "\n") {
        row.push(field); rows.push(row); row = []; field = "";
      } else if (ch !== "\r") {
        field += ch;
      }
    }
    if (inQuotes) throw new Error("kapanmamış tırnak"); // bozuk CSV: reddet
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /* YYYY-MM-DD biçimi VE gerçek bir takvim günü mü? (2026-13-45 gibi imkânsız
     tarihler reddedilir — Date'a UTC ayrıştırması yapılmadan yerel kontrol.) */
  function isValidDateKey(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function importTodoistCsv(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseDelimited(String(reader.result));
        const headerIdx = rows.findIndex(r =>
          r.some(c => String(c).trim().toLowerCase() === "type") &&
          r.some(c => String(c).trim().toLowerCase() === "content"));
        if (headerIdx === -1) { showToast(t("todoistInvalid")); return; }
        const cols = {};
        rows[headerIdx].forEach((c, i) => {
          const name = String(c).trim().toUpperCase();
          if (!(name in cols)) cols[name] = i;
        });
        const get = (r, col) => col in cols ? String(r[cols[col]] ?? "").trim() : "";

        const tasks = [];
        let skipped = 0, datesOmitted = 0, lastTop = null;
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r.length || r.every(c => !String(c).trim())) continue;
          const type = get(r, "TYPE").toLowerCase();
          if (type === "section") { skipped++; lastTop = null; continue; } // bölüm: ebeveyn hafızası sıfırlanır
          if (type !== "task") { skipped++; continue; }
          const text = get(r, "CONTENT").slice(0, 120);
          if (!text) { skipped++; continue; }
          const prioRaw = parseInt(get(r, "PRIORITY"), 10);
          const priority = (prioRaw >= 1 && prioRaw <= 4) ? 4 - prioRaw : 0; // 1→3 … 4→0
          const dateRaw = get(r, "DATE");
          const iso = /^(\d{4}-\d{2}-\d{2})/.exec(dateRaw);
          // Yalnız geçerli takvim tarihleri aktarılır; doğal dil/ifade tarihleri
          // atlanır ve ayrı sayılır (satır değil, yalnız tarih atlanır)
          const dueAt = iso && isValidDateKey(iso[1]) ? iso[1] : null;
          if (dateRaw && !dueAt) datesOmitted++;
          const indent = parseInt(get(r, "INDENT"), 10) || 1;
          const task = {
            id: uid(), text, done: false, createdAt: Date.now(), doneAt: null,
            priority, focus: 0,
            parentId: indent >= 2 && lastTop ? lastTop : null,
            repeat: null, dueAt, respawnedFrom: null
          };
          if (!task.parentId) lastTop = task.id;
          tasks.push(task);
        }
        if (!tasks.length) { showToast(t("todoistInvalid")); return; }
        if (!window.confirm(t("todoistConfirm", { n: tasks.length, m: skipped, d: datesOmitted }))) return;
        state.tasks.push(...tasks);
        save(); renderTasks();
        showToast(t("todoistDone", { n: tasks.length }));
      } catch {
        showToast(t("todoistInvalid"));
      }
    };
    reader.readAsText(file);
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let data = null;
      try { data = JSON.parse(String(reader.result)); } catch { data = null; }

      const st = data?.state && Array.isArray(data.state.tasks) ? data.state : data;
      const ok = data && typeof data === "object" &&
        st && Array.isArray(st.tasks) && st.settings && typeof st.settings === "object";

      if (!ok) { showToast(t("importInvalid")); return; }
      if (!window.confirm(t("importConfirm"))) return;

      state.tasks = sanitizeTasks(st.tasks.map(normalizeTask).filter(Boolean));
      // Odak görevi yalnızca hâlâ listede bir görevse geçerli
      if (state.activeTaskId && !state.tasks.some(t => t.id === state.activeTaskId)) {
        state.activeTaskId = null;
      }
      const s = st.settings;
      state.settings.focus     = clampInt(s.focus, 1, 90, DEFAULT_SETTINGS.focus);
      state.settings.short     = clampInt(s.short, 1, 30, DEFAULT_SETTINGS.short);
      state.settings.long      = clampInt(s.long, 1, 60, DEFAULT_SETTINGS.long);
      state.settings.longEvery = clampInt(s.longEvery, 2, 8, DEFAULT_SETTINGS.longEvery);
      state.settings.autoStart = s.autoStart === true;
      state.settings.sound     = s.sound !== false;
      state.filter = ["all", "active", "done"].includes(st.filter) ? st.filter : "all";
      state.activeTaskId = typeof st.activeTaskId === "string" ? st.activeTaskId : null;
      state.search = "";
      els.search.value = "";

      // Günlük sayaç da geri gelsin
      if (st.stats && typeof st.stats === "object") {
        state.stats.date = typeof st.stats.date === "string" ? st.stats.date : todayKey();
        state.stats.focusMinutes = Number.isFinite(st.stats.focusMinutes)
          ? Math.max(0, st.stats.focusMinutes) : 0;
        state.stats.forestTotal = statOr(st.stats.forestTotal);
        state.stats.bestStreak  = statOr(st.stats.bestStreak);
        state.stats.streakTail = statOr(st.stats.streakTail);
        state.stats.streakTailEnd = typeof st.stats.streakTailEnd === "string" ? st.stats.streakTailEnd : null;
      } else {
        state.stats = { date: todayKey(), focusMinutes: 0, forestTotal: 0, bestStreak: 0, streakTail: 0, streakTailEnd: null };
      }

      // Zamanlayıcıyı yeni sürelerle eşitle
      stopTicking();
      timer.mode = "focus";
      timer.total = durationFor("focus");
      timer.remaining = timer.total;
      timer.startDay = "";

      if (data.history && typeof data.history === "object" && !Array.isArray(data.history)) {
        history = {};
        for (const [day, rec] of Object.entries(data.history)) {
          if (typeof rec !== "object" || rec === null) continue;
          history[day] = {
            focus: Math.max(0, Math.round(Number(rec.focus) || 0)),
            done: Math.max(0, Math.round(Number(rec.done) || 0)),
            sessions: Math.max(0, Math.round(Number(rec.sessions) || 0))
          };
        }
        saveHistory();
        // Yedekteki en uzun seri kaydı, içe aktarılan geçmişin kanıtından küçükse güncelle
        const evidence = Math.max(longestRunInHistory(), calculateStreak());
        if (evidence > (state.stats.bestStreak || 0)) state.stats.bestStreak = evidence;
      }

      if (typeof data.language === "string" && window.i18n.SUPPORTED_LANGS.includes(data.language)) {
        els.langSelect.value = data.language; // önce değer: dil menüsü etiketi doğru dili okusun
        setLanguage(data.language);
      }
      if (typeof data.theme === "string" && THEMES.includes(data.theme)) {
        applyTheme(data.theme);
        try { localStorage.setItem(THEME_KEY, data.theme); } catch {}
      }

      ensureToday(); save(); syncSettingsInputs();
      renderTasks(); renderTimerUI(); renderStats(); renderStatsCard(); renderFocusTask();
      showToast(t("importDone"));
    };
    reader.readAsText(file);
  }

  /* ---------- Kısayollar ---------- */
  function openShortcuts() {
    if (typeof els.shortcutsDialog.showModal === "function") els.shortcutsDialog.showModal();
    else els.shortcutsDialog.setAttribute("open", "");
  }
  function closeShortcuts() {
    if (els.shortcutsDialog.open) els.shortcutsDialog.close();
    else els.shortcutsDialog.removeAttribute("open");
  }

  /* ---------- Zamanlayıcı ---------- */
  const timer = {
    mode: "focus",
    total: DEFAULT_SETTINGS.focus * 60,
    remaining: DEFAULT_SETTINGS.focus * 60,
    running: false, endAt: 0, cycle: 0, handle: null,
    startDay: ""          // oturumun başladığı gün (gece yarısı geçişlerinde doğru kredi)
  };
  let noteKey = "";
  let audioCtx = null;

  els.ring.style.strokeDasharray = String(RING_C);

  const durationFor = (mode) => {
    const s = state.settings;
    if (mode === "focus") return s.focus * 60;
    if (mode === "short") return s.short * 60;
    return s.long * 60;
  };

  function updateRing() {
    const frac = timer.total > 0 ? timer.remaining / timer.total : 0;
    els.ring.style.strokeDashoffset = String(RING_C * (1 - frac));
  }

  function modeLabel(mode) {
    if (mode === "focus") return t("modeLabelFocus");
    if (mode === "short") return t("modeLabelShort");
    return t("modeLabelLong");
  }

  function updateTitle() {
    document.title = timer.running
      ? t("docTitleRunning", { time: formatClock(timer.remaining), mode: modeLabel(timer.mode) })
      : t("docTitle");
  }

  function renderClock() {
    els.clock.textContent = formatClock(timer.remaining);
    updateRing(); updateTitle();
  }

  function updateDots() {
    const count = state.settings.longEvery;
    const filled = timer.mode === "long" ? count : timer.cycle % count;
    els.dots.replaceChildren(...Array.from({ length: count }, (_, i) => {
      const dot = document.createElement("span");
      dot.className = `dot${i < filled ? " is-filled" : ""}`;
      return dot;
    }));
  }

  function renderTimerUI() {
    document.body.dataset.mode = timer.mode;

    $$(".chip", els.modeChips).forEach(chip => {
      chip.classList.toggle("is-active", chip.dataset.mode === timer.mode);
    });

    const paused = !timer.running && timer.remaining < timer.total;
    els.startPause.textContent = timer.running ? t("pause")
      : (paused ? t("resume") : t("start"));

    if (noteKey) els.note.textContent = t(noteKey);
    else if (paused) els.note.textContent = t("notePaused");
    else if (timer.mode === "focus") els.note.textContent = t("noteFocus");
    else if (timer.mode === "short") els.note.textContent = t("noteShort");
    else els.note.textContent = t("noteLong");

    renderClock(); updateDots();
  }

  function stopTicking() {
    clearInterval(timer.handle);
    timer.handle = null;
    timer.running = false;
  }

  function startTimer() {
    if (timer.running) return;
    if (timer.remaining <= 0) timer.remaining = timer.total;
    noteKey = "";
    timer.running = true;
    // Oturum günü yalnızca yeni oturumda belirlenir; duraklatıp
    // devam ettirmek günü değiştirmez (gece yarısı kredisi doğru kalsın).
    if (!timer.startDay) timer.startDay = todayKey();
    timer.endAt = Date.now() + timer.remaining * 1000;
    timer.handle = setInterval(tick, 200);
    requestNotificationPermission();
    renderTimerUI();
  }

  function pauseTimer() {
    if (!timer.running) return;
    timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
    stopTicking(); renderTimerUI();
  }

  function tick() {
    const left = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
    if (left !== timer.remaining) { timer.remaining = left; renderClock(); }
    if (left <= 0) completeTimer();
  }

  function setMode(mode, options = {}) {
    stopTicking();
    timer.mode = mode;
    timer.total = durationFor(mode);
    timer.remaining = timer.total;
    timer.startDay = ""; // yeni mod = yeni oturum
    noteKey = options.noteKey || "";
    renderTimerUI();
    if (options.autoStart) startTimer();
  }

  function completeTimer() {
    stopTicking();
    const finished = timer.mode;
    chime();

    if (finished === "focus") {
      // Kredi, oturumun başladığı süreye ve güne göre — ayarlar
      // oturum sırasında değişse veya gece yarısı geçilse bile doğru kalır.
      const minutes = Math.max(1, Math.round(timer.total / 60));
      const creditDay = timer.startDay || todayKey();
      timer.startDay = "";

      recordHistory(creditDay, "focus", minutes);

      // Orman: tamamlanan her odak oturumu bir ağaç diker (v3.3)
      recordHistory(creditDay, "sessions", 1);
      state.stats.forestTotal = (state.stats.forestTotal || 0) + 1;

      // Gün içinde sayaç: yalnızca oturum bugün başladıysa artar.
      // Dün başlayan oturumun kredisi geçmişe zaten yazıldı.
      if (creditDay === todayKey()) {
        state.stats.focusMinutes += minutes;
        ensureToday();
      }

      const task = activeTask();
      if (task) { task.focus = (task.focus || 0) + minutes; }

      timer.cycle += 1;
      save(); renderStats(); renderStatsCard(); renderTasks();

      const longBreak = timer.cycle % state.settings.longEvery === 0;
      notify(t("notifFocusTitle"),
        longBreak ? t("notifFocusBodyLong") : t("notifFocusBodyShort"));
      setMode(longBreak ? "long" : "short", {
        noteKey: longBreak ? "noteLongReady" : "noteShortReady",
        autoStart: state.settings.autoStart
      });
      showToast(t("toastFocusDone"));
    } else {
      notify(t("notifBreakTitle"), t("notifBreakBody"));
      setMode("focus", { noteKey: "noteFocusReady", autoStart: state.settings.autoStart });
      showToast(t("toastBreakDone"));
    }
  }

  function chime() {
    if (!state.settings.sound) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const now = audioCtx.currentTime;
      [659.25, 880, 1174.66].forEach((freq, i) => {
        const start = now + i * 0.18;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(start); osc.stop(start + 0.45);
      });
    } catch {}
  }

  function requestNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    try { Notification.requestPermission(); } catch {}
  }

  function notify(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    try { new Notification(title, { body }); } catch {}
  }

  /* Pencere boyu değişince (mobil döndürme, masaüstü küçültme) orman
     yeniden konumlanır: bugünün ağaçları görünümda kalsın */
  {
    let forestResizeT;
    window.addEventListener("resize", () => {
      clearTimeout(forestResizeT);
      forestResizeT = setTimeout(scrollForestToToday, 150);
    });
  }

  /* ---------- Olaylar ---------- */
  function bindEvents() {
    els.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = els.input.value.trim();
      if (!text) return;
      state.tasks.unshift({
        id: uid(), text: text.slice(0, 120), done: false,
        createdAt: Date.now(), doneAt: null,
        priority: 0, focus: 0, parentId: null
      });
      save(); renderTasks();
      els.form.reset(); focusField(els.input);
    });

    els.filters.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      state.filter = chip.dataset.filter;
      save(); renderTasks();
    });

    els.search.addEventListener("input", () => {
      state.search = els.search.value.slice(0, 80);
      save(); renderTasks();
    });

    els.focusTaskClear.addEventListener("click", () => setActiveTask(null));

    els.helpToggle.addEventListener("click", openShortcuts);
    els.shortcutsClose.addEventListener("click", closeShortcuts);
    els.shortcutsDialog.addEventListener("click", (e) => {
      // kart dışına tıklayınca kapat
      if (e.target === els.shortcutsDialog) closeShortcuts();
    });

    /* ---------- GitHub yıldız durumu ----------
       Rozet her yerde görünür; yıldız sayısı api.github.com'dan alınır,
       6 saatliğine localStorage'a önbelleklenir. Çevrimdışıysa sayı gizlenir,
       rozet yine de depoya bağlantı verir.
       Mobil (Capacitor) sürümde klavye kısayolları anlamsız olduğundan
       soru işareti düğmesi gizlenir; yıldız durumu onun yerini alır. */
    const IS_NATIVE_APP =
      typeof window !== "undefined" &&
      !!window.Capacitor &&
      (typeof window.Capacitor.isNativePlatform === "function"
        ? window.Capacitor.isNativePlatform()
        : true);
    if (IS_NATIVE_APP && els.helpToggle) els.helpToggle.hidden = true;

    /* Yıldız rozetine dokununca depo adresi açılır. Web'de bağlantı zaten
       yeni sekmede açılır; mobilde WebView'in davranışı belirsiz olduğu için
       sistem tarayıcısı (Browser eklentisi) üzerinden aç, olmazsa aynı pencerede
       git — Android geri tuşu uygulamaya döndürür. */
    if (els.ghStar) {
      els.ghStar.addEventListener("click", (e) => {
        if (!IS_NATIVE_APP) return; /* web: varsayılan <a> davranışı */
        e.preventDefault();
        const url = els.ghStar.getAttribute("href");
        const browser = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
        if (browser && typeof browser.open === "function") {
          browser.open({ url }).catch(() => { location.href = url; });
        } else if (!window.open(url, "_blank")) {
          location.href = url;
        }
      });
    }

    const GH_REPO = "firatnexus/small-steps";
    const GH_CACHE_KEY = "ss.ghStars";
    const GH_TTL = 6 * 60 * 60 * 1000; /* 6 saat */
    const formatStars = (n) =>
      typeof n !== "number" || !isFinite(n)
        ? ""
        : n < 1000
          ? String(n)
          : n < 10000
            ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k"
            : Math.round(n / 1000) + "k";
    const renderGhCount = (n) => {
      const text = formatStars(n);
      if (els.ghStarCount) els.ghStarCount.textContent = text;
    };
    if (els.ghStar && typeof fetch === "function") {
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem(GH_CACHE_KEY)); } catch { /* bozuk kayıt */ }
      const fresh = cached && typeof cached.n === "number" && Date.now() - cached.t < GH_TTL;
      if (fresh) renderGhCount(cached.n);
      fetch(`https://api.github.com/repos/${GH_REPO}`, { headers: { Accept: "application/vnd.github+json" } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d || typeof d.stargazers_count !== "number") return;
          renderGhCount(d.stargazers_count);
          try {
            localStorage.setItem(GH_CACHE_KEY, JSON.stringify({ n: d.stargazers_count, t: Date.now() }));
          } catch { /* depo dolu olabilir */ }
        })
        .catch(() => { /* çevrimdışı: önbellekteki değer kalır */ });
    }

    els.exportData.addEventListener("click", exportBackup);
    els.exportCsv.addEventListener("click", exportTasksCsv);
    els.importData.addEventListener("click", () => els.importFile.click());
    els.importFile.addEventListener("change", () => {
      const file = els.importFile.files?.[0];
      els.importFile.value = "";
      if (file) importBackup(file);
    });

    els.importTodoist.addEventListener("click", () => els.importTodoistFile.click());
    els.importTodoistFile.addEventListener("change", () => {
      const file = els.importTodoistFile.files?.[0];
      els.importTodoistFile.value = "";
      if (file) importTodoistCsv(file);
    });

    els.clearDone.addEventListener("click", () => {
      /* Tamamlanan görevler kalkar. Tamamlanmış bir üst görevin AÇIK alt
         görevleri silinmez — üst seviyeye terfi eder (yetim kalmamaları için).
         Toast sayısı, fiilen kaldırılan (tamamlanmış) kayıt sayısını verir. */
      const doneTasks = state.tasks.filter(t => t.done);
      if (!doneTasks.length) return;

      const snapshot = state.tasks.slice();
      const doneIds = new Set(doneTasks.map(t => t.id));
      const removed = doneTasks.slice();
      // Terfi, görev nesnelerini yerinde değiştirdiği için özgün ebeveynler
      // mutasyondan ÖNCE ayrıca kaydedilmeli (anlık görüntü referans paylaşır).
      const origParents = new Map(state.tasks.map(t => [t.id, t.parentId]));

      state.tasks = state.tasks.filter(t => !doneIds.has(t.id));
      for (const task of state.tasks) {
        if (task.parentId && doneIds.has(task.parentId)) task.parentId = null;
      }
      save(); renderTasks();
      showToast(t("toastCleared", { n: removed.length }), t("toastUndo"), () => {
        restoreTasks(removed, snapshot);
        // Terfi edilen alt görevlerin parentId'sini geri getir — ama yalnızca
        // terfi sırasında kendi alt görevini edinmediyse. Edinmişse üst seviyede
        // kalır (tek seviye kuralı): ebeveynin altına geri konursa yeni alt
        // görevi iki seviye derine gömülür ve listede görünmez olur.
        for (const task of state.tasks) {
          if (!task.parentId && origParents.get(task.id)) {
            const hasOwnKids = state.tasks.some(t => t.parentId === task.id);
            if (!hasOwnKids) task.parentId = origParents.get(task.id);
          }
        }
        save(); renderTasks(); renderFocusTask();
      });
    });

    els.startPause.addEventListener("click", () => {
      if (timer.running) pauseTimer(); else startTimer();
    });
    els.reset.addEventListener("click", () => {
      stopTicking();
      timer.total = durationFor(timer.mode);
      timer.remaining = timer.total;
      timer.startDay = ""; // sıfırla = yeni oturum
      noteKey = ""; renderTimerUI();
    });
    els.skip.addEventListener("click", () => {
      stopTicking();
      if (timer.mode === "focus") setMode("short", { noteKey: "noteSkippedFocus" });
      else setMode("focus", { noteKey: "noteSkippedBreak" });
    });

    els.modeChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      setMode(chip.dataset.mode);
    });

    els.setFocus.addEventListener("change", (e) => {
      state.settings.focus = clampInt(e.target.value, 1, 90, DEFAULT_SETTINGS.focus);
      e.target.value = state.settings.focus;
      save(); onDurationsChanged();
    });
    els.setShort.addEventListener("change", (e) => {
      state.settings.short = clampInt(e.target.value, 1, 30, DEFAULT_SETTINGS.short);
      e.target.value = state.settings.short;
      save(); onDurationsChanged();
    });
    els.setLong.addEventListener("change", (e) => {
      state.settings.long = clampInt(e.target.value, 1, 60, DEFAULT_SETTINGS.long);
      e.target.value = state.settings.long;
      save(); onDurationsChanged();
    });
    els.setEvery.addEventListener("change", (e) => {
      state.settings.longEvery = clampInt(e.target.value, 2, 8, DEFAULT_SETTINGS.longEvery);
      e.target.value = state.settings.longEvery;
      save(); updateDots();
    });
    els.setAuto.addEventListener("change", (e) => {
      state.settings.autoStart = e.target.checked; save();
    });
    els.setSound.addEventListener("change", (e) => {
      state.settings.sound = e.target.checked; save();
      if (e.target.checked) chime();
    });

    els.langSelect.addEventListener("change", (e) => {
      setLanguage(e.target.value);
    });

    document.addEventListener("keydown", (e) => {
      const target = e.target;
      const typing = target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" ||
         target.tagName === "SELECT" || target.isContentEditable);

      if (e.key === "Escape" && typing && target === els.input) {
        els.input.blur(); return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (timer.running) pauseTimer(); else startTimer();
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault(); els.input.focus();
        return;
      }
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        els.shortcutsDialog.open ? closeShortcuts() : openShortcuts();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && timer.running) tick();
    });

    onLanguageChange(() => {
      renderTasks();
      renderTimerUI();
      renderStatsCard();
      const currentTheme = document.documentElement.dataset.theme || "light";
      applyTheme(currentTheme);
    });
  }

  function onDurationsChanged() {
    if (!timer.running) {
      timer.total = durationFor(timer.mode);
      timer.remaining = timer.total;
      noteKey = "";
    }
    renderTimerUI();
  }

  function syncSettingsInputs() {
    els.setFocus.value = state.settings.focus;
    els.setShort.value = state.settings.short;
    els.setLong.value  = state.settings.long;
    els.setEvery.value = state.settings.longEvery;
    els.setAuto.checked  = state.settings.autoStart;
    els.setSound.checked = state.settings.sound;
  }

  /* ---------- Dil menüsü (v3.6.1) ----------
     Yerel <select> açılır listesi mobilde ekranın ortasında kopuk, büyük bir
     sistem diyaloğu olarak açılıyordu. Yerine tetikleyiciye bağlı bir liste
     (WAI-ARIA "select-only combobox / listbox" deseni) kullanılır.
     - Gizli #lang-select tek doğruluk kaynağıdır: seçim ona yazılır ve
       "change" olayı tetiklenir → mevcut setLanguage akışı aynen çalışır.
     - Liste görünür alana sığmazsa kendi içinde kayar (max-height, JS).
     - Dışarı dokununca, Esc'te, seçimde ve Tab ile kapanır.
     - Odak hareketleri preventScroll ile yapılır; sayfa kaydırılmaz. */
  function initLangMenu() {
    const menu = $("#lang-menu");
    const trigger = $("#lang-trigger");
    const label = $("#lang-trigger-label");
    const list = $("#lang-list");
    const select = els.langSelect;
    if (!menu || !trigger || !list || !select) return;

    const CHECK = '<svg class="lang-check" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const focusNoScroll = (el) => { try { el.focus({ preventScroll: true }); } catch { el.focus(); } };

    function build() {
      list.replaceChildren(...Array.from(select.options).map((opt, i) => {
        const li = document.createElement("li");
        li.id = `lang-opt-${opt.value}`;
        li.className = "lang-option";
        li.setAttribute("role", "option");
        li.dataset.value = opt.value;
        li.tabIndex = -1;
        li.lang = opt.value;
        const name = document.createElement("span");
        name.className = "lang-option-name";
        name.textContent = opt.textContent;
        li.append(name);
        li.insertAdjacentHTML("beforeend", CHECK);
        return li;
      }));
      sync();
    }

    function sync() {
      const current = select.value;
      const opt = select.selectedOptions[0];
      label.textContent = opt ? opt.textContent : current;
      list.querySelectorAll(".lang-option").forEach((li) => {
        li.setAttribute("aria-selected", li.dataset.value === current ? "true" : "false");
      });
    }

    const options = () => Array.from(list.querySelectorAll(".lang-option"));
    const isOpen = () => trigger.getAttribute("aria-expanded") === "true";

    /* Listeyi tetikleyicinin hemen altına, görünür alan içinde yerleştirir.
       Genişlik: tetikleyiciden dar olmaz, ekrandan taşmaz. Alt boşluk yetmezse
       yükseklik kısılır ve liste kendi içinde kayar. */
    function place() {
      const vv = window.visualViewport;
      const vh = vv ? vv.height : window.innerHeight;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const r = trigger.getBoundingClientRect();
      const gap = 6, margin = 12;
      const width = Math.min(Math.max(r.width, 220), vw - margin * 2);
      list.style.minWidth = `${width}px`;
      list.style.maxWidth = `${vw - margin * 2}px`;
      /* Yatay taşma: başlangıç kenarından hizala, gerekirse içeri kaydır */
      list.style.setProperty("--lang-shift", "0px");
      const rtl = document.documentElement.dir === "rtl";
      const lr = list.getBoundingClientRect();
      let shift = 0;
      if (!rtl && lr.right > vw - margin) shift = (vw - margin) - lr.right;
      if (rtl && lr.left < margin) shift = margin - lr.left;
      list.style.setProperty("--lang-shift", `${shift}px`);
      const avail = Math.max(160, vh - (r.bottom - (vv ? vv.offsetTop : 0)) - gap - margin);
      list.style.maxHeight = `${Math.min(avail, 420)}px`;
    }

    function keepVisible(li) {
      /* scrollIntoView sayfayı da kaydırabilir; yalnızca listeyi kaydır */
      const top = li.offsetTop, bottom = top + li.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top - 4;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 4;
    }

    function setActive(li) {
      if (!li) return;
      options().forEach((o) => o.classList.toggle("is-active", o === li));
      list.setAttribute("aria-activedescendant", li.id);
      focusNoScroll(li);
      keepVisible(li);
    }

    function open() {
      if (isOpen()) return;
      sync();
      list.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      menu.classList.add("is-open");
      place();
      /* Bir sonraki karede açılış geçişi başlar (opacity/transform) */
      requestAnimationFrame(() => list.classList.add("is-open"));
      setActive(options().find((o) => o.dataset.value === select.value) || options()[0]);
      document.addEventListener("pointerdown", onOutside, true);
      window.addEventListener("resize", place);
      window.visualViewport?.addEventListener("resize", place);
    }

    function close({ restoreFocus = true } = {}) {
      if (!isOpen()) return;
      trigger.setAttribute("aria-expanded", "false");
      menu.classList.remove("is-open");
      list.classList.remove("is-open");
      list.hidden = true;
      list.removeAttribute("aria-activedescendant");
      document.removeEventListener("pointerdown", onOutside, true);
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      if (restoreFocus) focusNoScroll(trigger);
    }

    function choose(value) {
      if (value && value !== select.value) {
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      sync();
      close();
    }

    function onOutside(e) {
      if (!menu.contains(e.target)) close({ restoreFocus: false });
    }

    trigger.addEventListener("click", () => (isOpen() ? close() : open()));
    trigger.addEventListener("keydown", (e) => {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault(); e.stopPropagation(); // Space zamanlayıcı kısayoluna gitmesin
        open();
        if (e.key === "ArrowUp") { const o = options(); setActive(o[o.length - 1]); };
      } else if (e.key === "Escape" && isOpen()) {
        e.preventDefault(); e.stopPropagation(); close();
      }
    });

    list.addEventListener("click", (e) => {
      const li = e.target.closest(".lang-option");
      if (li) choose(li.dataset.value);
    });
    list.addEventListener("keydown", (e) => {
      const opts = options();
      const i = opts.indexOf(document.activeElement);
      e.stopPropagation(); // sayfa kısayolları (Space, N, ?) menü açıkken çalışmaz
      switch (e.key) {
        case "ArrowDown": e.preventDefault(); setActive(opts[Math.min(i + 1, opts.length - 1)]); break;
        case "ArrowUp":   e.preventDefault(); setActive(opts[Math.max(i - 1, 0)]); break;
        case "Home":      e.preventDefault(); setActive(opts[0]); break;
        case "End":       e.preventDefault(); setActive(opts[opts.length - 1]); break;
        case "Enter":
        case " ":         e.preventDefault(); if (opts[i]) choose(opts[i].dataset.value); break;
        case "Escape":    e.preventDefault(); close(); break;
        case "Tab":       close({ restoreFocus: false }); break;
        default: {
          /* Harfle atlama: dil adının ilk harfi */
          if (e.key.length === 1) {
            const k = e.key.toLocaleLowerCase();
            const start = i + 1;
            const hit = [...opts.slice(start), ...opts.slice(0, start)]
              .find((o) => o.textContent.trim().toLocaleLowerCase().startsWith(k));
            if (hit) setActive(hit);
          }
        }
      }
    });
    list.addEventListener("pointermove", (e) => {
      const li = e.target.closest(".lang-option");
      if (li && !li.classList.contains("is-active")) setActive(li);
    });

    /* Dil başka yoldan değişirse (yedekten geri yükleme, ilk açılış) etiket güncel kalsın */
    onLanguageChange(sync);
    build();
  }

  /* ---------- Başlat ---------- */
  function init() {
    buildLangSelect(els.langSelect);
    initTheme();
    syncSettingsInputs();
    els.search.value = state.search || "";

    timer.mode = "focus";
    timer.total = durationFor("focus");
    timer.remaining = timer.total;

    bindEvents();

    const initialLang = detectInitialLang();
    els.langSelect.value = initialLang;
    initLangMenu();
    applyLanguage(initialLang);

    setInterval(() => {
      const before = state.stats.date;
      ensureToday();
      if (before !== state.stats.date) { save(); renderStats(); renderStatsCard(); }
    }, 60_000);

    /* SW güncellemesi geldiğinde otomatik tazeleme için: sayfa şu an
       tazelenebilir mi? Çalışan VEYA duraklatılmış ama ilerlemiş bir odak
       oturumu varsa, hızlı ekleme / görev düzenleme / alt görev kutularında
       yazılan taslak varsa tazeleme güvenli ana dek bekletilir
       (index.html'deki güncelleme akışı bu işlevi yoklar). */
    window.__smallStepsSafeToReload = () => {
      const sessionInProgress = timer.running || timer.remaining < timer.total;
      const drafts = [els.input, document.querySelector(".edit-input"),
                      document.querySelector(".subtask-add input")];
      const hasDraft = drafts.some((el) => el && el.value.trim() !== "");
      return !sessionInProgress && !hasDraft;
    };

    /* Açılış ekranı: en az ~0,55 sn GÖRÜNÜR kaldıktan sonra soluklaşır.
       Çift requestAnimationFrame ilk kareyi garantiler. Süre sayfa
       görünür olana dek başlamaz: kurulu uygulamada soğuk açılışta
       belge Android'in yerel açılış ekranı arkasında gizli yüklenir;
       performans.now() o ana kadar işlemiş olacağından bekleme sıfır
       kalır ve ekran kullanıcı görmeden solup giderdi. */
    const splashEl = document.getElementById("splash");
    if (splashEl) {
      const splashTemplate = splashEl.cloneNode(true);
      const playSplash = () => {
        const node = document.getElementById("splash") ||
                     document.body.appendChild(splashTemplate.cloneNode(true));
        /* Belge gizli yüklenmişse CSS giriş animasyonları arka planda
           bitmiş olabilir; görünür olunca bir kez daha oynat. */
        node.querySelectorAll(".splash-logo, .splash-name, .splash-tag")
          .forEach((el) => {
            el.style.animation = "none";
            void el.offsetHeight; /* reflow: animasyonu sıfırla */
            el.style.animation = "";
          });
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              node.classList.add("splash-hide");
              setTimeout(() => node.remove(), 600);
            }, 550);
          });
        });
      };
      if (document.visibilityState === "visible") {
        playSplash();
      } else {
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") playSplash();
        }, { once: true });
      }
      /* Kurulu uygulama arka plandan HATIRLANINCA (belge yeniden
         yüklenmeden dönerse) açılış ekranı yeniden oynatılır — yalnızca
         kurulu uygulama kipinde (standalone); normal tarayıcıda sekme
         değiştirmek ekranı tetiklemez. Ekran yalnızca bir örtüdür:
         zamanlayıcıyı, taslakları ve uygulama durumunu değiştirmez. */
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        if (document.getElementById("splash")) return; /* zaten oynuyor */
        if (window.matchMedia &&
            window.matchMedia("(display-mode: standalone)").matches) {
          playSplash();
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
