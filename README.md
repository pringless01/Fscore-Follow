# Flashscore Takipçi (MV3)

Kişisel, sessiz bildirimli ve global toolbar’lı Flashscore maç takip uzantısı. DOM Modu önceliklidir; FS sekmesi yoksa yedek Polling devreye girer.

## Özellikler
- Her maç satırına idempotent "Takip et" butonu enjekte edilir.
- Skor ve dakika/stage DOM’dan gerçek zamanlı izlenir; re-render/replacement durumunda otomatik rebind (LiveNodeBinding).
- SPA navigasyonu patch edilir; route değişince yeniden tarama ve bağlama yapılır.
- FS sekmesi kapalıyken ~20s efektif döngü ile detay HTML’i çekip minimal parser ile değişimler yakalanır.
- Global draggable toolbar: filtreler (Tümü/Canlı/Biten/Yaklaşan), JSON export, geçmiş görünümü, sessize alma, pin, kaldırma.
- Sessiz sistem bildirimleri; DND zamanlarına saygı.
- 24 saatlik geçmiş tutar, JSON export mümkündür.

## Kurulum
1. Bu klasörü Chrome’da Geliştirici Modu açıkken Yüklenmemiş paket olarak yükleyin.
2. Manifest izinleri Flashscore alanlarını kapsar. Ek varyantlar için `manifest.json` içindeki `host_permissions` düzenlenebilir.

## Kullanım
- Flashscore lig/maç listesi sayfalarında satırların sağ üstünde "Takip et" butonu görünür.
- Butona tıklayınca maç Toolbar listesine düşer; skor/stage anlık görünür.
- Toolbar sağ altta açılır, sürükleyerek konumlandırabilirsiniz. Üst menüden filtreleyebilir, JSON export alabilir, geçmişi görüntüleyebilirsiniz.
- Maç satırlarından detay sayfasına açabilir, sessize alabilir, kaldırabilir, pin ile üste alabilirsiniz.

## Ayarlar (Popup)
- Bildirimler: Açık/Kapalı (varsayılan Açık)
- DND: İsteğe bağlı aralık (varsayılan kapalı)
- Polling: Açık (varsayılan) ve aralık (20s)
- Toolbar: Göster/Gizle, Konumu sıfırla

## Teknik Notlar
- Seçiciler: skor `.event__scores` ve `.event__score`; yedek olarak home/away part’lardan regex birleştirme.
- Dakika/statü: `.event__time` ve `.event__stage`; HT/FT/1st/2nd/ET/LIVE/PEN gibi token’lar öncelikli.
- MatchId çıkarımı: `row.id^=g_` > `a.eventRowLink[href*="/match/"]` > satır metni hash.
- LiveNodeBinding: hedef row koparsa `MutationObserver` + periyodik rebind ile yeniden bağlanır.
- SPA: `history.pushState` patch ve `popstate` dinlemesiyle kısa gecikmeyle yeniden tarama.
- Context invalidated: `safeSendMessage` hataları yutar, init tekrarları idempotent.

## Bilinen Edge Caseler
- Çok büyük lig sayfalarında sürekli re-render throttling sınırlarına gelebilir; throttle 400ms’dir.
- Bazı spor varyantlarında (tenis, basketbol) skor formatı farklı olabilir; regex `\d+-\d+` olana öncelik verir.
- Flashscore layout değişirse seçicilerin güncellenmesi gerekir.

## Sorun Giderme
- Extension context invalidated hataları: İçerik scriptleri kendini tekrar başlatır, safeSendMessage hataları yutar. Sayfayı yenilemek genelde yeterlidir.
- Skor görünmüyor/gol algılanmıyor: Seçiciler `.event__scores/.event__score` ile ve fallback ile çıkarılır; DOM değiştiyse LiveNodeBinding rebind eder.
- Dakika ilerlemiyor: `.event__time/.event__stage` izlenir, SPA rebind ile güncel kalır.

## Test Adımları
1. Bir lig sayfası açın, 3 canlı maçı "Takip et" ile ekleyin. Toolbar’da başlık+skor+statü anında görünmeli.
2. 3–5 dk boyunca listeyi kaydırın ve "Daha fazla maç" yükleyin; takip kopmamalı, logda rebind izleri görünür (DevTools > Console).
3. Başka bir lig rotasına geçin; takip devam etmeli (SPA rebind).
4. FS sekmelerini kapatın; yaklaşık 1 dakika içinde polling etkin olup skor değişimi yakalayabilmeli.
5. Gol olduğunda toolbar satırı kısa süre yeşil highlight olur ve sessiz bildirim çıkar.

## CLI Parser
- `npm run parse-sample`: `html_ornegi.html` üzerindeki ilk 5 maçı JSON olarak döndürür.
- `npm run parse <dosya-yolu veya URL> [limit]`: Belirtilen kaynaktan maçları çekip JSON olarak yazar.

## Yasal Not
Bu uzantı yalnızca kullanıcının gezdiği sayfanın görünür DOM’unu ve takip edilen maçların detay sayfası HTML’ini makul hız/limitlerde işler. Herhangi bir resmi API kullanılmaz.
