# Changelog

## 3.6.0 — 2026-10-29

New look, chosen per platform from the [Refero](https://styles.refero.design/) style library. The website and the Android app now each wear the design language that fits them best. No behavior changed: tasks, timer, forest, history, backups and shortcuts work exactly as before.

### Changed

- **Web skin — Todoist reference** ([style](https://styles.refero.design/style/729ba7a8-35d5-44f3-abc0-1078ff6a3467)): warm Paper `#fefdfc` canvas with a Cream `#fff6f0` header band, Ink `#25221e` text, Ember `#cf3520` primary actions, Mint Wash / Forest greens for progress and the heatmap, 8px radii, Inter throughout. On desktop (≥1024px) tasks and the timer sit side by side again, with the timer sticky.
- **App skin — Things reference** ([style](https://styles.refero.design/style/ec0f5bca-8367-49e7-b8aa-73b3fa09a4a0)): Mist `#f2f5f7` canvas, borderless white cards (18px radius, soft shadow), Signal Blue `#2576eb` accents, system font (Roboto on Android), pill-shaped segmented controls, centered hero with the app tile. Selected automatically in the APK (`data-platform="app"`, also detected at runtime via Capacitor).
- **Themes:** light, dark, sepia and high contrast are available on both skins; colors were checked for WCAG AA (≥4.5:1 for text and button labels).
- **Fonts:** Bagel Fat One and the doodle accents (squiggle, background blobs) are removed — the app ships one font less.

### Logo & branding

- **New minimal logo:** three rising steps ending at a destination dot, on a rounded tile. Two colorways: Ink tile + Ember dot on the web, Signal Blue tile + white mark in the app.
- Updated: `icon.svg` (PWA + README), in-app header and splash logo, Android adaptive icon (vector + PNG foreground, `#2576eb` background, new themed-icon monochrome layer), legacy and round launcher PNGs for every density, all 11 splash PNGs (Mist canvas), Android 12+ splash background, `social-preview.png`, README screenshots.
- All raster assets are reproducible with `tools/brand/generate-assets.py`.

### Version

- `versionName` 3.6.0, `versionCode` 30600; PWA cache `minik-adimlar-v3.6.0`.

## 3.5.1 — 2026-10-28

Patch release fixing two visual defects found in the 3.5.0 redesign. No functional changes.

### Fixed

- **Dark theme button contrast:** the active Focus and Repeat buttons on mint background now use inkwell-navy glyphs in every theme (they were near-white in dark mode).
- **Generated assets:** all Android splash screens and the social preview card were regenerated — the "Small Steps" wordmark now renders in Bagel Fat One (a font-loading issue in the asset generator had silently fallen back to a generic serif, and a stale-cache issue had mis-scaled some images).

## 3.5.0 — 2026-10-28

New look: the whole app is redesigned around a doodled-planner visual system — warm paper canvas, inkwell-navy workhorse color, and mint / butter / coral as small functional accents. A new minimal footprints logo replaces the sprout everywhere. No behavior changed: tasks, timer, history, backups and shortcuts work exactly as before.

### Changed

- **Design system:** light theme rebuilt from the reference — Ash Canvas `#f2f2f2` page background, Paper White cards, Inkwell Navy `#151b31` text/buttons/borders, Mint `#86e0c1` for live/success badges and charts, Butter `#fedf89` for the tip box and break states, Coral `#ff5858` for emphasis (focus ring, today's bar, squiggle underline). 8/16/24px radii and warm-stone card shadows.
- **Typography:** headings and the splash wordmark now use Bagel Fat One (bundled WOFF2, latin + latin-ext with full Turkish support); UI text uses Inter (bundled variable WOFF2). Both load offline — no CDN. Fonts are part of the service-worker cache and the Android build.
- **Layout:** the main flow is a single roomy column (max 760px) instead of the old two-column grid; cards stack tasks → timer → forest → stats on every screen size.
- **Dark theme:** warm navy surfaces with white primary buttons (inverse-button pattern). Sepia and high-contrast themes keep their purpose, recolored to match.
- **Doodle accents:** footprints brand mark in the header, coral squiggle under the title, soft mint/butter background blobs (hidden in high-contrast and print).

### Logo & branding

- **New minimal logo:** two white footprints stepping up-right on an inkwell-navy rounded square — replaces the sprout. Updated: `icon.svg` (PWA), Android adaptive icon (foreground + `#151b31` background), all launcher PNGs (legacy + round, every density), all 11 Android splash PNGs (port + land), the in-app splash screen, `social-preview.png` and the README logo.

### Screenshots

- `docs/screenshots/desktop.png` and `mobile.png` re-captured with the new design (same seeded demo data style, DPR 2).

### Internal

- `manifest.json`: `theme_color` `#151b31`, `background_color` `#f2f2f2`, version 3.5.0.
- `sw.js`: cache `minik-adimlar-v3.5.0`, fonts added to the asset list.
- `scripts/build-app.mjs` copies the `fonts/` directory into `www/` for the APK.
- `test.html` dev harness recolored to the new palette.

## 3.4.0 — 2026-10-22

Android app + GitHub star badge. The repository is renamed to `small-steps` (old links redirect).

### Added

- **Android APK:** the web app is now also packaged as a native Android app (Capacitor). Signed APKs are attached to GitHub releases; the web PWA is unchanged. On mobile, the keyboard-shortcut `?` button is hidden (shortcuts need a keyboard) and the star badge takes its place. The two installs are separate — data does not sync between web and APK.
- **GitHub star badge:** the top bar now shows the repository's live star count, styled exactly like GitHub's own badge (logo + count + star icon). The count is fetched from the GitHub API and cached for 6 hours. When offline, the last cached count is kept; if none exists yet, the count is hidden (never shown as 0). Tapping the badge opens the repository — in the web build in a new tab, on Android in the system browser.
- Fixed: on the Android build the `?` shortcuts button was still visible — `.icon-button`'s `display: grid` overrode the `hidden` attribute. An explicit `#help-toggle[hidden] { display: none }` rule now guarantees it stays hidden (with regression test).
- Repository renamed `Small-Steps-` → `small-steps`; GitHub redirects old links.


## 3.3.5 — 2026-10-21

The splash screen now also plays when the installed app is resumed from the background.

### Fixed

- **Splash on installed-app resume:** when the app is reopened from the background without a page reload (the OS resumed the existing document), nothing showed — the splash only played on loads. In standalone (installed app) mode, returning to the foreground now replays the same branded splash. It is a pure overlay: the running timer, typed drafts and all app state are untouched. Ordinary browser tab switches do not trigger it — only installed-app resumes do.
- Combined with 3.3.4, the splash now covers both ways the installed app can open: a fresh/hidden document load (cold start) and a resume from memory.

## 3.3.4 — 2026-10-21

The splash screen now also shows when the installed app is launched from the home screen.

### Fixed

- **Splash screen on cold launch of the installed app:** the most likely explanation for the missing splash is that the installed PWA loads its document behind the OS/Chrome native launch screen, where the document is still hidden (`visibilityState: "hidden"`) while the splash's minimum display time already elapses — the user never saw it. The splash timer now starts only when the document actually becomes visible, and its entrance animations (sprout growing, title rising) are replayed at that moment, so the same screen that appears on an in-app refresh also appears whenever the app actually (re)loads. Within a visible document the behavior is unchanged: the splash shows for about 0.55s and then fades.
- **Resume path unchanged by design:** if the app is resumed from memory (no page load happens), it opens instantly with no splash — nothing is loading, and app state (running timer, typed drafts) is untouched. A regression test covers this: the splash does not reappear when a loaded document is hidden and shown again.

Note: the OS/Chrome native launch screen (icon + background color) still shows first on Android — that part is controlled by the system. This change makes the app's own branded splash appear right after it.

## 3.3.3 — 2026-10-21

Seamless updates — no more deleting and reinstalling the PWA after a release.

### Fixed

- **Updates now arrive without reinstalling:** when a new version's service worker activates, the open page refreshes itself once (`controllerchange`) — the user sees the new version without closing/reopening anything
- **Safe refresh:** the automatic refresh waits for a safe moment — it is deferred while a Pomodoro session is running, while text is being typed, or while the page is hidden, so nothing the user is doing is lost
- **Foreground update checks:** the app now checks for updates when it returns to the foreground (`visibilitychange`) and when connectivity returns (`online`) — an Android PWA sitting in the background picks up new versions on next open instead of waiting for a full relaunch
- `updateViaCache: "none"` on registration: service-worker update checks always hit the network (GitHub Pages' short HTTP cache no longer delays them)
- **Atomic versions:** HTML is now served from the same release cache as the app's assets (network as fallback), so loads prefer one consistent version instead of mixing freshly fetched HTML with old cached code

### Note for this one release

- Installations that are already open (running pre-3.3.3 code) need one ordinary close-and-reopen to pick up the new updater; every release after that updates fully automatically. No uninstall/reinstall is ever needed.

## 3.3.2 — 2026-10-21

### Fixed

- **Release version fields in the manifest:** the manifest gained `version` / `version_name` fields as release metadata, kept in sync with the release version by a test. Note: the version shown in Android's app-info screen for installed WebAPKs is controlled by Chrome's WebAPK metadata and may not reflect these fields — that display is outside the site's control

## 3.3.1 — 2026-10-21

English install experience and an opening splash screen.

### Changed

- **PWA install name is now English:** the manifest (name / short_name / description / shortcut) and the Apple web-app title are in English — the install prompt and the installed app's home-screen label now read "Small Steps" (the in-app UI stays in your chosen language)
- Static page title, meta description and `og:locale` (`en_US`) switched to English

### Added

- **Splash screen:** on every launch, a calm opening shows a growing sprout with the app name and "Find your own pace"; it fades out as soon as the first paint is ready (~0.5s), respects `prefers-reduced-motion`, and never blocks interaction beyond that

## 3.3.0 — 2026-10-21

Forest and daily streak.

### Added

- **Forest** — every completed focus session plants a tree; the forest card shows the last 14 days with procedurally drawn trees (deterministic per day, zero assets). Days with more than 4 sessions show a "+n" pill; empty days show a seed dot
- **Daily streak (Duolingo-style)** — consecutive active days (a task completed or a focus session ended), shown as a 🔥 badge on the forest card, with the longest streak on record. Streaks can exceed the 90-day history window via a compact streak tail that is preserved when history is pruned
- **Session counter in history** — `sessions` per day (a focus session is one tree, regardless of duration); legacy data without it is untouched — the forest starts fresh rather than guessing from minutes
- **Stats tile change** — the stats card's streak tile became "Sessions this week" (the streak now lives on the forest card, avoiding two streak displays)

### Fixed

- History pruning now carries a streak tail so long streaks survive the 90-day window, and gaps in pruned days cut the tail correctly

### Docs

- **README:** English is now the primary README (the former Turkish README.md moved to README.tr.md)

## 3.2.0 — 2026-10-21

Tekrarlayan görevler, Todoist'ten içe aktarma ve keşfedilebilirlik.

### Eklendi

- **Tekrarlayan görevler** — üst seviye görevdeki ↻ düğmesi: yok → her gün → hafta içi → her hafta döngüsü. Tamamlanınca yeni occurrence otomatik doğar (geçmiş istatistiğe işlenir) ve görev satırında tekrar rozeti (↻ Her gün tekrar) + tarih rozeti (bugün / yarın / tarih) görünür
  - **Tekrar kuralları:** erken tamamlama zamanlanan günün ötesine atlar; gecikmede birikim yok (geçen günler tek tek doğmaz)
  - **Geri açma koruması:** tamamlanan occurrence yalnızca yeni occurrence'a hiç dokunulmadıysa geri açılabilir (yeni occurrence o zaman silinir ve istatistik geri alınır). Dokunulduysa her iki kayıt da korunur ve toast nedenini açıklar
  - Tekrar yalnızca alt görevi olmayan üst seviye görevlerde kullanılabilir; tamamlanmış occurrence'larda kontrol sunulmaz (yanlışlıkla yeni seri doğmasın)
- **Todoist'ten içe aktarma (CSV)** — Ayarlar → Verilerin → Todoist'ten içe aktar: Todoist'in resmi CSV dışa aktarma dosyasını yükle; TYPE=task satırları görev olarak eklenir (INDENT 2+ alt görev olur, tek seviyeye düzleştirilir), öncelik 1-4 eşlenir, YYYY-MM-DD tarihleri aktarılır. Bölüm/not satırları ve doğal dil tarih/tekrar ifadeleri atlanır — onay penceresi kaç satır atlanacağını gösterir. Ayırıcı virgül ya da noktalı virgül olabilir (otomatik algılanır)
- **Paylaşım önizlemesi** — Open Graph / Twitter kart etiketleri ve 1280×640 sosyal önizleme görseli eklendi; repo açıklaması, konu etiketleri ve ana sayfa bağlantısı ayarlandı

### Değişti

- **CSV dışa aktarma** iki yeni sütun: `repeat` (daily/weekdays/weekly) ve `due_date` (YYYY-MM-DD)

### Davranış kuralları (belgelendi)

- Yeni occurrence yalnızca "tamamlanmamış → tamamlandı" geçişinde doğar — yeniden yükleme/içe aktarma çoğaltmaz
- Tamamlananları temizle, tekrarlayan görevin yeni occurrence'ına dokunmaz
- **Tekrar ve alt görev birbirini dışlar:** tekrarlayan görevde ＋ görünmez, alt görevlisi görevde ↻ görünmez; içe aktarılan uyumsuz veride alt görevlisi görevin tekrarı temizlenir
- **Geri açma muhasebesi gün aşırı doğrudur:** sayaç, tamamlanınca yazılan güne geri alınır — dün tamamlanıp bugün geri açılan görev dünün sayacını düşürür, bugünkü sayaca dokunmaz
- **Tekrarı değişen successor da "dokunulmuş" sayılır:** yeni occurrence'ın metni, önceliği, tekrarı veya odak toplamı değiştiyse geri açma engellenir
- Successor kullanıcı tarafından silindiyse geri açma serbesttir (kullanıcının açık tercihi)
- **Bozuk CSV reddedilir:** kapanmamış tırnak içeren dosya onaya hiç gelmez; imkânsız takvim tarihleri (2026-13-45) aktarılmaz ve atlanan tarih sayısı onay penceresinde ayrıca belirtilir
- Bölüm (section) satırı, girintili görevlerin ebeveyn bağlamını sıfırlar — bölüm sonrası INDENT 2 görev üst seviyeye düşer

## 3.1.0 — 2026-10-21

Alt görevler ve CSV dışa aktarma: büyük işleri gerçekten küçük adımlara bölme.

### Eklendi

- **Alt görevler (tek seviye)** — herhangi bir görevin ＋ düğmesiyle alt görev ekle (Enter ile satır içi, Esc iptal). Ebeveyn satırında ilerleme rozeti (ör. 2/5) görünür
- **Ağaç silme ve geri alma** — üst görev silinince alt görevleri de gider; toast'taki geri alma yalnızca silinen kayıtları eski konumlarına geri koyar (toast açıkken eklenen yeni görevler korunur)
- **CSV dışa aktarma** — Ayarlar → Verilerin → Görevleri indir (CSV): tip, metin, durum, öncelik, odak dakikası, ebeveyn metni ve tarihler; UTF-8 BOM + RFC 4180 kaçış (Excel uyumlu)
- **Otomatik uygulama testleri** — `tools/test-app.js` gerçek app.js'yi jsdom'da çalıştırıyor: eski veri uyumluluğu, alt görev akışları, ağaç silme/geri alma, gruplu arama/filtre, CSV kaçış kuralları, bozuk veri temizleme, tamamlananları temizleme. CI'a eklendi

### Davranış kuralları (belgelendi)

- Durum ve arama filtreleri üst seviye görevlere uygulanır; alt görevler bağlam olarak ebeveynin altında görünür. Aramada alt görev eşleşmesi ebeveyni de listeye çıkarır
- Sayaç ve günlük istatistik yalnızca üst seviye görevleri sayar; alt görev ilerlemesi ebeveyndeki rozettedir
- Bir üst görevi tamamlamak alt görevleri otomatik tamamlamaz (ve tersi) — tamamlama her zaman açık seçimdir
- **Tamamlananları temizle**, tamamlanan üst görevin AÇIK alt görevlerini silmez — onları üst seviyeye terfi ettirir; geri alma hiyerarşiyi geri getirir (terfi eden görev arada kendi alt görevini edinmişse tek seviye kuralı için üst seviyede kalır)

### İçe aktarma sağlamlaştırma

- Bozuk yedekler artık otomatik düzeltliyor: yinelenen id'ler atılır, yetim/kendini işaret eden/iki seviye derin `parentId` kayıtları temizlenir; odak görevi listede yoksa sıfırlanır

## 3.0.1 — 2026-10-20

Doğrulama turunda (v3.0 kod incelemesi) yakalanan doğruluk ve sunum düzeltmeleri:

### Düzeltildi

- **Yedek eksiksiz geri gelmiyordu:** içe aktarma artık temayı, günlük odak sayacını ve seçili görevi de geri yüklüyor; zamanlayıcı yeni sürelerle eşitleniyor
- **Gece yarısı muhasebesi:** duraklatıp devam ettirmek oturum gününü artık değiştirmiyor; yeni mod/sıfırlama yeni oturum sayılıyor. Gece yarısını geçen oturumun kredisi yalnızca geçmişe yazılıyor, bugünün sayacı şişirilmiyor (sahte saatle uçtan uca doğrulandı)
- **Alt bilgi tutarsızlığı:** "Bugün: N görev" sayacı da artık geçmişten okunuyor — silinen tamamlanmış görev gün sayacını düşürmüyor
- **Service worker:** kurulum hatalarını gizleyen sessiz `catch` kaldırıldı; önbellek adı sürümle eşitlendi (varlık değişikliklerinde eski önbellek sorunu notu eklendi)
- **README:** mobil ekran görüntüsü mobil düzen düzeltmesinden önce alınmıştı — güncel kodla yeniden üretildi; belgeler Türkçe birincil hale geldi (İngilizce sürüm: README.en.md — v3.2 sonrası ana README oldu, bkz. Unreleased)

### Doğrulandı

- Gerçek çevrimdışı mod: SW kurulumu + çevrimdışı yeniden yükleme + görev ekleme + zamanlayıcı (ağ kesikken uçtan uca test edildi)
- Yedek gidiş-dönüşü: dışa aktar → tüm veriyi sil → içe aktar → görevler, tema, günlük sayaç, dil geri geldi

## 3.0 — 2026-10-20

Şimdiye kadarki en büyük sürüm: Small Steps bir zamanlayıcı + liste ikilisinden küçük bir odak çalışma alanına dönüştü.

### Eklendi

- **Göreve bağlı odak** — görev seç (◎), tamamlanan her odak oturumu dakikalarını o göreve işliyor; görev satırında ve zamanlayıcı kartında görünür
- **Öncelikler** — yok / düşük / orta / yüksek, renkli şeritle
- **Görev araması** — anlık filtreleme, aksan dostu eşleştirme (Türkçe İ/ı dahil)
- **90 günlük odak ısı haritası** — haftalık grafiğin altında GitHub tarzı tutarlılık ızgarası
- **JSON yedekleme** — Ayarlar → Verilerin: görevler, ayarlar, geçmiş, tema ve dilin tam yedeği
- **Klavye kısayolu yardımı** — `?` tuşu veya araç çubuğu düğmesi
- 25 yeni çeviri dizgisi × 12 dil
- CI iş akışı: sözdizimi denetimleri + çeviri anahtar/yer tutucu paritesi

### Düzeltildi

- **Service worker hiç kurulamıyordu** — `styles.css` dosyasını önbelleğe almaya çalışıyordu ama dosyanın adı `style.css`; çevrimdışı mod sessizce çalışmıyordu
- **Görev silinince istatistikler kayboluyordu** — tamamlamalar artık günlük geçmiş günlüğüne kaydediliyor; haftalık istatistikler ve seriler silme/temizlemeden etkilenmiyor
- **Odak kredisi yanlış süreyi kullanıyordu** — odak süresi ayarını oturum ortasında değiştirirsen yanlış miktar yazılıyordu; oturumlar artık başladıkları süre ve günle kaydediliyor (gece yarısı geçişi düzeltmesi dahil)
- **RTL rozet yönü** — "1 / 4" sayacı Arapça'da tersten dizilmiyor
- Görev seçili değilken boş odak çipi görünmüyor
- Dar telefonlarda görev metni kelime ortasından bölünmüyor (düğmeler alt satıra taşınıyor)
- Türkçe arama eşleştirmesi ("ikinci" artık "İkinci"yi buluyor)

### Değiştirildi

- Service worker: HTML istekleri ağ-öncelikli (güncellemeler anında ulaşır), varlıklar sürüm başına önbellek-öncelikli
- Mobil görev satırları: okunabilir metin için iki satır düzen
- README ekran görüntüleri ve doğru özellik listesiyle yeniden yazıldı

## 2.1

- Haftalık istatistikler, seri sayacı, 4 tema, 12 dil, PWA çevrimdışı desteği
