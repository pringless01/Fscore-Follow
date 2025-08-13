# Flashscore Takipçi (MV3, Kişisel)

**Amaç:** Flashscore'da seçtiğin maçları **DOM Modu** ile anlık takip etmek; FS sekmesi yoksa **hafif polling** ile (~20s hedef, 1dk içinde 3 dilim) sürdürmek. Sessiz bildirim, global draggable toolbar, filtreler, 24 saatlik geçmiş ve JSON export içerir.

> **Yasal:** Kişisel kullanım. Agresif scraping yok. Sadece kullanıcının **görünen DOM**’u veya önceden takip edilmiş maçın **detay URL**’i **makul hızda** fetch edilir. Flashscore / Livesport kullanım şartlarına saygı.

## Kurulum
1. Bu klasörü indir.
2. Chrome → `chrome://extensions` → **Developer mode ON**.
3. **Load unpacked** → klasörü seç.
4. Bildirim iznini ver. (İkonlar yoksa bile data URI fallback devrede.)

## Kullanım
- Maç satırlarında sağ üstte **“Takip et”** butonu görünür. Tıklayınca takip listesine eklenir.
- Sol-alt **“Bu sayfadaki CANLILARI takip et (≤20)”** ile toplu ekleme.
- Her sayfada sağ-alt **global toolbar**:
  - Filtre: Tümü / Canlı / Yaklaşan / Biten
  - Maç satırında: **Aç** (detay), **🔔/🔕** (sessize al), **✖** kaldır
  - Yaklaşan maç 5 dk kala **“Başlıyor”** etiketi (saat DOM’dan okunabiliyorsa)
  - **Export**: JSON indir (tracked + scores + history)
- **Ayarlar** (popup):
  - Bildirim Aç/Kapat
  - DND (isteğe bağlı)
  - Polling Aç/Kapat + aralık (20s, Chrome kısıtı nedeniyle yaklaşık)
  - Toolbar göster/gizle ve konumu sıfırla

## Nasıl Çalışır
- **DOM Modu:** Liste satırlarını (`div.event__match` varyantları) gözler. Skor `.event__scores | .event__score`, dakika/statü `.event__time | .event__stage`. Observer olayları **400ms throttle** ile arka plana taşınır.
- **LiveNodeBinding:** Flashscore sıkça node değiştirir. Hedef row koparsa (isConnected=false), **matchId** ile yeni node bulunur ve **otomatik rebind** yapılır. Liste kökü global `MutationObserver` + SPA `pushState/popstate` ile tetiklenir.
- **Polling:** FS sekmesi **kapalıysa** (PING gelmiyorsa) ve takip listesi boş değilse, dakika içinde **3 dilim** halinde takipli maçların detay sayfaları `fetch` ile yoklanır (regex skor + basit statü). Skor değişirse “gol” olarak işaretler (oyuncu adı yok).
- **Bildirim:** Sessiz. Dedup’lu. DND saatlerinde bastırılır. Tıklayınca maç detayını açar.

## Bilinen Edge Caseler
- Flashscore HTML yapısı değişirse seçiciler güncellenmeli.
- Liste varyantlarında takım/score alanları farklı olabilir; çoklu selector + regex fallback mevcut.
- Polling yalnız skor değişimini “gol” sayar; oyuncu adı ayrıştırılmaz.
- Bazı sayfalarda iç iframe’ler olabilir; content script `all_frames:true` ile yüklenir.
- Chrome MV3 servis worker uyku/uyanma akışında kısa gecikmeler olabilir.

## Sorun Giderme
- **Skor görünmüyor / dakika ilerlemiyor (1–2 dk sonra):** LiveNodeBinding kopan DOM’u otomatik rebind eder. Yine de görünmüyorsa sayfada **SPA rota** değişmiş olabilir → kısa bir scroll/filtre değiştir; observer rebind tetiklenir (log gerekirse DevTools).
- **Karşılaşma adı boş:** `.event__participant--home/--away` yoksa ilk iki `.event__participant` alınır. Bu da boşsa satır görünürlüğü/DOM farklılığı olabilir (lig tipine bağlı).
- **Extension context invalidated:** SPA/sekme kapanışında doğaldır. Tüm `sendMessage` çağrıları **safe** sarılıdır; hata UI’yı bozmaz ve otomatik re-init vardır.
- **Unable to download all specified images:** Bildirim ikonu bulunamazsa **data URI fallback** devreye girer.

## Test Planı
1. Bir lig sayfasında 3 maça **Takip et** → toolbar’da **başlık+skor+statü** anında görünür.
2. Canlı maçta skor değiştir (gol) → toolbar satırı **yeşil highlight** + **sessiz bildirim**.
3. 3–5 dk boyunca “Show more”/scroll/filtre → takip kopmaz (rebind).
4. Başka lig sayfasına SPA ile geç → takip devam.
5. Tüm FS sekmelerini kapat → ~1dk içinde polling devreye girer; skor değişimi yakalanır.
6. DND saatlerinde bildirim çıkmaz.
7. Export → JSON indir, tracked+scores+history içerir.
8. Max takip 20; 21. eklemede uyarı döner.

## Not
- Offscreen DOM parser **opsiyonel** ve **kapalı**. Gerekirse `offscreen.md` ile açılabilir; kişisel kullanım ve makul hız koşulu korunmalıdır.
