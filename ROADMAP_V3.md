# Elazığ Şehir — Yol Haritası v3

Bu belge v2'nin (bkz. `ROADMAP_V2.md`) devamıdır. v1.2.0 ile canlı ulaşım motoru ve mezuniyet analizi, 13 Eylül 2026 commit'leriyle de **Günün Özeti (Now Brief) widget'ı + Android 16 Live Updates / Samsung Now Bar canlı bildirimleri** çıktı. v3'ün odağı: bu iki altyapıyı "uygulama açıkken çalışır"dan **"arka planda kendi kendine yaşar"** hâline getirmek, ders programı yayınlandığında zinciri otomatik tamamlamak ve widget'ları olgunlaştırmak.

**Efor ölçeği:** `S` ≈ yarım–1 gün · `M` ≈ 2–4 gün · `L` ≈ 1 hafta+

---

## 0. Cihazda doğrulanan durum (Galaxy S24 FE, Android 16 / One UI 8.5, 2026-09-13)

| Konu | Sonuç |
|---|---|
| Live Updates (`ProgressStyle` + `FLAG_PROMOTED_ONGOING` + `EXTRA_REQUEST_PROMOTED_ONGOING`) | Sistem `PROMOTED_ONGOING` bayrağını **veriyor**; durum çubuğu çipi ("İmsak"), bildirim panelinde "Canlı bildirimler" bölümü, kronometre ve ilerleme çubuğu çalışıyor |
| Samsung Now Bar | Kapsül kilit ekranında çıkıyor; ama partner listesinde olmayan uygulamalar `nowBarViewStyle=-1` jenerik kartla çiziliyor → **yalnızca ikon + uygulama adı** (içerik ayrıştırılıyor, gösterilmiyor). Stabil One UI 8.5'te "tüm uygulamalar" geliştirici anahtarı yok |
| Otobüs canlı takibi | Uygulama ön plandayken 8 sn'de bir güncelleniyor; arka planda yalnızca sistem kronometresi akıyor, **ETA yenilenmiyor** |
| Namaz geri sayımı | `AlarmManager` (10 dk) ile uygulama kapalıyken de yeniliyor ✓ |
| Widget'lar | Yalnızca uygulama açılışında / `AppState=active`'te senkronlanıyor; `updatePeriodMillis` tetiklense de yeni veri çekilmiyor → **saatlerce bayat kalabiliyor** |
| Sabah/akşam özeti | İçerik planlama anında üretiliyor; bildirim anında **≤12 sa eski** olabiliyor |
| OBS | 2026-2027 Güz programı henüz yok → "henüz yayınlanmadı"; yayınlandığında kullanıcı fark edemiyor |
| Derleme | compileSdk 36'da `setRequestPromotedOngoing` yok (36.1'de var) → reflection + extra ile çözüldü; yerel derleme için JAVA_HOME = Temurin 17 |

---

# v1.3 — "Arka planda yaşayan özet" (hedef: 2–3 hafta)

## B1. Arka plan senkron işçisi — widget + özet + OBS (`M`) — **öncelik 1**

**Amaç:** Uygulama açılmasa da widget'lar, özet bildirimi ve OBS değişim algılama çalışsın. Bugün hepsi `_layout.tsx`'teki `AppState` tetikleyicisine bağlı.

**Yaklaşım:** Native `WorkManager` periyodik iş (15 dk, `NetworkType.CONNECTED`) → Headless JS görevi (`AppRegistry.registerHeadlessTask('BackgroundSync')`) → `WidgetService.syncWidgets()` + `NotificationService.syncAllSchedules()` (mevcut 6 saatlik eşik korunur). Expo'da `expo-background-task` alternatifi de değerlendirilir (15 dk minimum, aynı sınır).

**Adımlar**
1. `native-widgets/.../BackgroundSyncWorker.kt` + `HeadlessJsTaskService`; plugin manifest'e servis + WorkManager başlatıcı (`MainApplication.onCreate` → `enqueueUniquePeriodicWork`).
2. Widget `onUpdate` (`updatePeriodMillis`) ve `onEnabled` → aynı işçiyi `OneTimeWorkRequest` ile tetikler (ilk widget eklendiğinde boş kalmasın).
3. Pil: Doze'da 15 dk pencereler kabul; kullanıcıya "Kısıtlamasız pil" önerisi zaten var (`notifications.tsx`).
4. Ölçüm: `updated_at` damgası widget'ta zaten gösteriliyor → "X dk önce" ≤ 20 dk kalmalı.

**Kabul kriterleri**
- Uygulama 6 saat açılmadığında Günün Özeti widget'ındaki damga 20 dk'yı geçmez (Wi-Fi'de).
- OBS'de yeni not girildiğinde uygulama açılmadan ≤ 6 sa içinde bildirim gelir.

**Risk:** Headless JS'te Firebase/`expo-secure-store` başlatma sorunları → görev yalnızca AsyncStorage + fetch kullanan yolları çağırır; OBS kimlik bilgisi SecureStore'dan okunamıyorsa OBS adımı atlanır.

## B2. Otobüs canlı takibinde arka plan ETA yenileme (`M`)

**Amaç:** "Haber ver"e basıp cebine koyan kullanıcı Now Bar/kilit ekranında **gerçek** kalan süreyi görsün.

**Yaklaşım:** Takip aktifken kısa ömürlü ön plan servisi (`foregroundServiceType="shortService"`, ≤ 3 dk; bitince `dataSync` yerine yeniden başlatma) veya `AlarmManager.setExactAndAllowWhileIdle` (30 sn) ile Kotlin tarafında doğrudan `GET /api/smartstop/approaching/{stopId}` (Referer başlığıyla; `apiService.ts`'teki eşleme Kotlin'e taşınır). Araç listeden düşünce "vardı" bildirimi ve servis durur. En fazla 45 dk sonra kendini kapatır.

**Kabul kriterleri**
- Uygulama arka planda/kapalıyken kilit ekranındaki kalan durak sayısı 60 sn içinde güncellenir.
- Takip iptal edildiğinde servis ve bildirim 5 sn içinde kapanır.

**Risk:** Play politikası ön plan servisi türü gerekçesi ister → `shortService` + kullanıcı eylemiyle başlatma (buton) bu gerekçeyi sağlar.

## B3. Özet bildirimini gönderim anında tazele (`S`) — B1'e bağlı

Sabah/akşam bildirimi planlanmış `DATE` tetikleyicisi yerine B1 işçisinin **saat penceresinde** (ör. 07:15–07:45) çalışıp o an `BriefService.buildBrief()` ile taze içerik basması. Planlı bildirim yedek olarak kalır (işçi çalışmadıysa). Kabul: bildirim gövdesindeki bakiye/hava, gönderimden ≤ 30 dk önceki veriyle eşleşir.

## B4. "Ders programın yayınlandı" bildirimi (`S`) — **şu an en görünür kazanım**

`notPublished: true → false` geçişi (B1 kontrolünde veya uygulama açılışında) → anlık bildirim "📚 2026-2027 Güz ders programın yayınlandı — 5 ders, ilk ders Pazartesi 09:15". Aynı geçişte: ders bildirimleri planlanır, `obs_timetable_home_v3` / `brief_obs_timetable_v3` önbellekleri düşürülür, özet widget'ı yenilenir. Kabul: program OBS'ye girildikten ≤ 6 sa sonra bildirim; ana sayfa/özet aynı anda güncel.

## B5. Sınav günü canlı bildirimi (`S`)

Sınav takviminden gelen bugünkü ilk sınav için sabah 07:00'de Live Update: "📝 BİÇİMSEL DİLLER · 13:15 · A304", kronometre sınav saatine geri sayar, ilerleme çubuğu gün içindeki konumu gösterir; sınav başlayınca kapanır. Mevcut `LiveNotifications.Spec` yeterli; `PrayerLiveReceiver` benzeri tek alarm.

## B6. Ders zili canlı bildirimi (`S`) — ✅ 2026-09-18 uygulandı (`LessonLiveReceiver`, `lessons_json`; program yayınlanınca gerçek veriyle test edilir)

Ders sırasında "Şu an: X · 10:45'e kadar · sıradaki Y (B302)" ongoing kronometre; günün son dersinden sonra kapanır. Ayarlardan açılır (varsayılan kapalı). Kabul: gün içinde bildirim ders geçişlerinde ≤ 1 dk gecikmeyle değişir (AlarmManager, ders başlangıç/bitiş saatlerine kurulur).

---

# v1.4 — "Widget olgunlaşması" (hedef: 1–2 hafta)

## W1. Widget koyu tema (`S`)

Bugün tüm renkler `#F8F9FF`/`#0D1C2E` sabit. `values-night/colors.xml` + drawable'larda `?android:attr/colorBackground` yerine tema renkleri; Material You (`@android:color/system_accent1_*`) API 31+'da vurgu rengi. Kabul: sistem koyu temada widget arka planı koyu, yazı açık; ekran görüntüleri `docs/screenshots`'a eklenir.

## W2. Otobüs widget'ı için durak seçimi (`M`)

Widget eklenirken açılan yapılandırma etkinliği (`android:configure`) → uygulama içinde `elazigsehir://widget-config?appWidgetId=` derin bağlantısı → durak arama ekranı → seçim `widget_prefs`'e `bus_stop_id_<appWidgetId>` olarak yazılır. Böylece aynı anda birden fazla durak widget'ı olur (ev/okul). `BusWidgetProvider` widget id'ye göre okur, yoksa favori durağa düşer.

## W3. "Sıradaki ders" widget'ı 2×2 (`S`) — program yayınlanınca

`NextLessonWidgetProvider`: ders adı, saat, derslik, kalan süre; ders yoksa "Bugün ders yok" / "Program henüz yayınlanmadı". Veri `brief_*` gibi `lesson_next_*` anahtarlarından; B1 ile tazelenir.

## W4. Günün Özeti widget'ında satır tıklanabilirliği (`S`)

Her satır kendi rotasına gitsin (`RemoteViews.setOnClickPendingIntent` satır bazında; `BriefService.toWidgetData` `brief_route_1..4` yazar). Bugün tüm widget `/brief` açıyor.

## W5. Widget önizleme ekranını sadeleştir (`S`)

`app/widgets.tsx` içindeki `sync()` `WidgetService.syncWidgets()` ile aynı işi kopyalıyor → tek kaynağa indir; ekran yalnızca sonucu ve "X dk önce" damgasını gösterir. Kabul: iki yolda üretilen `WidgetData` birebir aynı.

---

# v1.5 — "Özet zekâsı" (hedef: 2 hafta)

## Z1. Okula gidiş önerisi (`M`)

Özet satırı: "İlk ders 09:15 · ÇAYDAÇIRA TOKİ 1'den **08:31 Hat 7** ile 08:58'de kampüste". Kaynaklar: ders programı (ilk ders + derslik → fakülte yerleşkesi), favori durak, `getRouteSchedule` (planlı kalkışlar) ve `tripPlannerService` (süre). Yalnızca üç veri de varsa üretilir; yoksa satır yok. Kabul: önerilen kalkış, planlı tarifede gerçekten var; varış ≥ 10 dk pay bırakır.

## Z2. Takip edilen etkinlik & nöbetçi eczane satırları (`S`)

- `PrefsService.getTrackedEvents()` → bugün/yarın sahnesi olan etkinlik özet satırı ("🎟️ Bu akşam 20:30 · X · Y Sahnesi").
- 21:00 sonrası ve 08:00 öncesi: konuma en yakın nöbetçi eczane satırı (varsa konum; yoksa merkez listesinden ilk).

## Z3. Özet önceliklerinin kullanıcıya açılması (`S`)

`/brief` ekranında "Özette ne görmek istersin" (sınav/ders/otobüs/bakiye/namaz/hava/kesinti/yemek/haber anahtarları) → `PrefsService` `briefHidden[]`; bildirim ve widget aynı filtreyi kullanır.

## Z4. Akşam özetinde "yarın için hazırlık" kontrol listesi (`S`)

Yarın ders/sınav varsa: bakiye < 2 biniş ücreti ise "kart doldur", yağış varsa "şemsiye", kesinti varsa "şarj" gibi türetilmiş ipuçları — her biri yalnızca gerçek veriye dayanır (ücret `getRoutePrices`'tan).

---

# v1.6 — Platform ve ekosistem

## P1. Samsung Now Bar partnerliği araştırması (`S`, dış bağımlılık)

Samsung Developers "Live Notification / Now Bar" programına başvuru koşullarını çıkar; kabul edilmezse mevcut jenerik kart davranışı belgelenir (README'de yapıldı). Alternatif: kapsül metni yerine **uygulama adını** dinamikleştirmek mümkün değil (paket etiketi) → beklenti yönetimi.

## P2. iOS Live Activities (`L`) — I7'nin parçası

`ActivityKit` + Widget Extension: otobüs takibi ve namaz geri sayımı Dynamic Island/kilit ekranı; Günün Özeti WidgetKit widget'ı. Expo'da `expo-apple-targets` veya özel config plugin. Android'deki `LiveNotificationService` API'si korunur (platform dalı içeride).

## P3. Cihaz duman testi betiği (`S`)

Bu turda elle yapılan adb/uiautomator akışı (`scripts/device-smoke.ps1`): kurulum → soğuk başlatma (deep link'ler: `brief`, `transit?stopId`, `widgets`) → logcat'te `Maximum update depth|FATAL` taraması → `dumpsys notification`'da `PROMOTED_ONGOING` kontrolü → widget provider listesi. Her build öncesi çalıştırılır.

## P4. Sürüm/dağıtım (`S`)

`app.config.js` 1.3.0, CHANGELOG.md başlatılır (v1.2.0 ve 13 Eylül değişiklikleri geriye dönük yazılır), EAS production build; Play'e Live Updates/ön plan servisi gerekçeleri (B2 yapılırsa) eklenir.

---

# v2'den devreden işler

| # | İş | Efor | Durum / not |
|---|---|---|---|
| F14-A | `howtogo/plan` ucu düzelirse gerçek planlayıcı | S | her sürümde yeniden denenir |
| F17 | Gakgoş asistan → gerçek LLM (proxy) | L | bekliyor |
| I2 | `withRetry` merkezî yeniden deneme | S | bekliyor |
| I3 | Sentry (anonim) | S | bekliyor; B1 arka plan hataları için önem kazandı |
| I4 | Parser testleri (OBS + Bubilet + mezuniyet) | M | `semesterTryOrder` ve `parseTimetable` için boş-dönem örneği eklenir |
| I6 | Erişilebilirlik | M | `/brief` ve `BriefCard` dahil |
| I7 | iOS | L | P2 ile birlikte |

---

# Uygulama sırası (önerilen)

1. **B4** (program yayınlandı bildirimi) — küçük, tam şu anki ihtiyaç; B1'siz de uygulama açılışında çalışır.
2. **B1** (arka plan işçisi) — widget/özet/OBS'nin tümünü "canlı" yapar; B3 ve W3 buna dayanır.
3. **W1** koyu tema + **W4** satır tıklama — hızlı görünür kazanımlar.
4. **B2** otobüs arka plan ETA — Now Bar kullanımının asıl vaadi.
5. B5, W2, W3 (program yayınlandıktan sonra gerçek veriyle test edilir); B6 uygulandı, aynı testi bekliyor.
6. Z1–Z4, sonra P1–P4 ve devreden işler.

# Değişmez kurallar

- Sahte veri yok; kaynağı olmayan özet satırı/widget alanı üretilmez, `EmptyState`/"henüz yayınlanmadı" gösterilir.
- Yeni uç veya sistem API'si eklemeden önce gerçek cihazda doğrulama (bu belgedeki ölçümler 2026-09-13 tarihli).
- Kişisel veri cihazda kalır; OBS kimlik bilgisi arka plan işçisine yalnızca SecureStore üzerinden ulaşır, log'a yazılmaz.
- Arka plan işleri pil bütçesine saygılı: ≥ 15 dk periyot, yalnızca ağ varken; kullanıcı tarafından açılan kısa ömürlü takipler dışında ön plan servisi yok.
- Native değişiklik = yeni EAS build; JS-only güncellemeyle dağıtılmaz.
