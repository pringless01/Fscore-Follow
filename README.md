# Fscore Follow (MV3)

Flashscore maç takip uzantısı. Liste sayfasında skor değişimlerini DOM ile yakalar; gol olduğunda neon "GOOOOL!" overlay gösterir ve opsiyonel sistem bildirimi yollar. Gol tespit edilince detay sayfasından timeline/summary okunarak olay bilgisi (dakika, gol atan, asist, tür) zenginleştirilir.

## Kurulum
- npm i (veya pnpm i)
- Chrome → chrome://extensions → Developer Mode → Load unpacked → bu klasörü seç.

## İzinler
- offscreen: Offscreen belge ile HTML parse ve gerekirse sayfayı gezdirme.
- notifications: Gol olduğunda bildirim.
- storage: Takip edilen maçlar ve ayarlar.
- scripting: Offscreen fallback’te DOM’dan veri çekmek için.
- activeTab: İçerik etkileşimleri.
- host_permissions: `*://*.flashscore.com/*`, `*://*.flashscoreusa.com/*`, `*://*.flashscore.info/*`.

## İçerik Scripti (DOM Modu)
- `content/dom-watch.js` maç satırlarını ve skor/stage değişimlerini izler.
- 300 ms debounce + hash dedupe (`home|away|score|stage`).
- Sadece takip edilen maçlar için mesaj gönderir (satıra pin eklenir).

## Service Worker
- `sw/index.js` mesaj dinleyicileri top-level.
- `ensureOffscreen()` mevcut offscreen’i kontrol eder; yoksa oluşturur.
- `notifyAndOverlay()` bildirim + `SHOW_GOAL` mesajı ile overlay’i tetikler.
- `withLifetime()` uzun işlemleri güvenle bekletir.

## Offscreen
- `offscreen.html` + `offscreen.js`. `PARSE_TIMELINE` mesajını yakalar.
- Mod 1: `fetch` + `DOMParser` ile parse.
- Mod 2: Gerekirse gezdirip (teorik) `chrome.scripting.executeScript` ile okuma (not: MV3’te offscreen için tabId yok, bu yüzden asıl mod Mod 1’dir).

## Overlay UI
- `content/goal-ui.js` + `content/goal.css`. 2.8 sn overlay, neon efekt. Penaltı durumlarında `shake` sınıfı verilebilir.

## Popup
- `popup/` içinde takip edilen maç listesini basitçe gösterir.

## Test
- `samples/sample.html` örnek HTML.
- Çalıştır: `npm run test:parser`.

## Debug
- Offscreen: chrome://inspect/#extensions veya chrome://inspect/#other üzerinden offscreen’i izleyebilirsin.

## Sınırlar
- Flashscore SPA yapısında HTML zaman zaman dinamik gelir; Mod 1 işe yaramazsa Mod 2’nin sınırlamaları vardır. Primer yaklaşım `fetch + DOMParser`.
- Rate-limit ve erişim kısıtlarına saygı; sadece kullanıcının tarayıcısında çalışır.
