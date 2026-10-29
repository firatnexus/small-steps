/**
 * Mobil (Capacitor) sürüm için web varlıklarını www/ altına kopyalar.
 * Web sürümü kök dizinde olduğu gibi kalır — yalnızca APK paketi bu kopyayı kullanır.
 * Kullanım: node scripts/build-app.mjs
 */
import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const WWW = path.join(ROOT, 'www');

mkdirSync(WWW, { recursive: true });

const FILES = ['index.html', 'app.js', 'style.css', 'translations.js', 'icon.svg', 'manifest.json',
  'fonts/inter-latin.woff2', 'fonts/inter-latin-ext.woff2'];
mkdirSync(path.join(WWW, 'fonts'), { recursive: true });
for (const f of FILES) {
  copyFileSync(path.join(ROOT, f), path.join(WWW, f));
  console.log('kopyalandı:', f);
}

/* APK içinde PWA manifestine gerek yok; SW kaydı zaten Capacitor'da atlanır.
   Bağlantıyı kaldırıp console gürültüsünü önlüyoruz. */
const idxPath = path.join(WWW, 'index.html');
let html = readFileSync(idxPath, 'utf8');
html = html.replace(/\s*<link rel="manifest" href="manifest\.json">/, '');
/* v3.6: APK, Things referanslı "app" görünümünü kullanır (web: Todoist). */
html = html.replace('<html lang="tr" data-platform="web">', '<html lang="tr" data-platform="app">');
html = html.replace('<meta name="theme-color" content="#fefdfc">', '<meta name="theme-color" content="#f2f5f7">');
writeFileSync(idxPath, html);
console.log('index.html: data-platform="app" ayarlandı');
console.log('index.html: manifest bağlantısı kaldırıldı (APK içinde gereksiz)');

console.log('www/ hazır.');
