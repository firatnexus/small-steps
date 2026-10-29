#!/usr/bin/env node
/* ============================================================
   CI: uygulama mantığı testleri (tarayıcı gerektirmez)
   ------------------------------------------------------------
   Gerçek index.html + translations.js + app.js dosyalarını jsdom
   içinde çalıştırır: testler kopya implementasyon değil, bizzat
   üretim kodunu tarayıcı benzeri bir ortamda kullanır.
   Kullanım: node tools/test-app.js
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const translationsSrc = fs.readFileSync(path.join(root, "translations.js"), "utf8");
const appSrc = fs.readFileSync(path.join(root, "app.js"), "utf8");

const STORAGE_KEY = "small-steps-v2";
const HISTORY_KEY = "small-steps-history";

let pass = 0, fail = 0;
async function test(title, fn) {
  try {
    await fn();
    pass++;
    console.log("  ✓ " + title);
  } catch (err) {
    fail++;
    console.error("  ✗ " + title + "\n    " + (err && err.message ? err.message : err));
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "Beklenen koşul sağlanmadı"); };
const eq = (a, b, msg) => { if (a !== b) throw new Error(msg || `Beklenen: ${JSON.stringify(b)} • Gelen: ${JSON.stringify(a)}`); };

/* Her test senaryosu taze bir DOM + uygulama örneği alır.
   app.js DOMContentLoaded'ı bekleyebildiği için hazır olana dek beklenir. */
async function launch(seed) {
  const dom = new JSDOM(html, {
    url: "https://smallsteps.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const w = dom.window;

  if (seed && seed.state) w.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed.state));
  if (seed && seed.history) w.localStorage.setItem(HISTORY_KEY, JSON.stringify(seed.history));

  /* CSV indirmesini yakalamak için: tıklamayı ve blob'u kayda geçir.
     jsdom Blob#text() sunmadığından metin kurucudan yakalanır. */
  const OrigBlob = w.Blob;
  w.Blob = class extends OrigBlob {
    constructor(parts, opts) {
      super(parts, opts);
      this.__text = Array.isArray(parts) ? parts.map(p => String(p)).join("") : String(parts);
    }
  };
  w.URL.createObjectURL = (blob) => { w.__lastBlob = blob; return "blob:test"; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    w.__lastDownload = { href: this.getAttribute("href"), name: this.getAttribute("download") };
  };

  w.eval(translationsSrc);
  w.eval(appSrc);

  if (w.document.readyState === "loading") {
    await new Promise((resolve) => w.document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }
  return dom;
}

const $ = (dom, sel) => dom.window.document.querySelector(sel);
const $$ = (dom, sel) => Array.from(dom.window.document.querySelectorAll(sel));

function readState(dom) {
  return JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY) || "{}");
}
function readHistory(dom) {
  return JSON.parse(dom.window.localStorage.getItem(HISTORY_KEY) || "{}");
}
function todayKey(date = new Date()) {
  const d = date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/* save() 120 ms debounce'lu olduğundan kalıcı depoya yazılmasını bekle */
const settled = (ms = 250) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log("\n— Eski veri uyumluluğu (v3.0.1 yedeği parentId olmadan) —");
  {
    const dom = await launch({
      state: {
        tasks: [
          { id: "t1", text: "Eski görev", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0 },
          { id: "t2", text: "Eski tamamlanan", done: true, createdAt: 1, doneAt: Date.now(), priority: 1, focus: 10 }
        ],
        settings: { focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false, sound: true },
        stats: { date: todayKey(), focusMinutes: 0 }, filter: "all", search: "", activeTaskId: null
      }
    });
    await test("Görevler yüklenir ve üst seviye kabul edilir", () => {
      eq($$(dom, "#task-list .task").length, 2);
      eq($$(dom, "#task-list .task.subtask").length, 0);
    });
    await test("Rozet yalnız üst görevleri sayar", () => {
      eq($(dom, "#count-badge").textContent.trim(), "1 / 2");
    });
    dom.window.close();
  }

  console.log("\n— Alt görev ekleme ve tamamlama —");
  {
    const dom = await launch();
    const w = dom.window;

    // Üst görev ekle
    w.document.querySelector("#task-input").value = "Yazı projesi";
    w.document.querySelector("#task-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
    assert($$(dom, "#task-list .task").length === 1, "üst görev eklenmedi");

    // Alt görev ekle: ＋ düğmesine bas, satır içi girişe yaz, Enter
    w.document.querySelector(".subtask-btn").click();
    const input = w.document.querySelector(".subtask-add input");
    assert(input, "alt görev giriş satırı açılmadı");
    input.value = "Giriş bölümünü yaz";
    input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    await settled();

    await test("Alt görev ebeveynin altında render edilir", () => {
      eq($$(dom, "#task-list .task.subtask").length, 1);
      const items = $$(dom, "#task-list .task");
      eq(items.length, 2);
      const st = readState(dom);
      const parent = st.tasks.find(t => !t.parentId);
      const kid = st.tasks.find(t => t.parentId);
      assert(parent && kid, "ebeveyn/alt görev bulunamadı");
      eq(kid.parentId, parent.id, "alt görevin parentId'si ebeveyne ait değil");
      assert(items[1].classList.contains("subtask"), "ikinci satır alt görev değil");
      eq(items[0].dataset.id, parent.id, "üst görev ilk sırada değil");
    });
    await test("Kalıcı depoya parentId ile yazılır", () => {
      const st = readState(dom);
      eq(st.tasks.length, 2);
      assert(st.tasks[1].parentId === "t" ? true : typeof st.tasks[1].parentId === "string", "parentId kaydedilmedi");
      assert(st.tasks.some(t => t.parentId === st.tasks.find(x => !x.parentId).id), "parentId ebeveynle eşleşmiyor");
    });
    await test("Ebeveynde 0/1 ilerleme rozeti görünür", () => {
      const pill = $(dom, ".subtask-pill");
      assert(pill, "rozet yok");
      eq(pill.textContent, "0/1");
    });

    // Alt görevi tamamla
    const subItem = $(dom, "#task-list .task.subtask");
    subItem.querySelector('input[type="checkbox"]').click();
    await settled();
    await test("Alt görev tamamlanınca rozet 1/1 olur", () => {
      eq($(dom, ".subtask-pill").textContent, "1/1");
    });
    await test("Alt görev tamamlaması günlük istatistiğe işlenmez", () => {
      const h = readHistory(dom);
      eq(h[todayKey()]?.done || 0, 0, "alt görev istatistiği arttı");
    });
    await test("Rozet yalnız üst görevleri sayar (0 / 1)", () => {
      eq($(dom, "#count-badge").textContent.trim(), "0 / 1");
    });

    // Üst görevi tamamla
    const topItem = $(dom, "#task-list .task:not(.subtask)");
    topItem.querySelector('input[type="checkbox"]').click();
    await settled();
    await test("Üst görev tamamlaması istatistiğe işlenir", () => {
      const h = readHistory(dom);
      eq(h[todayKey()]?.done || 0, 1);
    });

    // Ağaç silme + geri alma
    w.document.querySelector(".task:not(.subtask) .danger").click();
    await settled();
    await test("Üst görev silinince alt görevleri de gider", () => {
      eq($$(dom, "#task-list .task").length, 0);
      eq(readState(dom).tasks.length, 0);
    });
    await test("Toast geri alması tüm ağacı eski sırasıyla geri getirir", async () => {
      w.document.querySelector("#toast button").click();
      await settled();
      eq(readState(dom).tasks.length, 2);
      assert(readState(dom).tasks[1].parentId, "alt görev parentId'sini kaybetti");
      eq($$(dom, "#task-list .task").length, 2);
    });

    // REGRESYON: toast açıkken eklenen yeni görev, geri almada kaybolmamalı
    w.document.querySelector(".task:not(.subtask) .danger").click();
    await settled();
    w.document.querySelector("#task-input").value = "Toast açıkken eklenen";
    w.document.querySelector("#task-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
    await settled();
    await test("Geri alma, araya eklenen yeni görevi korur", async () => {
      w.document.querySelector("#toast button").click();
      await settled();
      const st = readState(dom);
      eq(st.tasks.length, 3, "silinen ağaç + yeni görev bekleniyordu");
      assert(st.tasks.some(t => t.text === "Toast açıkken eklenen"), "yeni görev geri almada kayboldu");
      assert(st.tasks.some(t => t.parentId), "silinen alt görev geri gelmedi");
    });
    dom.window.close();
  }

  console.log("\n— Arama ve filtre (gruplu davranış) —");
  {
    const parentId = "p1";
    const dom = await launch({
      state: {
        tasks: [
          { id: parentId, text: "Spor salonu", done: true, createdAt: 1, doneAt: 2, priority: 0, focus: 0 },
          { id: "c1", text: "Spor çantasını hazırla", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, parentId }
        ],
        settings: { focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false, sound: true },
        stats: { date: todayKey(), focusMinutes: 0 }, filter: "all", search: "", activeTaskId: null
      }
    });
    const w = dom.window;

    await test("Alt görev araması ebeveyni de listeye çıkarır", () => {
      w.document.querySelector("#task-search").value = "çantasını";
      w.document.querySelector("#task-search").dispatchEvent(new w.Event("input"));
      eq($$(dom, "#task-list .task").length, 2);
    });
    await test("Eşleşmeyen arama boş durum gösterir", () => {
      w.document.querySelector("#task-search").value = "yokboyle";
      w.document.querySelector("#task-search").dispatchEvent(new w.Event("input"));
      eq($$(dom, "#task-list .task").length, 0);
      assert(!$(dom, "#empty-state").hidden, "boş durum görünmüyor");
    });

    w.document.querySelector('[data-filter="active"]').click();
    w.document.querySelector("#task-search").value = "";
    w.document.querySelector("#task-search").dispatchEvent(new w.Event("input"));
    await test("Aktif filtresi tamamlanmış üst görevi gizler", () => {
      eq($$(dom, "#task-list .task").length, 0);
    });

    w.document.querySelector('[data-filter="done"]').click();
    await test("Tamamlanan filtresi üst görevi alt görevleriyle gösterir", () => {
      eq($$(dom, "#task-list .task").length, 2);
    });
    dom.window.close();
  }

  console.log("\n— CSV dışa aktarma —");
  {
    // Özel karakterli görevler doğrudan durum ile tohumlanır:
    // tek satırlık form girişi satır sonunu korumaz.
    const dom = await launch({
      state: {
        tasks: [
          { id: "csv1", text: 'Süt, "ekmek" al\nve çay', done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0 },
          { id: "csv2", text: "İkinci satır, \"alıntı\"", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, parentId: "csv1" }
        ],
        settings: { focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false, sound: true },
        stats: { date: todayKey(), focusMinutes: 0 }, filter: "all", search: "", activeTaskId: null
      }
    });
    const w = dom.window;

    w.document.querySelector("#export-csv").click();
    await test("İndirme tetiklenir ve dosya adı tarihlidir", () => {
      assert(w.__lastDownload, "indirme yok");
      assert(/^small-steps-tasks-\d{4}-\d{2}-\d{2}\.csv$/.test(w.__lastDownload.name), "dosya adı: " + w.__lastDownload.name);
    });
    const csv = w.__lastBlob.__text;
    await test("UTF-8 BOM ile başlar ve başlık satırı tamdır", () => {
      assert(csv.charCodeAt(0) === 0xFEFF, "BOM yok");
      assert(csv.startsWith("\uFEFF\"type\",\"text\",\"done\",\"priority\",\"focus_minutes\",\"parent_text\",\"repeat\",\"due_date\",\"created_at\",\"completed_at\""), "başlık yanlış (v3.2 sütunları: repeat, due_date)");
    });
    await test("Virgül ve tırnak içeren metin RFC 4180'e göre kaçırılır", () => {
      assert(csv.includes('"Süt, ""ekmek"" al\nve çay"'), "özel karakterli metin kaçırılmadı: " + JSON.stringify(csv));
    });
    await test("Alt görev satırı parent_text ile gelir", () => {
      assert(csv.includes('"İkinci satır, ""alıntı"""'), "alt görev metni yok");
      assert(csv.includes('"task"'), "tip sütunu yok");
    });
    await test("Satır sonları CRLF kullanır", () => {
      assert(csv.includes("\r\n"), "CRLF yok");
    });
    dom.window.close();
  }

  console.log("\n— Bozuk veri temizleme (içe aktarma doğrulaması) —");
  {
    const dom = await launch({
      state: {
        tasks: [
          { id: "a", text: "Yetim alt görev", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, parentId: "yok" },
          { id: "b", text: "Kendini ebeveyn yapan", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, parentId: "b" },
          { id: "c", text: "Üst görev", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0 },
          { id: "c", text: "Yinelenen id", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0 },
          { id: "d", text: "Alt görev", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, parentId: "c" },
          { id: "e", text: "Alt görevin altı", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, parentId: "d" }
        ],
        settings: { focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false, sound: true },
        stats: { date: todayKey(), focusMinutes: 0 }, filter: "all", search: "", activeTaskId: null
      }
    });
    await settled();
    await test("Yetim, kendini işaret eden ve yinelenen kayıtlar düzeltilir", () => {
      const st = readState(dom);
      // yinelenen "c" atılır → 5 kayıt; "e" (ebeveyni alt görev) üst seviyeye alınır
      eq(st.tasks.length, 5);
      const orphan = st.tasks.find(t => t.text === "Yetim alt görev");
      eq(orphan.parentId, null, "yetim parentId temizlenmedi");
      const selfParent = st.tasks.find(t => t.text === "Kendini ebebeeyn yapan" || t.text.startsWith("Kendini"));
      eq(selfParent.parentId, null, "kendini ebeveyn yapan temizlenmedi");
      const nested = st.tasks.find(t => t.text === "Alt görevin altı");
      eq(nested.parentId, null, "iki seviye derinlik düzleştirilmedi");
      const kid = st.tasks.find(t => t.text === "Alt görev");
      eq(kid.parentId, "c", "geçerli alt görev bozuldu");
    });
    dom.window.close();
  }

  console.log("\n— Tamamlananları temizle (alt görev ağacıyla) —");
  {
    const dom = await launch({
      state: {
        tasks: [
          { id: "p", text: "Bitmiş iş", done: true, createdAt: 1, doneAt: 2, priority: 0, focus: 0 },
          { id: "k", text: "Hâlâ açık alt görev", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, parentId: "p" },
          { id: "q", text: "Açık üst", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0 }
        ],
        settings: { focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false, sound: true },
        stats: { date: todayKey(), focusMinutes: 0 }, filter: "all", search: "", activeTaskId: null
      }
    });
    const w = dom.window;
    w.document.querySelector("#clear-done").click();
    await settled();
    await test("Tamamlananlar kalkar; AÇIK alt görev silinmez, üst seviyeye terfi eder", () => {
      const st = readState(dom);
      eq(st.tasks.length, 2, "açık alt görev + açık üst kalmalı");
      const kid = st.tasks.find(t => t.id === "k");
      assert(kid, "açık alt görev silindi");
      eq(kid.parentId, null, "alt görev terfi ettirilmedi");
      eq(st.tasks.some(t => t.id === "p"), false, "tamamlanan üst görev kalkmadı");
      eq($$(dom, "#task-list .task").length, 2);
      eq($$(dom, "#task-list .task.subtask").length, 0, "terfi eden görev hâlâ alt görev görünüyor");
    });
    await test("Toast sayısı fiilen kaldırılan kayıt sayısını verir", () => {
      eq($(dom, "#toast").textContent.includes("1"), true, "toast sayısı yanlış");
    });
    await test("Geri alma hiyerarşiyi aynen geri getirir", async () => {
      w.document.querySelector("#toast button").click();
      await settled();
      const st = readState(dom);
      eq(st.tasks.length, 3);
      eq(st.tasks.find(t => t.id === "k").parentId, "p", "alt görevin parentId'si geri gelmedi");
    });
    dom.window.close();
  }

  console.log("\n— Terfi çakışması: geri almada tek seviye kuralı —");
  {
    // 1) Üst görev tamamla + açık alt görevi var
    // 2) Tamamlananları temizle → alt görev terfi eder
    // 3) Terfi eden göreve YENİ alt görev ekle
    // 4) Geri al → terfi eden görev üst seviyede kalmalı (yeni alt görevi
    //    iki seviyeye gömülmesin diye), her görev görünür kalmalı
    const dom = await launch({
      state: {
        tasks: [
          { id: "p", text: "Bitmiş üst", done: true, createdAt: 1, doneAt: 2, priority: 0, focus: 0 },
          { id: "k", text: "Açık alt görev", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, parentId: "p" }
        ],
        settings: { focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false, sound: true },
        stats: { date: todayKey(), focusMinutes: 0 }, filter: "all", search: "", activeTaskId: null
      }
    });
    const w = dom.window;

    w.document.querySelector("#clear-done").click();
    await settled();

    // Terfi eden göreve yeni alt görev ekle
    w.document.querySelector(".subtask-btn").click();
    const input = w.document.querySelector(".subtask-add input");
    input.value = "Terfiden sonra eklenen alt görev";
    input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    await settled();

    await test("Terfi eden görev yeni alt görevini görünür şekilde tutar", () => {
      const st = readState(dom);
      const kid = st.tasks.find(t => t.id === "k");
      assert(kid && !kid.parentId, "k henüz terfi etmedi");
      eq($$(dom, "#task-list .task").length, 2, "her görev görünür olmalı");
      eq($$(dom, "#task-list .task.subtask").length, 1);
    });

    // Geri al
    w.document.querySelector("#toast button").click();
    await settled();
    await test("Geri almada tek seviye kuralı bozulmaz: terfi eden üst seviyede kalır", () => {
      const st = readState(dom);
      eq(st.tasks.length, 3, "tamamlanan üst + terfi eden + yeni alt görev");
      const p = st.tasks.find(t => t.id === "p");
      const k = st.tasks.find(t => t.id === "k");
      const yeni = st.tasks.find(t => t.text === "Terfiden sonra eklenen alt görev");
      assert(p, "tamamlanan üst görev geri gelmedi");
      assert(yeni, "yeni alt görev kayboldu");
      assert(!k.parentId, "k geri alınınca ebeveyne geri kondu — iki seviye oluşur");
      eq(yeni.parentId, "k", "yeni alt görevin ebeveyni terfi eden görev olmalı");
    });
    await test("Her görev listede görünür durumda", () => {
      const st = readState(dom);
      const gorunen = $$(dom, "#task-list .task").length;
      eq(gorunen, st.tasks.length, "görünmeyen (iki seviyeye gömülü) görev var");
    });
    await test("Görünen her görev CSV dışa aktarmasında da yer alır", () => {
      w.document.querySelector("#export-csv").click();
      const csv = w.__lastBlob.__text;
      const satirlar = csv.split("\r\n").filter(r => r.trim());
      eq(satirlar.length, 4, "başlık + 3 görev satırı bekleniyordu");
      assert(csv.includes('"Terfiden sonra eklenen alt görev"'), "yeni alt görev CSV'de yok");
      // yeni alt görev satırı, terfi eden görevin parent_text'iyle gelmeli
      const yeniSatiri = satirlar.find(r => r.includes("Terfiden sonra eklenen"));
      assert(yeniSatiri.includes('"Açık alt görev"'), "yeni alt görevin parent_text'i terfi eden görev değil");
      assert(csv.includes('"Bitmiş üst"'), "geri gelen üst görev CSV'de yok");
    });
    dom.window.close();
  }

  console.log("\n— Tekrarlayan görevler (v3.2) —");
  {
    const ayarlar = { focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false, sound: false };
    const gorev = (id, ekstra = {}) => ({ id, text: "İlaç iç", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, ...ekstra });
    const durum = (tasks) => ({
      state: { tasks, settings: ayarlar, stats: { date: todayKey(), focusMinutes: 0 }, filter: "all", search: "", activeTaskId: null },
      history: {}
    });

    // A) Günlük tekrar: tamamla → successor doğar
    const domA = await launch(durum([gorev("r1", { repeat: "daily" })]));
    const wA = domA.window;
    wA.document.querySelector('.task[data-id="r1"] input[type="checkbox"]').click();
    await settled();
    await test("Tamamlanınca yeni occurrence doğar (geçmiş +1, dueAt = yarın)", () => {
      const st = readState(domA);
      const old = st.tasks.find(t => t.id === "r1");
      const yeni = st.tasks.find(t => t.respawnedFrom === "r1");
      assert(old && old.done === true, "eski occurrence tamamlanmadı");
      assert(yeni, "yeni occurrence doğmadı");
      eq(yeni.text, "İlaç iç", "yeni occurrence metni farklı");
      eq(yeni.repeat, "daily", "yeni occurrence tekrarı taşımadı");
      const yarın = todayKey(new Date(Date.now() + 86400000));
      eq(yeni.dueAt, yarın, "dueAt yarın olmalı");
      const h = readHistory(domA);
      eq(h[todayKey()]?.done, 1, "geçmişe +1 yazılmadı");
    });
    await test("Görsel: iki satır, rozetler; ↻ yalnız aktif occurrence'ta", () => {
      const satirlar = $$(domA, "#task-list .task");
      eq(satirlar.length, 2, "iki occurrence da görünmeli");
      const eski = $$(domA, '.task[data-id="r1"]')[0];
      const yeniSatir = $$(domA, ".task").filter(li => li.dataset.id !== "r1")[0];
      assert(eski && yeniSatir, "satırlar render olmadı");
      assert(eski.querySelectorAll(".repeat-btn").length === 0, "tamamlanmış occurrence'ta ↻ olmamalı");
      assert(yeniSatir.querySelectorAll(".repeat-btn").length === 1, "aktif occurrence'ta ↻ olmalı");
      assert(yeniSatir.querySelector(".repeat-pill"), "tekrar rozeti yok");
      assert(yeniSatir.querySelector(".due-pill"), "tarih rozeti yok");
    });

    // A devam) Tamamlananları temizle successor'a dokunmaz + geri alma
    await test("Tamamlananları temizle successor'a dokunmaz; geri alma ikisini de korur", async () => {
      wA.document.querySelector("#clear-done").click();
      await settled();
      let st = readState(domA);
      assert(!st.tasks.some(t => t.id === "r1"), "tamamlanan eski occurrence temizlenmedi");
      assert(st.tasks.some(t => t.respawnedFrom === "r1"), "successor yanlışlıkla silindi");
      wA.document.querySelector("#toast button").click();
      await settled();
      st = readState(domA);
      assert(st.tasks.some(t => t.id === "r1"), "geri alma eski occurrence'ı getirmedi");
      assert(st.tasks.some(t => t.respawnedFrom === "r1"), "geri alma successor'ı kaybettirdi");
    });

    // A devam) Yeniden başlatma çoğaltmaz (tek successor)
    await test("Yeniden başlatma successor'ı çoğaltmaz", async () => {
      const kayit = readState(domA);
      const domA2 = await launch({ state: kayit, history: readHistory(domA) });
      await settled(300);
      const st = readState(domA2);
      eq(st.tasks.filter(t => t.respawnedFrom === "r1").length, 1, "yeniden başlatma successor çoğalttı");
      domA2.window.close();
    });

    // B) Değiştirilmiş successor ile geri açma engellenir
    const domB = await launch(durum([gorev("r1", { repeat: "daily" })]));
    const wB = domB.window;
    wB.document.querySelector('.task[data-id="r1"] input[type="checkbox"]').click();
    await settled();
    {
      const st = readState(domB);
      const yeni = st.tasks.find(t => t.respawnedFrom === "r1");
      yeni.text = "İlaç iç (değişti)";
      const domB2 = await launch({ state: st, history: readHistory(domB) });
      const wB2 = domB2.window;
      await settled(300);
      const cb = wB2.document.querySelector('.task[data-id="r1"] input[type="checkbox"]');
      cb.checked = false;
      cb.dispatchEvent(new wB2.Event("change"));
      await settled();
      await test("Successor değiştiyse geri açma engellenir (iki kayıt korunur)", () => {
        const st2 = readState(domB2);
        const eski2 = st2.tasks.find(t => t.id === "r1");
        const yeni2 = st2.tasks.find(t => t.respawnedFrom === "r1");
        assert(eski2 && eski2.done === true, "engellenen geri açma görevi aktif yapmamalı");
        assert(yeni2, "yeni occurrence silinmemeli");
        eq($$(domB2, '.task[data-id="r1"] input[type="checkbox"]')[0].checked, true, "checkbox işareti kalmalı");
        const h2 = readHistory(domB2);
        eq(h2[todayKey()]?.done, 1, "geçmiş geri alınmamalı");
      });
      domB2.window.close();
    }
    domB.window.close();

    // C) Dokunulmamış successor ile geri açma: successor silinir, istatistik geri alınır
    const domC = await launch(durum([gorev("r1", { repeat: "daily" })]));
    const wC = domC.window;
    wC.document.querySelector('.task[data-id="r1"] input[type="checkbox"]').click();
    await settled();
    await test("Dokunulmamışsa geri açma successor'ı siler ve istatistiği geri alır", async () => {
      const cb = wC.document.querySelector('.task[data-id="r1"] input[type="checkbox"]');
      cb.checked = false;
      cb.dispatchEvent(new wC.Event("change"));
      await settled();
      const st = readState(domC);
      eq(st.tasks.length, 1, "successor silinmeli, eski kalmalı");
      assert(st.tasks[0].done === false, "görev geri açılmadı");
      assert(!st.tasks.some(t => t.respawnedFrom), "successor hâlâ duruyor");
      const h = readHistory(domC);
      eq(h[todayKey()]?.done, 0, "geçmiş geri alınmadı");
    });
    domC.window.close();

    // D) Hafta içi: Cuma dueAt'li görev → Pazartesi'ye doğar
    await test("Hafta içi kuralı: Cuma zamanlanmış görev Pazartesi'ye doğar", async () => {
      let d = new Date();
      while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
      const cuma = todayKey(d);
      const pazartesi = todayKey(new Date(d.getTime() + 3 * 86400000));
      const domD = await launch(durum([gorev("wd", { repeat: "weekdays", dueAt: cuma })]));
      const wD = domD.window;
      wD.document.querySelector('.task[data-id="wd"] input[type="checkbox"]').click();
      await settled();
      const succ = readState(domD).tasks.find(t => t.respawnedFrom === "wd");
      assert(succ, "weekdays successor doğmadı");
      eq(succ.dueAt, pazartesi, `Cuma (${cuma}) tamamlandı → ${pazartesi} beklenirdi, ${succ.dueAt} geldi`);
      domD.window.close();
    });

    // E) Erken tamamlama (haftalık): dueAt bugünden ilerideyse successor dueAt+7
    await test("Erken tamamlama zamanlanan günün ötesine atlar (haftalık)", async () => {
      const dueAt = todayKey(new Date(Date.now() + 10 * 86400000));
      const beklenen = todayKey(new Date(Date.now() + 17 * 86400000));
      const domE = await launch(durum([gorev("wk", { repeat: "weekly", dueAt })]));
      const wE = domE.window;
      wE.document.querySelector('.task[data-id="wk"] input[type="checkbox"]').click();
      await settled();
      const succ = readState(domE).tasks.find(t => t.respawnedFrom === "wk");
      assert(succ, "weekly successor doğmadı");
      eq(succ.dueAt, beklenen, `zamanlanan günün 7 gün sonrası (${beklenen}) beklenirdi, ${succ.dueAt} geldi`);
      domE.window.close();
    });

    // F) ↻ düğmesi kısıtları: done görevde ve alt görevi olan üstte yok
    await test("↻ düğmesi done görevde ve alt görevli üstte görünmez", async () => {
      const domF = await launch(durum([
        gorev("r1", { repeat: "daily", done: true, doneAt: Date.now() }),
        { id: "p2", text: "Alt görevli iş", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0 },
        { id: "k2", text: "Altı", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, parentId: "p2" }
      ]));
      await settled(300);
      const doneSatir = $$(domF, '.task[data-id="r1"]')[0];
      const p2satir = $$(domF, '.task[data-id="p2"]')[0];
      assert(doneSatir && p2satir, "satırlar render olmadı");
      assert(doneSatir.querySelectorAll(".repeat-btn").length === 0, "done görevde ↻ görünmemeli");
      assert(p2satir.querySelectorAll(".repeat-btn").length === 0, "alt görevi olan görevde ↻ görünmemeli");
      domF.window.close();
    });
  }

  console.log("\n— Tekrarlayan görevler: danışman düzeltmeleri (v3.2) —");
  {
    const ayarlar = { focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false, sound: false };
    const durum = (tasks, history = {}) => ({
      state: { tasks, settings: ayarlar, stats: { date: todayKey(), focusMinutes: 0 }, filter: "all", search: "", activeTaskId: null },
      history
    });

    // 1) ＋ ve ↻ birbirini dışlar: tekrarlayan görevde ＋ yok
    await test("Tekrarlayan görevde ＋ düğmesi görünmez (kontroller birbirini dışlar)", async () => {
      const dom = await launch(durum([
        { id: "r1", text: "İlaç iç", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, repeat: "daily" }
      ]));
      await settled(300);
      const satir = $$(dom, '.task[data-id="r1"]')[0];
      assert(satir.querySelectorAll(".repeat-btn").length === 1, "↻ görünmeli");
      assert(satir.querySelectorAll(".subtask-btn").length === 0, "tekrarlayan görevde ＋ görünmemeli");
      dom.window.close();
    });

    // 2) İçe aktarılan repeat+children verisi: sanitize tekrarı kaldırır
    await test("Alt görevli görevin tekrarı içe aktarımda temizlenir", async () => {
      const dom = await launch(durum([
        { id: "p", text: "Üst", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, repeat: "daily" },
        { id: "k", text: "Alt", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, parentId: "p" }
      ]));
      await settled(300);
      const st = readState(dom);
      const ust = st.tasks.find(t => t.id === "p");
      assert(ust.repeat === null, "alt görevli görevde tekrar kalmamalı");
      dom.window.close();
    });

    // 3) Successor'ın tekrarı ↻ ile değiştirilirse geri açma engellenir
    await test("Successor'ın tekrar kuralı değişirse geri açma engellenir", async () => {
      const dom = await launch(durum([
        { id: "r1", text: "İlaç iç", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, repeat: "daily" }
      ]));
      const w = dom.window;
      w.document.querySelector('.task[data-id="r1"] input[type="checkbox"]').click();
      await settled();
      // successor'ın ↻ düğmesine bas (daily → weekdays)
      const succSatir = $$(dom, ".task").filter(li => li.dataset.id !== "r1")[0];
      succSatir.querySelector(".repeat-btn").click();
      await settled();
      const st = readState(dom);
      assert(st.tasks.find(t => t.respawnedFrom).repeat === "weekdays", "successor tekrarı değişmedi");
      // eskiyi geri açmayı dene
      const cb = w.document.querySelector('.task[data-id="r1"] input[type="checkbox"]');
      cb.checked = false;
      cb.dispatchEvent(new w.Event("change"));
      await settled();
      const st2 = readState(dom);
      assert(st2.tasks.find(t => t.id === "r1").done === true, "değişmiş tekrar güvenli sayılmamalı");
      assert(st2.tasks.some(t => t.respawnedFrom === "r1"), "successor silinmemeli");
      dom.window.close();
    });

    // 4) Successor silinmişse (A→B→C, B silindi): geri açma serbest — belgelenmiş davranış
    await test("Successor kullanıcı tarafından silindiyse geri açma serbesttir (A ve C aktif kalır)", async () => {
      const dom = await launch(durum([
        { id: "a", text: "Seri görevi", done: true, createdAt: 1, doneAt: Date.now(), priority: 0, focus: 0, repeat: "daily" },
        { id: "c", text: "Seri görevi", done: false, createdAt: 2, doneAt: null, priority: 0, focus: 0, repeat: "daily", respawnedFrom: "b-silindi" }
      ]));
      const w = dom.window;
      await settled(300);
      const cb = w.document.querySelector('.task[data-id="a"] input[type="checkbox"]');
      cb.checked = false;
      cb.dispatchEvent(new w.Event("change"));
      await settled();
      const st = readState(dom);
      assert(st.tasks.find(t => t.id === "a").done === false, "silinmiş successor geri açmayı engellememeli");
      assert(st.tasks.some(t => t.id === "c"), "C durmalı");
      dom.window.close();
    });

    // 5) Gün aşırı muhasebe: dün tamamlanan bugün geri açılırsa DÜN sayacı düşer
    await test("Gün aşırı geri açma: sayaç tamamlanılan güne yazılır (bugüne değil)", async () => {
      const dun = todayKey(new Date(Date.now() - 86400000));
      const dom = await launch(durum(
        [{ id: "r1", text: "İlaç iç", done: true, createdAt: 1, doneAt: Date.now() - 86400000, priority: 0, focus: 0, repeat: "daily" }],
        { [dun]: { focus: 0, done: 0 }, [todayKey()]: { focus: 10, done: 4 } }
      ));
      const w = dom.window;
      await settled(300);
      const cb = w.document.querySelector('.task[data-id="r1"] input[type="checkbox"]');
      cb.checked = false;
      cb.dispatchEvent(new w.Event("change"));
      await settled();
      const h = readHistory(dom);
      eq(h[dun]?.done, 0, "dünün sayacı düşmeli");
      eq(h[todayKey()]?.done, 4, "bugünün sayacı değişmemeli");
      dom.window.close();
    });
  }

  console.log("\n— Todoist CSV içe aktarma (v3.2) —");
  {
    const durumBos = () => ({ state: { tasks: [], settings: { focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false, sound: false }, stats: { date: todayKey(), focusMinutes: 0 }, filter: "all", search: "", activeTaskId: null } });
    const fixtureVirgul = '\uFEFFTYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE\r\n'
      + 'section,Haftalık plan,,1,1,,,,,\r\n'
      + 'task,"Süt, ""ekmek"" al",,4,1,,,2026-10-25,en,Europe/Istanbul\r\n'
      + 'task,Muz al,,2,2,,,,\r\n'
      + 'note,Haftalık not,,1,2,,,,,\r\n'
      + 'task,Spor salonu,,1,1,,,24 Oct 2026,en,\r\n';
    const fixtureNoktali = fixtureVirgul.replace(/,/g, ";").replace(/";/g, '";');

    const dom = await launch();
    const w = dom.window;
    const dosyaYukle = async (icerik, kabul) => {
      w.__lastConfirm = null;
      w.confirm = (msg) => { w.__lastConfirm = msg; return kabul; };
      const file = new w.File([icerik], "todoist.csv", { type: "text/csv" });
      Object.defineProperty(w.document.querySelector("#import-todoist-file"), "files", { value: [file] });
      w.document.querySelector("#import-todoist-file").dispatchEvent(new w.Event("change"));
      await settled(400);
    };

    await test("Virgüllü CSV: görevler, hiyerarşi, öncelik ve tarih aktarılır", async () => {
      await dosyaYukle(fixtureVirgul, true);
      const st = readState(dom);
      eq(st.tasks.length, 3, "3 görev eklenmeliydi");
      const sut = st.tasks.find(t => t.text === 'Süt, "ekmek" al');
      assert(sut, "tırnak kaçışlı görev gelmedi");
      eq(sut.priority, 0, "p4 → 0 eşlenmeli");
      eq(sut.dueAt, "2026-10-25", "ISO tarih aktarılmadı");
      const muz = st.tasks.find(t => t.text === "Muz al");
      assert(muz && muz.parentId === sut.id, "INDENT 2 alt görev olmalı");
      eq(muz.priority, 2, "p2 → 2 eşlenmeli");
      const spor = st.tasks.find(t => t.text === "Spor salonu");
      assert(spor, "Spor salonu gelmedi");
      eq(spor.priority, 3, "p1 → 3 eşlenmeli");
      assert(!spor.dueAt, "doğal dil tarihi aktarılmamalı");
      eq($$(dom, "#task-list .task").length, 3, "görevler render olmadı");
      // onay mesajı: 3 görev + 2 atlanan satır (section, note) + 1 atlanan tarih (doğal dil)
      assert(w.__lastConfirm && w.__lastConfirm.includes("3") && w.__lastConfirm.includes("2") && w.__lastConfirm.includes("1"),
        "onay mesajı görev/satır/tarih sayılarını içermeli: " + w.__lastConfirm);
    });

    await test("Noktalı virgüllü CSV de aynı sonucu verir", async () => {
      const dom2 = await launch();
      const w2 = dom2.window;
      w2.confirm = () => true;
      const file = new w2.File([fixtureNoktali], "todoist.csv", { type: "text/csv" });
      Object.defineProperty(w2.document.querySelector("#import-todoist-file"), "files", { value: [file] });
      w2.document.querySelector("#import-todoist-file").dispatchEvent(new w2.Event("change"));
      await settled(400);
      const st = readState(dom2);
      eq(st.tasks.length, 3, "noktalı virgül CSV'de 3 görev beklenirdi");
      dom2.window.close();
    });

    await test("Geçersiz dosya reddedilir (durum değişmez)", async () => {
      const dom3 = await launch();
      const w3 = dom3.window;
      w3.confirm = () => true;
      const file = new w3.File(["bu,bir,todoist,dosyasi,degil"], "x.csv", { type: "text/csv" });
      Object.defineProperty(w3.document.querySelector("#import-todoist-file"), "files", { value: [file] });
      w3.document.querySelector("#import-todoist-file").dispatchEvent(new w3.Event("change"));
      await settled(400);
      const st = readState(dom3);
      eq(st.tasks.length, 0, "geçersiz dosya görev eklememeli");
      dom3.window.close();
    });

    await test("Kapanmamış tırnaklı (bozuk) CSV reddedilir", async () => {
      const dom5 = await launch(durumBos());
      const w5 = dom5.window;
      w5.confirm = () => true;
      const bozuk = '\uFEFFTYPE,CONTENT,PRIORITY,INDENT\r\ntask,"unterminated';
      const file = new w5.File([bozuk], "bozuk.csv", { type: "text/csv" });
      Object.defineProperty(w5.document.querySelector("#import-todoist-file"), "files", { value: [file] });
      w5.document.querySelector("#import-todoist-file").dispatchEvent(new w5.Event("change"));
      await settled(400);
      eq(readState(dom5).tasks.length, 0, "bozuk CSV görev eklememeli");
      dom5.window.close();
    });

    await test("İmkânsız takvim tarihi reddedilir (2026-13-45)", async () => {
      const dom6 = await launch(durumBos());
      const w6 = dom6.window;
      w6.__lastConfirm = null;
      w6.confirm = (msg) => { w6.__lastConfirm = msg; return true; };
      const csv = '\uFEFFTYPE,CONTENT,PRIORITY,INDENT,DATE\r\ntask,Geçersiz tarihli,1,1,2026-13-45\r\ntask,Geçerli tarihli,1,1,2026-10-25\r\n';
      const file = new w6.File([csv], "t.csv", { type: "text/csv" });
      Object.defineProperty(w6.document.querySelector("#import-todoist-file"), "files", { value: [file] });
      w6.document.querySelector("#import-todoist-file").dispatchEvent(new w6.Event("change"));
      await settled(400);
      const st = readState(dom6);
      eq(st.tasks.length, 2, "iki görev de eklenmeli");
      const gecersiz = st.tasks.find(t => t.text === "Geçersiz tarihli");
      const gecerli = st.tasks.find(t => t.text === "Geçerli tarihli");
      assert(!gecersiz.dueAt, "imkânsız tarih aktarılmamalı");
      eq(gecerli.dueAt, "2026-10-25", "geçerli tarih aktarılmalı");
      assert(w6.__lastConfirm && w6.__lastConfirm.includes("1"), "atlanan tarih sayısı onayda görünmeli: " + w6.__lastConfirm);
      dom6.window.close();
    });

    await test("Bölüm satırı ebeveyn hafızasını sıfırlar (bölüm sonrası INDENT 2 üst seviye olur)", async () => {
      const dom7 = await launch(durumBos());
      const w7 = dom7.window;
      w7.confirm = () => true;
      const csv = '\uFEFFTYPE,CONTENT,PRIORITY,INDENT\r\n'
        + 'task,Birinci bölüm görevi,1,1\r\n'
        + 'section,Yeni bölüm,,1\r\n'
        + 'task,Bölüm sonrası girintili,1,2\r\n';
      const file = new w7.File([csv], "b.csv", { type: "text/csv" });
      Object.defineProperty(w7.document.querySelector("#import-todoist-file"), "files", { value: [file] });
      w7.document.querySelector("#import-todoist-file").dispatchEvent(new w7.Event("change"));
      await settled(400);
      const st = readState(dom7);
      const girintili = st.tasks.find(t => t.text === "Bölüm sonrası girintili");
      assert(girintili && girintili.parentId === null, "bölüm sonrası INDENT 2 görev önceki bölüme bağlanmamalı");
      dom7.window.close();
    });

    await test("Onay reddedilirse hiçbir şey eklenmez", async () => {
      const dom4 = await launch();
      const w4 = dom4.window;
      w4.confirm = () => false;
      const file = new w4.File([fixtureVirgul], "todoist.csv", { type: "text/csv" });
      Object.defineProperty(w4.document.querySelector("#import-todoist-file"), "files", { value: [file] });
      w4.document.querySelector("#import-todoist-file").dispatchEvent(new w4.Event("change"));
      await settled(400);
      const st = readState(dom4);
      eq(st.tasks.length, 0, "iptal edildiğinde görev eklenmemeli");
      dom4.window.close();
    });
    dom.window.close();
  }

  console.log("\n— JSON dosya yoluyla içe aktarma (gerçek FileReader akışı) —");
  {
    const dom = await launch({
      state: {
        tasks: [
          { id: "p", text: "Ana iş", done: false, createdAt: 1, doneAt: null, priority: 2, focus: 30 },
          { id: "k", text: "Alt adım", done: true, createdAt: 1, doneAt: 5, priority: 0, focus: 0, parentId: "p" },
          { id: "r", text: "Tekrarlayan iş", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, repeat: "weekly", dueAt: "2026-10-28", respawnedFrom: "eski" }
        ],
        settings: { focus: 50, short: 10, long: 20, longEvery: 3, autoStart: true, sound: false },
        stats: { date: todayKey(), focusMinutes: 7 }, filter: "active", search: "x", activeTaskId: "p"
      },
      history: { [todayKey()]: { focus: 42, done: 3 } }
    });
    const w = dom.window;

    // Dışa aktar: JSON blob'unu yakala
    w.document.querySelector("#export-data").click();
    const backupJson = w.__lastBlob.__text;
    assert(backupJson && backupJson.includes("Ana iş"), "JSON dışa aktarma boş");

    // Yeni bir örnek: dosya yoluyla geri yükle (FileReader + confirm)
    const dom2 = await launch();
    const w2 = dom2.window;
    w2.confirm = () => true; // onay kutusunu otomatik kabul et
    const file = new w2.File([backupJson], "yedek.json", { type: "application/json" });
    Object.defineProperty(w2.document.querySelector("#import-file"), "files", { value: [file] });
    w2.document.querySelector("#import-file").dispatchEvent(new w2.Event("change"));
    await settled(400); // FileReader + içe aktarma akışı

    await test("Dosyadan geri yükleme görevleri, hiyerarşiyi ve ayarları getirir", () => {
      const st = readState(dom2);
      eq(st.tasks.length, 3, "görevler geri gelmedi");
      const kid = st.tasks.find(t => t.text === "Alt adım");
      assert(kid && kid.parentId === "p", "hiyerarşi kayboldu");
      assert(kid.done === true, "tamamlanma durumu kayboldu");
      eq(st.tasks.find(t => t.text === "Ana iş").focus, 30, "görev odak toplamı kayboldu");
      eq(st.stats.focusMinutes, 7, "günlük odak istatistiği kayboldu");
      eq(st.settings.focus, 50, "ayarlar geri gelmedi");
      assert(st.settings.autoStart === true, "autoStart kayboldu");
      eq(st.activeTaskId, "p", "odak görevi kayboldu");
      const tek = st.tasks.find(t => t.text === "Tekrarlayan iş");
      assert(tek && tek.repeat === "weekly" && tek.dueAt === "2026-10-28" && tek.respawnedFrom === "eski",
        "tekrar/tarih/respawnedFrom alanları yedekle geri gelmedi");
      eq($$(dom2, "#task-list .task.subtask").length, 1, "alt görev render olmadı");
    });
    await test("Geçmiş de dosyayla geri gelir", () => {
      const h = readHistory(dom2);
      eq(h[todayKey()]?.focus, 42, "odak geçmişi kayboldu");
      eq(h[todayKey()]?.done, 3, "görev geçmişi kayboldu");
    });
    dom.window.close();
    dom2.window.close();
  }

  console.log("\n— Orman ve seri (v3.3) —");
  {
    /* Sahte saatle odak oturumunu tamamla: süre ayarla → başlat →
       (isteğe bağlı duraklat/devam) → saati ileri al → tick'in işlemesini bekle */
    const completeSession = async (dom, { minutes = 25, pauseFirst = false } = {}) => {
      const w = dom.window;
      // Odak modunda olduğundan emin ol (mola tamamlanınca kip değişir)
      const focusChip = $(dom, '#mode-chips .chip[data-mode="focus"]');
      if (focusChip) focusChip.click();
      // Süreyi her zaman açıkça ayarla (önceki testin ayarı kalabilir)
      const input = $(dom, "#set-focus");
      input.value = String(minutes);
      input.dispatchEvent(new w.Event("change", { bubbles: true }));
      $(dom, "#start-pause").click();
      if (pauseFirst) { $(dom, "#start-pause").click(); $(dom, "#start-pause").click(); }
      const realNow = w.Date.now.bind(w.Date);
      w.Date.now = () => realNow() + (minutes + 1) * 60 * 1000;
      await settled(700);
      w.Date.now = realNow;
    };
    const MIN_SETTINGS = { focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false, sound: true };
    const gorevY = (id, ekstra = {}) => ({ id, text: "Test görevi", done: false, createdAt: 1, doneAt: null, priority: 0, focus: 0, ...ekstra });

    // 1) Tamamlanan oturum ağaç diker
    const dom = await launch();
    await test("Tamamlanan odak oturumu bir ağaç diker (sessions + forestTotal)", async () => {
      await completeSession(dom);
      const h = readHistory(dom);
      eq(h[todayKey()]?.sessions, 1, "sessions kaydedilmedi");
      eq(readState(dom).stats.forestTotal, 1, "forestTotal artmadı");
      eq($$(dom, "#forest-days .day-cluster.today svg").length, 1, "ağaç render olmadı");
      assert($(dom, "#forest-empty").hidden, "boş durum gizlenmedi");
      assert(!$(dom, "#forest-scene").hidden, "orman sahnesi görünmeli");
    });

    await test("İkinci oturum ikinci ağacı diker", async () => {
      await completeSession(dom);
      eq(readHistory(dom)[todayKey()]?.sessions, 2);
      eq($$(dom, "#forest-days .day-cluster.today svg").length, 2);
    });

    await test("Uzun oturum tek ağaç diker (ağaç dakikadan değil oturumdan)", async () => {
      await completeSession(dom, { minutes: 50 });
      eq(readHistory(dom)[todayKey()]?.sessions, 3, "50 dk = 1 oturum olmalı");
      eq(readHistory(dom)[todayKey()]?.focus, 100, "25+25+50 dakika bekleniyordu");
    });

    await test("Duraklatılıp devam eden oturum tamamlanınca ağaç diker", async () => {
      await completeSession(dom, { pauseFirst: true });
      eq(readHistory(dom)[todayKey()]?.sessions, 4);
    });

    await test("Atlama ve sıfırlama ağaç dikmez", async () => {
      const before = readHistory(dom)[todayKey()]?.sessions;
      $(dom, "#start-pause").click();
      $(dom, "#skip").click();
      $(dom, "#reset").click();
      await settled(400);
      eq(readHistory(dom)[todayKey()]?.sessions, before, "atlama/sıfırlama ağaç dikti");
    });

    await test("Orman çizimi deterministik (aynı veri aynı orman)", async () => {
      const st = readState(dom);
      const hist = readHistory(dom);
      const domD = await launch({ state: st, history: hist });
      assert($(dom, "#forest-days").innerHTML === $(domD, "#forest-days").innerHTML,
        "aynı veri farklı orman çizdi");
      domD.window.close();
    });

    await test("Gün başına 4 ağaç + 'daha fazla' rozeti", async () => {
      await completeSession(dom); // 5. oturum
      await completeSession(dom); // 6. oturum
      const h = readHistory(dom);
      eq(h[todayKey()]?.sessions, 6);
      eq($$(dom, "#forest-days .day-cluster.today svg").length, 4, "gün başına en fazla 4 ağaç");
      const more = $(dom, "#forest-days .day-cluster.today .more-pill");
      assert(more && more.textContent.includes("2"), "+2 rozeti görünmeli");
    });

    await test("Seri rozeti aktif günleri sayar (bugün aktif: '1 day')", () => {
      eq($(dom, "#streak-count").textContent, "1 day");
    });

    // Eski veri: sessions yok → boş durum, istatistikler korunur
    const domL = await launch({
      state: { tasks: [], settings: MIN_SETTINGS, stats: { date: todayKey(), focusMinutes: 0 }, filter: "all", search: "", activeTaskId: null },
      history: { [todayKey()]: { focus: 55, done: 2 } }
    });
    await test("Eski veride (sessions yok) orman boş durum gösterir, istatistikler korunur", () => {
      eq(readHistory(domL)[todayKey()]?.sessions || 0, 0);
      assert(!$(domL, "#forest-empty").hidden, "boş durum görünmeli");
      assert($(domL, "#forest-scene").hidden, "sahne gizlenmeli");
      eq($(domL, "#stat-focus-week").textContent, "55", "odak istatistiği bozuldu");
      eq($(domL, "#streak-count").textContent, "1 day", "bugün aktif: seri 1 olmalı");
    });
    domL.window.close();

    // Saati (takvimi de) ileri al: Date.now VE new Date() aynı kaynakta.
    // Her çağrı mevcut saate +1 gün ekler (art arda gün geçişleri için).
    const shiftClock = (dom, days = 1) => {
      const w = dom.window;
      const RealDate = w.Date;
      const shift = days * 86400000;
      w.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [RealDate.now() + shift])); }
        static now() { return RealDate.now() + shift; }
      };
      w.Date.now = () => RealDate.now() + shift;
    };
    const addTask = (dom, text) => {
      $(dom, "#task-input").value = text;
      $(dom, "#task-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    };
    const completeByText = (dom, text) => {
      const item = $$(dom, "#task-list .task").find(el => el.textContent.includes(text));
      if (!item) throw new Error("görev bulunamadı: " + text);
      item.querySelector('input[type="checkbox"]').click();
    };

    // Seri 90 günlük pencereyi aşabilir: kuyruk mantığı
    const hist95 = {};
    for (let i = 0; i < 95; i++) {
      const d = new Date(Date.now() - i * 86400000);
      hist95[todayKey(d)] = { focus: 25, done: 1, sessions: 1 };
    }
    const domS = await launch({
      state: { tasks: [], settings: MIN_SETTINGS, stats: { date: todayKey(), focusMinutes: 0 }, filter: "all", search: "", activeTaskId: null },
      history: hist95
    });
    await test("Seri 90 günlük pencereyi aşabilir (kuyruk: 95 gün)", async () => {
      addTask(domS, "g1");
      completeByText(domS, "g1");
      eq($(domS, "#streak-count").textContent, "95 days", "95 günlük seri bekleniyordu");
      await settled(300); // save() debounce'u
      const st = readState(domS);
      eq(st.stats.streakTail, 5, "5 günlük kuyruk bekleniyordu");
      assert(st.stats.streakTailEnd, "kuyruk tarih çapası yazılmadı");
      eq(st.stats.bestStreak, 95, "en uzun seri kaydı tutulmalı");
    });

    await test("Art arda budamalarda kuyruk gün gün büyür (96, 97 gün)", async () => {
      // Gün +1: yeni görev → 96. gün, kuyruk 6
      shiftClock(domS, 1);
      addTask(domS, "g2");
      completeByText(domS, "g2");
      await settled(300);
      let st = readState(domS);
      eq(st.stats.streakTail, 6, "1. gün geçişinde kuyruk 6 olmalı");
      eq($(domS, "#streak-count").textContent, "96 days", "96 günlük seri");

      // Gün +1 daha: 97. gün, kuyruk 7
      shiftClock(domS, 1);
      addTask(domS, "g3");
      completeByText(domS, "g3");
      await settled(300);
      st = readState(domS);
      eq(st.stats.streakTail, 7, "2. gün geçişinde kuyruk 7 olmalı");
      eq($(domS, "#streak-count").textContent, "97 days", "97 günlük seri");
    });

    await test("Son zamanlarda gün atlanırsa kuyruk seriye eklenmez", async () => {
      // Saat +2'de (uygulamanın bugünü = gerçek bugün+2). Pencerenin ortasından
      // bir günü sil → zincir kopar → seri yalnızca bugüne kadar; kuyruk görünmez.
      const hIntact = readHistory(domS);
      const h = { ...hIntact };
      const kopuk = todayKey(new Date(Date.now() - 2 * 86400000)); // bugünden 2 gün önce
      delete h[kopuk];
      const st = readState(domS);
      const domK = await launch({ state: st, history: h });
      eq($(domK, "#streak-count").textContent, "2 days", "kırık zincir kuyruğu almalıydı");
      eq(readState(domK).stats.streakTail, 7, "kuyruk kaydı korunur (görünmez)");
      domK.window.close();

      // Yeniden yükleme (saat aynı, geçmiş bütün): seri 97 dönmeli.
      // Saat kaydırması render tetiklemez — bir görev tamamla → yeniden hesap.
      const domW = await launch({ state: st, history: hIntact });
      shiftClock(domW, 2);
      addTask(domW, "w1");
      completeByText(domW, "w1");
      eq($(domW, "#streak-count").textContent, "97 days", "yeniden yükleme seriyi düşürdü");

      // Yedek gidiş-dönüşü: kuyruk ve çapa taşınsın
      $(domW, "#export-data").click();
      const data = JSON.parse(domW.window.__lastBlob.__text);
      eq(data.state.stats.streakTail, 7, "yedekte kuyruk yok");
      assert(data.state.stats.streakTailEnd, "yedekte çapa yok");
      const domX = await launch();
      shiftClock(domX, 2);
      const wX = domX.window;
      wX.confirm = () => true;
      const file = new wX.File([domW.window.__lastBlob.__text], "yedek.json", { type: "application/json" });
      Object.defineProperty(wX.document.querySelector("#import-file"), "files", { value: [file] });
      wX.document.querySelector("#import-file").dispatchEvent(new wX.Event("change"));
      await settled(400);
      eq(readState(domX).stats.streakTail, 7, "içe aktarımda kuyruk kayboldu");
      eq($(domX, "#streak-count").textContent, "97 days", "içe aktarımda seri kayboldu");
      domX.window.close();
      domW.window.close();
    });

    await test("Kuyruktaki gün atlaması kuyruğu o günde keser", async () => {
      // 100 gün: i=0..99 aktif, yalnız i=95 pasif.
      // Budama 10 günü (i=99..90) atar: i=99..96 aktif (4), i=95 pasif → kesinti,
      // i=94..90 aktif (5) → pencereye bitişik kuyruk 5 gün.
      const hist = {};
      for (let i = 0; i < 100; i++) {
        const d = new Date(Date.now() - i * 86400000);
        if (i === 95) continue;
        hist[todayKey(d)] = { focus: 25, done: 1, sessions: 1 };
      }
      const domG = await launch({
        state: { tasks: [], settings: MIN_SETTINGS, stats: { date: todayKey(), focusMinutes: 0 }, filter: "all", search: "", activeTaskId: null },
        history: hist
      });
      addTask(domG, "g1");
      completeByText(domG, "g1");
      await settled(300);
      const st = readState(domG);
      eq(st.stats.streakTail, 5, "5 günlük kuyruk bekleniyordu");
      eq($(domG, "#streak-count").textContent, "95 days", "90 pencere + 5 kuyruk");
      domG.window.close();
    });
    domS.window.close();

    // Yedek gidiş-dönüşü orman sayaçlarını taşır
    await test("Yedek gidiş-dönüşü sessions, forestTotal ve bestStreak taşır", async () => {
      $(dom, "#export-data").click();
      const data = JSON.parse(dom.window.__lastBlob.__text);
      eq(data.state.stats.forestTotal, 6, "yedekte forestTotal yok");
      eq(data.history[todayKey()].sessions, 6, "yedekte sessions yok");
      eq(data.state.stats.bestStreak, 1, "yedekte bestStreak yok");

      const domR = await launch();
      const wR = domR.window;
      wR.confirm = () => true;
      const file = new wR.File([dom.window.__lastBlob.__text], "yedek.json", { type: "application/json" });
      Object.defineProperty(wR.document.querySelector("#import-file"), "files", { value: [file] });
      wR.document.querySelector("#import-file").dispatchEvent(new wR.Event("change"));
      await settled(400);

      eq(readHistory(domR)[todayKey()]?.sessions, 6, "içe aktarımda sessions kayboldu");
      eq(readState(domR).stats.forestTotal, 6, "içe aktarımda forestTotal kayboldu");
      eq(readState(domR).stats.bestStreak, 1, "içe aktarımda bestStreak kayboldu");
      eq($$(domR, "#forest-days .day-cluster.today svg").length, 4, "orman render olmadı");
      domR.window.close();
    });
    dom.window.close();
  }

  console.log("\n— Açılış ekranı ve PWA adı (v3.3.1) —");
  {
    await test("Açılış ekranı en az 0,55 sn görünür sonra kaybolur", async () => {
      const dom = await launch();
      // İlk anda görünür durumda
      await new Promise(r => setTimeout(r, 150));
      let splash = $(dom, "#splash");
      assert(splash, "açılış ekranı DOM'da yok");
      assert(!splash.classList.contains("splash-hide"), "çok erken soluklaştı (min süre aşıldı)");
      // Min ~0,55 sn sonra soluklaşır
      await new Promise(r => setTimeout(r, 700));
      splash = $(dom, "#splash");
      assert(splash && splash.classList.contains("splash-hide"), "soluklaştırma sınıfı gelmedi");
      await new Promise(r => setTimeout(r, 700));
      eq($(dom, "#splash"), null, "açılış ekranı DOM'dan kaldırılmadı");
      dom.window.close();
    });

    await test("Soğuk açılışta belge gizli yüklenirse ekran görünür olunca başlar", async () => {
      /* Kurulu PWA soğuk açılışı: belge Android'in yerel açılış ekranı
         arkasında visibilityState "hidden" ile yüklenir; ekranın süresi
         ancak görünür olunca işlemeli. */
      const dom = new JSDOM(html, {
        url: "https://smallsteps.test/",
        runScripts: "outside-only",
        pretendToBeVisual: true
      });
      const w = dom.window;
      let visible = false;
      Object.defineProperty(w.document, "visibilityState", {
        get: () => (visible ? "visible" : "hidden"),
        configurable: true
      });
      w.eval(translationsSrc);
      w.eval(appSrc);
      if (w.document.readyState === "loading") {
        await new Promise((r) => w.document.addEventListener("DOMContentLoaded", r, { once: true }));
      }
      await new Promise(r => setTimeout(r, 1200));
      let splash = $(dom, "#splash");
      assert(splash && !splash.classList.contains("splash-hide"),
        "gizli yüklenen belgede ekran erken kayboldu (süre görünmeden işlemiş)");
      visible = true;
      w.document.dispatchEvent(new w.Event("visibilitychange"));
      await new Promise(r => setTimeout(r, 300));
      splash = $(dom, "#splash");
      assert(splash && !splash.classList.contains("splash-hide"),
        "görünür olduktan sonra erken soluklaştı (min süre aşıldı)");
      await new Promise(r => setTimeout(r, 700));
      splash = $(dom, "#splash");
      assert(splash && splash.classList.contains("splash-hide"),
        "görünür olduktan sonra soluklaştırma sınıfı gelmedi");
      await new Promise(r => setTimeout(r, 700));
      eq($(dom, "#splash"), null, "ekran DOM'dan kaldırılmadı");
      dom.window.close();
    });

    await test("Tarayıcıda hatırlanan belge (gizle-göster) açılış ekranını tekrar oynamaz", async () => {
      /* Kurulu uygulama kipi DEĞİL: normal tarayıcıda sekme değiştirmek
         yükleme olmadığından ekranı tetiklememelidir. */
      const dom = await launch();
      for (let i = 0; i < 30 && $(dom, "#splash"); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      eq($(dom, "#splash"), null, "açılış ekranı kaldırılmadı");
      const w = dom.window;
      let visible = true;
      Object.defineProperty(w.document, "visibilityState", {
        get: () => (visible ? "visible" : "hidden"),
        configurable: true
      });
      visible = false;
      w.document.dispatchEvent(new w.Event("visibilitychange"));
      visible = true;
      w.document.dispatchEvent(new w.Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 800));
      eq($(dom, "#splash"), null, "tarayıcıda hatırlanan belgede açılış ekranı yeniden belirdi");
      assert(!!$(dom, "#lang-select"), "gizle-göster sonrası arayüz bozuldu");
      dom.window.close();
    });

    await test("Kurulu uygulamada hatırlanınca ekran yeniden oynar; zamanlayıcı ve taslak korunur", async () => {
      /* Kurulu uygulama kipinde (display-mode: standalone) belge arka
         plandan hatırlanınca açılış ekranı yeniden oynamalı; ama yalnızca
         örtüdür — çalışan oturum ve yazılan taslak bozulmamalıdır. */
      const dom = new JSDOM(html, {
        url: "https://smallsteps.test/",
        runScripts: "outside-only",
        pretendToBeVisual: true
      });
      const w = dom.window;
      w.matchMedia = () => ({ matches: true }); /* kurulu uygulama kipi */
      w.eval(translationsSrc);
      w.eval(appSrc);
      if (w.document.readyState === "loading") {
        await new Promise((r) => w.document.addEventListener("DOMContentLoaded", r, { once: true }));
      }
      for (let i = 0; i < 30 && $(dom, "#splash"); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      eq($(dom, "#splash"), null, "ilk açılış ekranı kaldırılmadı");
      const startPause = $(dom, "#start-pause");
      startPause.click();
      const pauseLabel = startPause.textContent;
      const input = $(dom, "#task-input");
      input.value = "taslak metin";
      let visible = true;
      Object.defineProperty(w.document, "visibilityState", {
        get: () => (visible ? "visible" : "hidden"),
        configurable: true
      });
      visible = false;
      w.document.dispatchEvent(new w.Event("visibilitychange"));
      visible = true;
      w.document.dispatchEvent(new w.Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 200));
      assert(!!$(dom, "#splash") && !$(dom, "#splash").classList.contains("splash-hide"),
        "hatırlanmada açılış ekranı yeniden oynamadı");
      await new Promise((r) => setTimeout(r, 900));
      assert($(dom, "#splash") && $(dom, "#splash").classList.contains("splash-hide"),
        "hatırlanma ekranı soluklaşmadı");
      await new Promise((r) => setTimeout(r, 700));
      eq($(dom, "#splash"), null, "hatırlanma ekranı DOM'dan kaldırılmadı");
      eq(startPause.textContent, pauseLabel, "zamanlayıcı durumu sıfırlandı (oturum kayboldu)");
      eq(input.value, "taslak metin", "yazılan taslak kayboldu");
      dom.window.close();
    });

    await test("PWA yükleme adları İngilizce (manifest + apple başlığı)", () => {
      const m = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
      eq(m.short_name, "Small Steps", "manifest short_name İngilizce olmalı");
      eq(m.lang, "en", "manifest lang 'en' olmalı");
      assert(!/[çğıöşü]/i.test(m.name + m.description + m.shortcuts.map(s => s.name).join("")),
        "manifest metinlerinde Türkçe karakter kaldı");
      const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
      assert(html.includes('apple-mobile-web-app-title" content="Small Steps'),
        "apple başlığı İngilizce değil");
      assert(html.includes('<title>Small Steps'), "statik başlık İngilizce değil");
      assert(html.includes('og:locale" content="en_US'), "og:locale güncellenmedi");
    });

    await test("Sürüm alanları eşit ve senkron (manifest = package.json = SW önbelleği)", () => {
      const m = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
      const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
      const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
      assert(m.version && m.version_name, "manifest'te version/version_name yok (sürüm meta verisi eksik)");
      eq(m.version_name, pkg.version, "manifest.version_name ile package.json sürümü eşleşmiyor");
      eq(m.version, pkg.version, "manifest.version ile package.json sürümü eşleşmiyor");
      assert(sw.includes(`minik-adimlar-v${pkg.version}`), "SW önbellek adı sürümle eşleşmiyor");
      assert(/^\d+(\.\d+){0,3}$/.test(m.version), "version 1-4 noktayla ayrılmış tam sayı olmalı");
    });

    await test("PWA sorunsuz güncelleme akışı kablolı (controllerchange + ön plan denetimi)", () => {
      const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
      const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
      const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
      // Kayıt: HTTP önbelleğini atlayan seçenekle
      assert(html.includes('register("sw.js", { updateViaCache: "none" })'),
        "updateViaCache: none ile kayıt yok");
      // Yeni SW devreye girince sayfa kendini BİR KEZ tazeler (ilk kurulum hariç)
      assert(html.includes('"controllerchange"'), "controllerchange dinleyicisi yok");
      assert(html.includes("controlledBefore"), "denetim takibi (ilk kurulum istisnası) yok");
      assert(html.includes("refreshing = true"), "tek tazeleme koruması yok");
      // Güvenli tazeleme: zamanlayıcı/taslak/arka plan varsa bekle
      assert(html.includes("safeToReload"), "güvenli an kontrolü yok");
      assert(html.includes("__smallStepsSafeToReload"), "app ile güvenli an sözleşmesi yok");
      assert(app.includes("window.__smallStepsSafeToReload"), "app.js güvenli an işlevini sunmuyor");
      assert(app.includes("!timer.running"), "güvenli an kontrolü zamanlayıcıyı yok sayıyor");
      // Ön plana dönüşte ve bağlantı gelince güncelleme denetimi
      assert(html.includes('"visibilitychange"'), "ön plan denetimi yok");
      assert(html.includes('"online"'), "çevrimiçi dönüş denetimi yok");
      assert(html.includes("reg.update()"), "reg.update çağrısı yok");
      // SW: atomik sürüm — HTML de YALNIZ bu sürüm önbelleğinden; yeni SW claim edip eskiyi siler
      assert(sw.includes("clients.claim()"), "SW claim etmiyor (tazeleme tetiklenmez)");
      assert(sw.includes("self.skipWaiting()"), "SW skipWaiting yapmıyor");
      assert(sw.includes("caches.open(CACHE).then((c) => c.match(req))"), "eşleşme adlandırılmış önbellekte değil");
      assert(!sw.includes("network-first (HTML)"), "HTML hâlâ network-first");
    });
  }

  console.log("\n— GitHub yıldız rozeti ve native mod (v3.4.0) —");
  {
    await test("Yıldız rozeti üst çubukta ve doğru yapıda", async () => {
      const dom = await launch();
      const badge = $(dom, "#gh-star");
      assert(badge, "rozet (#gh-star) yok");
      assert(badge.querySelector("svg.gh-mark"), "GitHub logosu yok");
      assert(badge.querySelector("#gh-star-count"), "sayı alanı yok");
      assert(badge.querySelector("svg.gh-star-icon"), "yıldız ikonu yok");
      assert((badge.getAttribute("href") || "").includes("github.com/firatnexus/small-steps"),
        "rozet depoya bağlanmıyor");
      assert($(dom, "#help-toggle"), "web'de ? düğmesi yok");
    });

    await test("Web modunda ? düğmesi görünür kalır", async () => {
      const dom = await launch();
      const help = $(dom, "#help-toggle");
      assert(help, "#help-toggle yok");
      assert(!help.hidden, "web'de ? düğmesi gizlenmiş olmamalı");
    });

    await test("Native (Capacitor) modunda ? düğmesi hidden alır", async () => {
      const dom = new JSDOM(html, {
        url: "https://smallsteps.test/",
        runScripts: "outside-only",
        pretendToBeVisual: true
      });
      const w = dom.window;
      w.Capacitor = { isNativePlatform: () => true, Plugins: {} };
      w.eval(translationsSrc);
      w.eval(appSrc);
      if (w.document.readyState === "loading") {
        await new Promise((r) => w.document.addEventListener("DOMContentLoaded", r, { once: true }));
      }
      const help = $(dom, "#help-toggle");
      assert(help, "#help-toggle yok");
      assert(help.hidden, "native modda ? düğmesi hidden değil");
    });

    await test("hidden gerçekten görünmez yapar (CSS garantisi)", async () => {
      /* .icon-button { display: grid } UA'nın [hidden] kuralını ezer;
         bu yüzden açık garanti kuralı şart. */
      const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
      assert(css.includes("#help-toggle[hidden] { display: none; }"),
        "style.css'te #help-toggle[hidden] garantisi yok");
      assert(/\.icon-button\s*{[^}]*display:\s*grid/.test(css),
        ".icon-button artık display:grid değil — garanti kuralı gözden geçirilmeli");
    });
  }

  console.log("\n— Kaydırma regresyonu, dil menüsü, üst çubuk (v3.6.1) —");
  {
    /* Kök neden: renderForest → scrollForestToToday() içindeki
       scrollIntoView({block:"nearest"}) pencereyi de kaydırıyordu; her görev
       ekleme/filtre/silme ve mobil klavye (resize) sayfayı orman kartına
       atlatıyordu. Düzeltme: yalnızca #forest-scene.scrollLeft değişir. */
    async function launchOverflowingForest() {
      const dom = await launch();
      const w = dom.window;
      const scene = w.document.querySelector("#forest-scene");
      Object.defineProperty(scene, "scrollWidth", { configurable: true, get: () => 1000 });
      Object.defineProperty(scene, "clientWidth", { configurable: true, get: () => 300 });
      /* Varsayılan öğeler görünür alanın içinde (top 100) — gerçek tarayıcıdaki
         gibi; böylece görünür bir alana odaklanmak kaydırma gerektirmez. */
      const rect = (l, r) => ({ left: l, right: r, top: 100, bottom: 120, width: r - l, height: 20, x: l, y: 100 });
      w.HTMLElement.prototype.getBoundingClientRect = function () {
        if (this.id === "forest-scene") return rect(0, 300);
        if (this.classList.contains("today")) return rect(900 - scene.scrollLeft, 930 - scene.scrollLeft);
        return rect(0, 0);
      };
      const calls = { intoView: 0, windowScroll: 0 };
      w.Element.prototype.scrollIntoView = function () { calls.intoView++; };
      w.scrollTo = () => { calls.windowScroll++; };
      w.scrollBy = () => { calls.windowScroll++; };
      return { dom, w, scene, calls };
    }

    await test("Filtre, ekleme, tamamlama ve silme pencereyi kaydırmaz (orman taşarken)", async () => {
      const { dom, w, scene, calls } = await launchOverflowingForest();
      const doc = w.document;
      doc.querySelector("#task-input").value = "Kaydırma testi";
      doc.querySelector("#task-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
      doc.querySelector('.chip[data-filter="active"]').click();
      doc.querySelector('.chip[data-filter="done"]').click();
      doc.querySelector('.chip[data-filter="all"]').click();
      const cb = doc.querySelector('#task-list .task input[type="checkbox"]');
      cb.click();
      doc.querySelector("#task-list .task .danger").click();
      await settled();
      eq(calls.intoView, 0, "scrollIntoView çağrıldı — pencere kayabilir");
      eq(calls.windowScroll, 0, "pencere programatik olarak kaydırıldı");
      eq(scene.scrollLeft, 638, "orman şeridi bugüne yatay kaydırılmadı");
      dom.window.close();
    });

    await test("Pencere boyu değişince (mobil klavye) yalnızca orman şeridi kayar", async () => {
      const { dom, w, scene, calls } = await launchOverflowingForest();
      scene.scrollLeft = 0;
      w.dispatchEvent(new w.Event("resize"));
      await settled(260);
      eq(calls.intoView, 0, "resize sonrası scrollIntoView çağrıldı");
      eq(calls.windowScroll, 0, "resize sonrası pencere kaydı");
      eq(scene.scrollLeft, 638, "resize sonrası orman bugüne hizalanmadı");
      dom.window.close();
    });

    await test("Satır içi düzenleme/alt görev girişleri preventScroll ile odaklanır", async () => {
      const dom = await launch();
      const w = dom.window, doc = w.document;
      const seen = [];
      const origFocus = w.HTMLElement.prototype.focus;
      w.HTMLElement.prototype.focus = function (opts) { seen.push({ el: this, opts }); return origFocus.call(this, opts); };
      doc.querySelector("#task-input").value = "Odak testi";
      doc.querySelector("#task-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
      const formFocus = seen.find((f) => f.el.id === "task-input");
      assert(formFocus && formFocus.opts && formFocus.opts.preventScroll, "ekleme sonrası giriş preventScroll'suz odaklandı");
      doc.querySelector("#task-list .task .icon-btn[aria-label]").parentElement
        .querySelectorAll(".icon-btn")[2].click(); // düzenle
      const edit = seen.find((f) => f.el.classList && f.el.classList.contains("edit-input"));
      assert(edit && edit.opts && edit.opts.preventScroll, "düzenleme girişi preventScroll'suz odaklandı");
      edit.el.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
      doc.querySelector("#task-list .task .subtask-btn").click();
      const sub = seen.find((f) => f.el.closest && f.el.closest(".subtask-add"));
      assert(sub && sub.opts && sub.opts.preventScroll, "alt görev girişi preventScroll'suz odaklandı");
      dom.window.close();
    });

    await test("Kaynakta pencereyi kaydırabilen orman scrollIntoView'u kalmadı", () => {
      const fn = appSrc.slice(appSrc.indexOf("function scrollForestToToday"),
        appSrc.indexOf("/* ---------- 90 günlük ısı haritası"));
      assert(fn.length > 0, "scrollForestToToday bulunamadı");
      assert(!fn.includes("scrollIntoView("), "scrollForestToToday yine scrollIntoView kullanıyor");
    });

    await test("Dil menüsü: açılır, seçili dil işaretli, seçimle dil değişir ve kapanır", async () => {
      const dom = await launch();
      const w = dom.window, doc = w.document;
      const trigger = doc.querySelector("#lang-trigger");
      const list = doc.querySelector("#lang-list");
      assert(trigger && list, "dil menüsü öğeleri yok");
      eq(list.hidden, true, "liste başta açık");
      trigger.click();
      eq(trigger.getAttribute("aria-expanded"), "true");
      eq(list.hidden, false, "liste açılmadı");
      const opts = list.querySelectorAll('[role="option"]');
      eq(opts.length, w.i18n.SUPPORTED_LANGS.length, "tüm diller listede değil");
      const selected = list.querySelectorAll('[aria-selected="true"]');
      eq(selected.length, 1, "tam olarak bir seçili dil olmalı");
      eq(selected[0].dataset.value, w.i18n.getLang(), "seçili işaret mevcut dilde değil");
      list.querySelector('[data-value="de"]').click();
      eq(w.i18n.getLang(), "de", "dil değişmedi");
      eq(doc.querySelector("#lang-select").value, "de", "gizli select güncellenmedi");
      eq(list.hidden, true, "seçimden sonra liste kapanmadı");
      eq(trigger.getAttribute("aria-expanded"), "false");
      eq(doc.querySelector("#lang-trigger-label").textContent, "Deutsch", "tetikleyici etiketi güncellenmedi");
      dom.window.close();
    });

    await test("Dil menüsü Esc ve dışarı dokunmayla kapanır; Space zamanlayıcıyı başlatmaz", async () => {
      const dom = await launch();
      const w = dom.window, doc = w.document;
      const trigger = doc.querySelector("#lang-trigger");
      const list = doc.querySelector("#lang-list");
      trigger.click();
      doc.activeElement.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      eq(list.hidden, true, "Esc ile kapanmadı");
      trigger.click();
      doc.querySelector("h1").dispatchEvent(new w.Event("pointerdown", { bubbles: true }));
      eq(list.hidden, true, "dışarı dokununca kapanmadı");
      const before = doc.body.dataset.running;
      trigger.dispatchEvent(new w.KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
      eq(list.hidden, false, "Space menüyü açmadı");
      eq(doc.body.dataset.running, before, "Space zamanlayıcı kısayolunu tetikledi");
      dom.window.close();
    });

    await test("Yedekten geri yüklenen dil, menü etiketine yansır", async () => {
      const dom = await launch();
      const w = dom.window;
      w.i18n.setLanguage("fr");
      w.document.querySelector("#lang-select").value = "fr";
      w.i18n.applyLanguage("fr");
      eq(w.document.querySelector("#lang-trigger-label").textContent, "Français");
      dom.window.close();
    });

    await test("Üst çubuk sırası: dil, GitHub yıldızı, ?, tema", async () => {
      const dom = await launch();
      const ids = Array.from(dom.window.document.querySelector(".topbar").children).map((el) => el.id);
      eq(ids.join(","), "lang-menu,gh-star,help-toggle,theme-toggle");
      dom.window.close();
    });

    await test("Üst güvenli alan CSS'te uygulanıyor (Capacitor değişkeni + env)", () => {
      const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
      assert(/--safe-top:\s*var\(--safe-area-inset-top,\s*env\(safe-area-inset-top/.test(css), "--safe-top tanımı yok");
      assert(/body\s*{\s*padding-top:\s*var\(--safe-top\)/.test(css), "body üst güvenli alan dolgusu yok");
      assert(html.includes("viewport-fit=cover"), "viewport-fit=cover kaldırılmış");
    });
  }

  console.log(`\nSonuç: ${pass} geçti, ${fail} başarısız`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error("Test koşucusu hata verdi:", err);
  process.exit(1);
});
