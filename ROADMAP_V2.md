# Elazığ Şehir — Yol Haritası v2

Bu belge v1.x'in (bkz. `ROADMAP.md`) devamıdır. Odak: **ulaşım ekranında otobüslerin güzergah üzerinde canlı ve akıcı hareket etmesi**, OBS'ye **Mezuniyet Durum Analizi** eklenmesi ve v1'den devreden altyapı işleri. Her madde; doğrulanmış veri kaynağı, davranış tanımı, kabul kriterleri ve riskleriyle yazılmıştır. Kod içermez; uygulama sırası ve tasarım kararları `DESIGN_PLAN.md` ile birlikte okunmalıdır.

**Efor ölçeği:** `S` ≈ yarım–1 gün · `M` ≈ 2–4 gün · `L` ≈ 1 hafta+

---

## 0. Canlı API doğrulaması (2026-09-13, 12:25–12:35)

Tüm ölçümler `elazigkart.elazig.bel.tr` üzerinde, uygulamanın kullandığı başlıklarla (`Referer: /WhereMyBus`, mobil UA) yapıldı.

### 0.1 Şehir geneli araç ucu — `GET /api/wheremybus/overview/vehicles`

| Ölçüm | Sonuç |
|---|---|
| Durum | 200 · yanıt `{ generatedUtc, vehicles[] }` (**`result` sarmalayıcısı yok**) |
| Araç sayısı | 50–53 (sabah 12:25) |
| Alanlar | `key`, `plate`, `lon`, `lat`, `dir` (0–359°), `routeCode` — **hız, istikamet (G/D), editDate yok** |
| Gecikme | ilk istek ~460 ms, sonrakiler ~30 ms (sunucu tarafı önbellek) |
| Yenilenme | `generatedUtc` **~3 sn'de bir** değişiyor (ölçülen aralıklar: 3, 3, 2, 6, 3 sn). Arada aynı anlık görüntü döner. |
| Hareket | 1 sn'lik yoklamada her yeni anlık görüntüde 3–13 araç yer değiştirdi |
| Sıçrama mesafesi | iki anlık görüntü arasında p50 **121 m**, p90 **220 m**, maks **386 m** |

> Sonuç: Bu uç, tüm şehri tek istekle 2–3 sn'de bir yoklamak için uygun ve **sunucuya yük bindirmez** (önbellekten servis ediliyor). Ancak bir güncellemede otobüs ortalama 120 m sıçradığı için **haritada "ışınlanma" görünür** — bugünkü uygulamada tam olarak olan bu (`updateBuses` her seferinde tüm işaretçileri silip yeniden çiziyor). Akıcı hareket için istemci tarafında ara-değerleme (interpolasyon) şart.

### 0.2 Hat bazlı araç ucu — `GET /api/wheremybus/vehicles/{variantId}`

| Ölçüm | Sonuç |
|---|---|
| Alanlar | `licencePlate`, `latitude/longitude`, `gpsDir`, **`hiz`** (km/s), **`editDate`** (UTC), **`istikamet`** (G/D), `routeCode`, `validatorNo` |
| GPS tazeliği (12 hat, 22 araç) | `editDate` yaşı p50 **5 sn**, p90 **122 sn**, maks **261 sn** |
| Hareket hâlinde | 22 aracın 14'ünde `hiz > 0` |

> Sonuç: Hat seçiliyken bu uç kullanılmalı (hız + yön + tazelik var). 15 dakikadan eski `editDate` → araç "canlı değil" sayılıp gizlenmeli (belediye sitesi de aynı eşiği kullanıyor).

### 0.3 Güzergah geometrisi

| Uç | Sonuç |
|---|---|
| `GET /api/wheremybus/overview` | **44 hattın tüm çizgileri tek istekte** (`routes[].lines[][]` = `[lon,lat]` dizileri; 33 ms). Şehir geneli modda hat çizgisine oturtma için kaynak bu. |
| `GET /api/wheremybus/variants/{routeId}` | Hat 1: Gidiş 176 nokta, Dönüş 249 nokta (GeoJSON LineString). Uygulama zaten `coordinates` olarak ayrıştırıyor. |

### 0.4 Diğer uçlar

| Uç | Durum |
|---|---|
| `GET /api/smartstop/approaching/{stopId}` | 200 · `remainingTimeCurr`, `remainingNumberOfBusStops`, `busPlate`, `routeVariantId` (bazı satırlarda plaka/durak sayısı `null`) |
| `GET /api/howtogo/plan` | **hâlâ 502** "Upstream erişilemedi" — Plan B (kendi planlayıcımız) geçerli kalır |
| Push kanalı (SignalR / WebSocket / SSE) | **yok** — yalnızca yoklama |

### 0.5 Belediyenin kendi harita sayfası ne yapıyor? (`/js/wheremybus.js`, MapLibre)

Belediye sitesi sorunun aynısını çözmüş; parametreleri referans alınmalı:

| Parametre | Değer | Anlamı |
|---|---|---|
| `overviewPollMs` | 2000 | şehir geneli yoklama |
| `vehiclePollMs` | 5000 | hat modu yoklama |
| `busKmh` | 20 | animasyon hızı (duraklar dâhil şehir içi ortalama) |
| `SNAP_POS_M` / `SNAP_DIR_M` | 200 m | araç hat çizgisine bu kadar yakınsa konumu çizgiye oturtulur, yönü segment yönünden alınır |
| `PATH_MAX_M` | 900 m | iki konum arası bundan uzunsa çizgi üzerinde yol kurulmaz |
| `TELEPORT_M` | 300 m | yol kurulamadı ve sıçrama bundan büyükse animasyon yok, araç yeni yerde yanıp sönerek belirir |
| `ANIM_MIN/MAX_MS` | 1500 / 45000 | animasyon süresi = mesafe / hız, bu aralığa kırpılır |
| `STALE_MS` | 15 dk | `editDate` eskiyse araç hat modunda gizlenir |
| `LOD_ZOOM` | 16.3 | altında plakalar gizlenir, kümeleme devrede |
| `generatedUtc` eşitse | dokunma | aynı anlık görüntü gelince süren animasyon sıfırlanmaz; animasyon süresi iki **veri değişimi** arasında ölçülen gerçek süredir |
| Takip modu | var | araca tıklayınca kamera onu izler, ışınlanınca kamera da geçer |
| Durak listesinde araç | var | otobüs iki durak arasındaysa liste satırlarının arasına "otobüs burada" şeridi eklenir |
| "Binebileceğin en iyi durak" | var | otobüsün **önündeki** duraklar arasından yürüyerek yetişilebilen ve otobüsün en erken ulaştığı durak (yürüyüş 5 km/s) |

---

# v2.0 — "Canlı Ulaşım" (hedef: 3–4 hafta)

## G1. Otobüsler güzergah üzerinde akıcı hareket etsin (`L`) — **öncelik 1**

**Amaç:** Bugün otobüs işaretçileri 5 sn'de bir silinip yeni koordinata "zıplıyor" ve sabit emoji ile çiziliyor. Hedef: araçlar hat çizgisi üzerinde, burnu gidiş yönüne bakarak, sabit hızla süzülsün; veri gelmediğinde bile bir sonraki güncellemeye kadar hareket devam etsin.

**Veri:** §0.1 (şehir geneli) + §0.2 (hat modu) + §0.3 (çizgiler).

**Davranış tanımı**

1. **İşaretçi kalıcılığı.** Harita katmanında her araç plakaya (`key`) göre tek bir işaretçi tutulur; güncellemede işaretçiler silinmez, hedef konumu değişir. Listeden düşen araç kaldırılır; yeni araç yerinde belirir (kısa "belirme" animasyonu).
2. **Çizgiye oturtma (snap).** Aracın ham GPS noktası, ait olduğu hattın çizgisine (şehir genelinde `overview.routes[].lines`, hat modunda seçili varyantın geometrisi) izdüşürülür. Çizgiye ≤200 m ise konum çizgi üstüne taşınır ve yön, üzerinde bulunduğu segmentin azimutundan alınır (GPS `dir` yalnızca çizgi yoksa kullanılır). 200 m'den uzaksa hat modunda araç gizlenir (garaja çekilmiş / başka görevde), şehir genelinde ham konumda gösterilir.
3. **Çizgi üzerinde yol kurma.** Eski ve yeni konum aynı çizgiye oturuyorsa aradaki köşe noktalarından geçen bir yol kurulur; araç bu yol boyunca sabit hızla ilerler ve burnu her an bulunduğu segmentin yönüne döner. Yol, düz mesafenin 3 katından uzunsa (yanlış kola oturma) düz geçişe düşülür.
4. **Süre.** Animasyon süresi = mesafe / 20 km/s, 1,5–45 sn'ye kırpılır. Yeni veri geldiğinde araç **kaldığı yerden** yeni hedefe yönelir (radar mantığı; veri aralığı kadar geriden ama kesintisiz).
5. **Işınlanma.** Yol kurulamadı ve sıçrama >300 m ise animasyon yapılmaz; araç yeni konumda 2 sn yanıp sönerek belirir.
6. **Aynı anlık görüntü.** `generatedUtc` değişmediyse hiçbir şey yapılmaz; süren animasyon sıfırlanmaz. Animasyon süresi iki gerçek veri değişimi arasında ölçülen süreye göre uyarlanır (sunucu yavaşlarsa araç yavaşlar, durmaz).
7. **Yoklama kadansı.** Şehir geneli: 2 sn (önbellekten geliyor, ucuz). Hat modu: 5 sn. Ekran arka plandayken (`AppState`) ve ulaşım sekmesi odakta değilken yoklama durur; geri gelince ilk istek hemen atılır.
8. **Tazelik.** Hat modunda `editDate` 15 dk'dan eskiyse araç gösterilmez. Şehir genelinde bu bilgi olmadığı için 3 ardışık anlık görüntüde hiç kıpırdamayan araç "duruyor" olarak soluk çizilir.
9. **Yön/hız rozeti.** Araç ikonu yön okuyla döner; hat modunda ikon yanında `hiz` (km/s) küçük etiket olarak görünür; 0 km/s ise "durakta" ipucu.
10. **Detay seviyesi (LOD).** Zoom < 16 iken plaka etiketleri gizlenir, yalnızca hat numarası kalır; şehir genelinde >40 araç varken kümeleme değil **etiket seyreltme** yapılır (işaretçiler her zaman ayrı görünür, kümeleme hareketi bozar).
11. **Performans.** Tek animasyon döngüsü (`requestAnimationFrame`), animasyon bitince döngü durur; her karede yalnızca hareket hâlindeki araçlar güncellenir. Hedef: 60 araç ile 60 fps, orta segment Android'de 8 dk canlı modda %3'ten az pil.

**Kabul kriterleri**
- Şehir geneli modda otobüsler hiçbir zaman "zıplamaz"; kavşaklarda çizgiyi takip ederek döner.
- Veri 10 sn gelmese bile araç önceki hedefe doğru hareketine devam eder, durunca yerinde bekler.
- Hat modunda sadece o hattın çizgisine oturan, taze GPS'li araçlar görünür; sayı "Aktif Araç" rozetiyle tutarlı.
- Ekran arka plana alınınca ağ isteği durur (log ile doğrulanır).

**Riskler**
- Hat ile çizgi eşleşmesi `routeCode` üzerinden yapılır; `overview` 44 hat döndürüyor, `routes` 49 — 5 hattın çizgisi şehir genelinde eksik → o araçlar ham konumda düz geçişle gösterilir.
- WebView içine JSON enjeksiyonu her 2 sn'de 50 aracı taşır (~6 KB); sorun değil ama tüm durak listesi asla tekrar gönderilmemeli.
- Ring hatlarda (başlangıç=bitiş) izdüşüm yanlış tarafa oturabilir → "yol 3× düz mesafeden uzunsa düz geç" kuralı bunu örter.

## G2. Araç takip modu ve araç kartı (`S`)

- Otobüse dokununca alt panelde **araç kartı**: hat, plaka, hız, istikamet (G/D), son GPS zamanı ("5 sn önce"), klima/engelli uygunluğu (varsa), bir sonraki durak ve ona kalan tahmini süre.
- "Takip et" düğmesi: kamera aracı izler (kullanıcı haritayı elle kaydırınca takip biter). Araç ışınlanırsa kamera da yumuşak geçişle oraya gider.
- Araç seferden düşünce kart kapanır, kısa bildirim: "Araç seferini tamamladı".

## G3. Durak listesinde "otobüs şu an burada" (`S`)

- Hat panelindeki durak listesinde, çizgiye oturtulmuş her araç için en yakın iki durak arasına ince bir "🚌 23 EB 968 · burada" şeridi eklenir; araç ilerledikçe şerit satırlar arasında kayar.
- Seçili durağa en yakın araç vurgulanır; listede "kaç durak kaldı" sayısı `approaching` ile tutarlı olmalı (uyuşmuyorsa canlı konum baz alınır, `approaching` süre için kullanılır).

## G4. "Binebileceğin en iyi durak" (`M`)

- Hat seçili ve konum izni varken: seçili yöndeki araçların **önündeki** duraklardan, kullanıcının 5 km/s ile yürüyerek otobüsten önce varabileceği duraklar bulunur; otobüsün en erken ulaştığı durak önerilir ("Şu durağa 4 dk yürü, otobüs 6 dk sonra orada").
- Hiçbirine rahat yetişilemiyorsa en az açık veren durak "acele et" uyarısıyla gösterilir.
- Öneri, araç hareket ettikçe yeniden hesaplanır (her veri değişiminde), ama arayüzde en fazla 10 sn'de bir değişir (titreme önlenir).

## G5. Durak varış geri sayımı (`M`)

- `approaching` dakika değeri statik gösteriliyor; ekranda saniye bazlı geri sayım yapılır ve her `approaching` yenilenmesinde (20 sn) düzeltilir.
- Canlı araç konumu ile `approaching` çelişirse (araç durağı geçmişse) satır "Geçti" olarak düşer.
- 1 dk altı: "Geliyor" + yeşil nabız; 0: "Durakta".

## G6. Hat özet ızgarası — "şehirde şu an ne var" (`S`)

- Şehir geneli modda üst şeritte hat çipleri: her hat için aktif araç sayısı (overview/vehicles'ten `routeCode` sayımı). Çipe dokununca yalnızca o hattın araçları ve çizgisi vurgulanır (diğerleri soluk), ikinci dokunuş hat moduna geçer.
- Hiç aracı olmayan hatlar listede en sonda, gri.

## G7. Yakınımdan geçenler (`S`)

- `smartstop/near` (v1'de kullanılmamıştı) ile 500 m içindeki duraklar; her biri için `approaching` ilk 2 hat; tek listede "3 dk · Hat 5 · Hastane durağı (200 m)".
- Ana sayfadaki "Benim durağım" kartının altına "Yakınımdan geçenler" satırı.

## G8. Canlı otobüs bildirimi — "otobüsüm geliyor" (`M`)

- Durak panelinde bir hatta "Haber ver" → uygulama **açıkken** (ön planda ya da son 10 dk içinde arka plana alınmışken) araç 2 durak kala yerel bildirim. Arka plan servisi kurulmaz (pil/izin maliyeti); sınırlama ayarlar ekranında açıkça yazılır.
- Aynı araç için bir kez bildirilir; kullanıcı durağı değiştirince plan iptal olur.

## G9. Otobüs widget'ı canlı veriyle (`S`)

- Mevcut `BusWidgetProvider` favori durağın `approaching` sonucunu gösteriyor; senkron aralığı 15 dk → widget'a dokununca uygulama o durağı açık ulaşım ekranına gitsin; widget üzerinde "X dk önce" etiketi zorunlu.

---

# v2.1 — "OBS: Mezuniyet" (hedef: 1–2 hafta)

## O1. Mezuniyet Durum Analizi (`M`) — **doğrulandı (HAR: `obs.mezuniyet.ilerleme.har`, 2026-09-13)**

**Kaynak akışı (HAR'dan)**

| Adım | İstek | Sonuç |
|---|---|---|
| 1 | `GET /oibs/std/caller.aspx?curPage=771` | 302 → `start.aspx?gkm=…` |
| 2 | `GET /oibs/start.aspx?gkm=…` | 302 → gerçek sayfa |
| 3 | `GET /oibs/std/StdGraduationAnalysis.aspx` | **200**, 74 KB, veri sayfada hazır (ASP.NET UpdatePanel var ama ilk GET'te dolu geliyor; ek postback gerekmiyor) |

Aynı HAR'daki diğer deneme: `curPage=126` → `ogrenci_mezuniyet_detay.aspx` → `std_grd_detail_info.aspx` → **`alert.aspx`**: *"Mezuniyet onay bilgileriniz henüz görüntülenememektedir. Mezuniyet onay bilgileri, mezuniyet değerlendirme sürecine alınan öğrenciler için yayınlanmaktadır."* → Bu sayfa (**Mezuniyet Onay**) yalnızca mezuniyet sürecindeki öğrencilere açık; uygulamada `alert.aspx`'e düşerse bilgi notu gösterilir, hata sayılmaz.

`PAGE` sabitlerine eklenecek: `mezuniyetAnaliz: 771`, `mezuniyetOnay: 126`. Menü başlığı (`menuUrls`) bulunursa o öncelikli.

**Sayfadan çıkarılacak alanlar** (etiket kimlikleri ve bölüm sınıfları HAR'daki HTML'de doğrulandı)

| Bölüm | Alan | Kaynak (DOM) | Örnek |
|---|---|---|---|
| Kimlik | Öğrenci no, fakülte, program | `lblOgrNo`, `lblFakAd`, `lblProgAd`, `lblProgTur` | YAZILIM MÜH / TEKNOLOJİ FAK. |
| Öğrenim | Kayıt tarihi, kayıt nedeni, durum, müfredat | `lblKayitTarih`, `lblKayitNeden`, `lblOgrenimDurum`, `lblMufredatAd` | 01.02.2023 · Aktif · YAZILIM MÜH.(2016) |
| Süre | Okuduğu dönem, normal/azami süre, % | `lblOkuduguDonemSayisi`, `lblNormalAzamiSure`, `lblSureProgressPct`, `spSureBarFill` | 8 · 4/7 · %100 |
| Mezuniyet | AGNO, tamamlanma, muhtemel mezuniyet | `lblAGNO`, `lblMezDurUyari`, `lblInfoMuhMez` | 1,36 · "hesaplanamıyor" · 01.02.2027 |
| Kriter kartları | AGNO, Zorunlu ders, Seçmeli ders, AKTS, Staj, Hazırlık | `corp-step` (durum sınıfı `--ok` / `--fail` / `--uyari`), `corp-step-val` ("36/45(!)"), `corp-step-bar-pct` ("%80") | AGNO 1,36/2,00 · Zorunlu 36/45 %80 · AKTS 87/240 %36 · Staj "Müfredatında Stajı Kapalı" · Hazırlık "Zorunlu Değil" |
| Ders durumları | Alınmayan / başarısız / başarısız dersleri sayıları | `corp-step-group-row` | 11 · 17 · 17 |
| Uyarılar | Grafik/mezuniyet uyarısı | `lblChartUyari`, `pnlChartUyari` | "Mezuniyet kuralları eksik olduğundan… hesaplanamamaktadır." |
| Tablo 1 | Müfredatta alınmayan dersler: kod, ad, AKTS, tip, grup açıklaması | `lblMufHdr*` başlıklı liste | YMH317 Algoritma Analizi 3 Zorunlu; "4GÜZ … Gruba ait 0 adet ders alınmalıdır" |
| Tablo 2 | Başarısız dersler: dönem, kod, ad, AKTS, tür (Z/S), not | `lblBasHdr*` başlıklı liste | 2025-2026 Güz · MAT215 Lineer Cebir · 4 · Z · FF |

**Ayrıştırma kuralları**
- Sayı alanlarındaki `(!)` eki "kriter sağlanmıyor" işaretidir; değerden ayıklanıp `warning` bayrağına dönüştürülür.
- Yüzdeler `corp-step-bar-pct` metninden; bulunamazsa `x/y` oranından hesaplanır.
- Seçmeli ders kartında sayı yerine uyarı metni gelebilir (örnekte öyle) → kart "hesaplanamıyor" durumunda çizilir, boş kutu gösterilmez.
- Grup satırları ("… Adet Ders Alınmalıdır") ders değil **grup** kaydıdır; listede ayrı stil (kod yerine grup adı, alınması gereken adet).
- HTML varlıkları (`&#214;` vb.) çözülmeli; sayfa UTF-8.
- Kural: dönem değiştiren postback yok; sayfa `loadSemesterPage()` değil düz `openPage()` ile açılır.

**Ekran (OBS → yeni sekme "Mezuniyet")**
1. Üstte **tamamlanma halkası**: AKTS %36 (örnek), altında "Muhtemel mezuniyet: 01.02.2027" ve süre çubuğu (8/7 dönem → azami süre aşıldıysa kırmızı uyarı).
2. **Kriter kartları** 2×3 ızgara: her kart değer + hedef + yüzde çubuğu + durum rengi (ok/uyarı/başarısız). Staj/Hazırlık kartları metin durumu.
3. **Eksik dersler** bölümü: iki sekme — "Alınmayan (11)" ve "Başarısız (17)"; başarısızlar döneme göre gruplanır, harf notu rozetli; Z/S etiketi.
4. Sayfa uyarısı varsa (`lblChartUyari`) kırmızı-olmayan bilgi notu (`Notice tone="info"`).
5. "Mezuniyet Onay" bilgisi: sayfa `alert.aspx`'e düşerse "Mezuniyet onay süreci henüz başlamadı" satırı; açılırsa (süreçteki öğrenciler) ayrı liste (ayrıştırma bu HAR'da doğrulanamadı → yalnızca ham etiket/değer çiftleri gösterilir).

**Kabul kriterleri**
- HAR'daki hesapla açıldığında AKTS 87/240, Zorunlu 36/45, AGNO 1,36, 11 alınmayan, 17 başarısız ders ve mezuniyet tarihi ekranda doğru görünür.
- Mezuniyet Onay için `alert.aspx` gelince hata ekranı değil bilgi satırı çıkar.
- Sekme 6 saat önbelleklenir (`cacheService`), "son güncelleme" etiketi taşır.

**Riskler:** `curPage=771` kullanıcı/menü bazlı değişebilir → önce `menuUrls` içindeki "Mezuniyet" başlığı aranır. Sayfa Proliz tarafında yeniden tasarlanırsa `corp-step` sınıfları değişir → I4 parser testine bu HTML örneği eklenir.

## O2. Mezuniyet hedef hesaplayıcı (`M`) — O1'e bağlı

- O1 verisi + not listesiyle cihazda hesap: "AGNO'yu 2,00'a çıkarmak için kalan X AKTS'den ortalama şu harf gerekiyor", "Başarısız 17 dersi bu tempoda alırsan tahmini mezuniyet dönemi".
- Sadece matematik; hiçbir değer uydurulmaz, girdi eksikse bölüm gizlenir. Sonuçlar "tahmin" etiketiyle gösterilir.

## O3. Mezuniyet değişim bildirimi (`S`) — F7/F8 altyapısı

- 6 saatlik senkronda O1 anlık görüntüsü karşılaştırılır: alınmayan/başarısız ders sayısı düşünce veya AGNO kriteri "ok"a dönünce bildirim ("Mezuniyet: Zorunlu ders kriteri sağlandı ✅").

---

# v2.2 — v1'den devreden işler

| # | İş | Efor | Durum / not |
|---|---|---|---|
| F12 | Etkinlik takibi ve fiyat/stok uyarıları | M | bekliyor |
| F14-A | `howtogo/plan` uç düzelirse gerçek planlayıcıya geçiş | S | 2026-09-13'te hâlâ 502; her sürümde yeniden denenir |
| F14+ | Rota planlayıcı sonucunda ilk bekleme süresi canlı (`approaching`) + rota üzerindeki canlı araçlar (G1 katmanı) | S | G1 sonrası |
| F17 | Gakgoş asistan → gerçek LLM (proxy) | L | bekliyor |
| I2 | `withRetry` merkezî yeniden deneme | S | bekliyor |
| I3 | Sentry (anonim) | S | bekliyor |
| I4 | Parser testleri (OBS + Bubilet + **O1 mezuniyet HTML'i**) | M | HAR'daki HTML örnek olarak kullanılır |
| I6 | Erişilebilirlik | M | bekliyor |
| I7 | iOS | L | bekliyor |

---

# Uygulama sırası (önerilen)

1. **G1** (çizgiye oturtma + animasyon) — tek başına en görünür kazanım; G2–G6 buna dayanır.
2. **DESIGN_PLAN §3 Ulaşım ekranı** yeniden düzenlemesi G1 ile aynı sürümde çıkar (yeni araç ikonu, tek alt panel).
3. **O1** paralel yürüyebilir (farklı dosyalar: `obsService`, `obs.tsx`).
4. G2, G3, G5 (küçük, G1 üstüne).
5. G4, G6, G7, G8, G9.
6. O2, O3, sonra v2.2.

# Değişmez kurallar (v1'den)

- Sahte veri yok; veri yoksa `EmptyState`.
- Yeni uç eklemeden önce canlı test (bu belgedeki ölçümler 2026-09-13 tarihlidir; uygulamadan önce tekrar edilir).
- Kişisel veri cihazda kalır; log'a yazılmaz. Konum yalnızca cihazda kullanılır, sunucuya gönderilmez.
- `obs.mezuniyet.ilerleme.har` kişisel veri içerir (öğrenci no, notlar) → **git'e eklenmez**; `.gitignore`'a `*.har` eklenir.
