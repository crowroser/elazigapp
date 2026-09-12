# Elazığ Şehir — Yol Haritası

Bu belge, uygulamaya eklenecek özelliklerin **nasıl** yapılacağını adım adım anlatır. Her madde; doğrulanmış veri kaynağı, dokunulacak dosyalar, kod iskeleti, kabul kriterleri ve riskleriyle birlikte yazılmıştır.

**Efor ölçeği:** `S` ≈ yarım–1 gün · `M` ≈ 2–4 gün · `L` ≈ 1 hafta+

---

## 0. Mevcut mimari (kısa özet)

```
app/(tabs)/index      → ana sayfa (kart, hava, namaz, hızlı erişim)
app/(tabs)/transit    → harita (WebView + Leaflet), durak/hat paneli, canlı mod
app/(tabs)/university → yemekhane, duyurular, OBS girişi
app/(tabs)/news       → Keşfet: etkinlikler + haberler
app/(tabs)/services   → eczane, kesinti, numaralar, namaz
app/obs               → OBS ekranı (7 sekme)

services/apiService      → ElazığKart, eczane, kesinti, haber, duyuru, yemekhane, namaz, hava
services/obsService      → Fırat OBS (CAS girişi + sayfa ayrıştırma)
services/eventsService   → Bubilet etkinlikleri
services/authService     → Firebase Auth + Firestore profil
services/prefsService    → cihaz-yerel tercihler (AsyncStorage)
components/ui.tsx        → tasarım sistemi (Card, Chip, Pill, StatTile, ListRow, …)
constants/Theme.ts       → renk / boşluk / tipografi tokenları
```

**Temel kurallar**

1. Hiçbir ekranda örnek/sahte veri yok; veri yoksa `EmptyState` gösterilir.
2. Yeni bir uç eklemeden önce canlı test edilir (belediye ve OBS servisleri sık değişiyor).
3. Kişisel veri (OBS şifresi, kart no) cihazda kalır; Firestore'a yalnızca kullanıcının kendi belgesi yazılır.

**Doğrulanmış uçlar (bu belgedeki tüm özellikler bunlara dayanır)**

| Uç | Yanıt | Not |
|---|---|---|
| `GET /api/wheremybus/routes` | `result.routes[]` | 49 hat |
| `GET /api/wheremybus/variants/{routeId}` | `result.route[0].routeVariants[]` | `geom` = GeoJSON LineString |
| `GET /api/wheremybus/stations/{variantId}` | `result.routeVariantStops[0].station[]` | `rowNo` sıralı |
| `GET /api/wheremybus/vehicles/{variantId}` | `result.routeVehicles[]` | canlı araçlar |
| `GET /api/wheremybus/schedule/{variantId}/{1-7}` | `result.schedule[]` | `hour`,`minute` |
| `GET /api/wheremybus/price/{routeCode}` | `result[]` | CP1254 mojibake |
| `GET /api/wheremybus/overview[/vehicles]` | tüm hatlar / tüm araçlar | şehir geneli |
| `GET /api/smartstop/stations` | `result.station[]` | ~1286 durak |
| `GET /api/smartstop/near?lat=&lng=` | `result.station[]` | **kullanılmıyor** |
| `GET /api/smartstop/approaching/{stopId}` | `result.route[]` | kalan dk, durak, plaka |
| `GET /api/smartstop/routes/{stopId}` | `result.route[]` | duraktan geçen hatlar |
| `GET /api/fillingcenter/list` | `result[]` | 42 bayi/kiosk |
| `POST /api/balance/inquiry` | `{ok,guncelBakiye,…}` | antiforgery + multipart |
| `GET /api/howtogo/stations` | `result[]` | çalışıyor |
| `GET /api/howtogo/plan?…` | — | **şu an 502** (upstream kapalı) |

> Tüm `elazigkart.elazig.bel.tr` isteklerinde `Referer` zorunlu; `platform.api.bubilet.com.tr` tarayıcı User-Agent'ını 403 ile reddeder (özel UA gerekir).

---

# v1.1 — "Günlük kullanım" (hedef: 1–2 hafta)

> **Durum (2026-09-12):** F1–F6 uygulandı (`cacheService`, `LeafletMap`, `fillingcenters` eklendi; favoriler `prefsService` + Firestore'da). Kod incelemesinde bulunan 9 hata (çevrimdışı ilk açılışta sonsuz yükleme, sefer isteği yarışı, harita hazır olmadan gönderilen işaretçiler, popup HTML kaçışı vb.) düzeltildi.
>
> **Doğrulama turu (2026-09-12, F7–F17):** Diğer ajanların uyguladığı özellikler canlı verilerle test edildi, bulunan eksikler giderildi:
> - **F9** `parseTuition` / `parseAcademicCalendar` / `parseCurriculum` gerçek OBS sayfa yapısına göre yeniden yazıldı (sütun kayması, boş müfredat, aynı başlangıç/bitiş tarihi hataları). `caller.aspx` kimlikleri düzeltildi. Gerçek hesapla doğrulandı.
> - **F11** `plugins/withElazigWidgets.js` yalnızca widget dosyalarını kopyalayacak şekilde yeniden yazıldı (eski sürüm Expo'nun ürettiği strings/colors/MainActivity'yi eziyordu). `native-widgets/` altındaki kopya Android projesi git'ten çıkarıldı; yalnızca 14 widget dosyası izleniyor. `expo prebuild --clean` ile doğrulandı (3 receiver + `WidgetDataPackage` kaydı).
> - **F14** Rota planlayıcı sıfırdan yazıldı: eski sürüm `station.lines` (hep boş) üzerinden arıyordu → hiç sonuç vermiyordu. Yeni sürüm ElazığKart hat ağını (`variants` + `stations/{variantId}`, hat başına 7 gün önbellek, `ApiService.getTransitNetwork`) indirip gerçek durak dizilimi üzerinde aktarmasız/1 aktarmalı arama yapar; ring hatlar başa sarar, yalnızca gidiş yönü yayınlanan hatlarda (56–59, 103) dönüş yönü türetilip **"dönüş yönü durakları tahmini"** notuyla gösterilir. `POPULAR_DESTINATIONS` koordinatları durak verisinden alındı (eskileri yanlıştı). Ekran `LeafletMap` ref API'sine geçirildi (polyline artık yeniden yükleme sonrası kaybolmuyor).
> - **F15** `delayStatsService` tamamen uydurma (hash tabanlı) gecikme/yoğunluk üretiyordu → kaldırıldı. Yeni sürüm yalnızca gerçek veri gösterir: canlı araç sayısı/ortalama hız ve bugünkü tarifeden saatlik planlı sefer sayısı + ortalama kalkış aralığı.
> - **F16** Şikayetler Firestore kurallarında yoktu (her şikayet reddediliyor, yerelde "şikayet edildi" işaretleniyordu) → `reports/{ilanId_uid}` kuralı + `classifieds.reportCount` yalnızca +1 güncelleme kuralı eklendi ve dağıtıldı; hata artık arayüzde görünür. İlan görseli `file://` olarak yazılıyordu (başka cihazda boş) → `expo-image-manipulator` ile 720px JPEG data URI olarak gömülüyor. Girişsiz/başarısız ilan artık "yayınlandı" diye gösterilmiyor.
> - **F13** Özelleştirme modalı prop değişimini izlemiyordu (kaydet → varsayılanla eziyordu) → düzeltildi.
> - **F17** Sahte "yazıyor" akış gecikmesi kaldırıldı; OBS yönlendirici Türkçe ekli sözcükleri ("derslerim", "notlarım") tanıyor.
> - **F7/F12** Namaz bildirimleri: "Güneş" ezan değil → çıkarıldı; bugün + yarın planlanıyor; Aladhan `method=13` (Diyanet). OBS çağrıları tek kuyrukta serileştirildi (ana sayfa + bildirim senkronu + OBS ekranı aynı anda postback yapamaz); ana sayfa ders programı 6 saat önbellekte.
> - Favoriler: yerelde silinen favori sunucudan geri iniyordu → `favoritesTouched` bayrağı.
> - **I5 Koyu tema** eklendi: `constants/Theme.ts` canlı renk nesnesi (`Theme.colors` yerinde güncellenir) + `themedStyles(() => StyleSheet.create(...))` (tema değişince stil tablosu yeniden kurulur) + `useAppTheme()` (ekranlar yeniden render). Tercih (Sistem/Açık/Koyu) "Ana Sayfayı Düzenle" modalında, `@prefs/theme_preference` ile kalıcı; sistem teması `Appearance` ile izlenir; navigasyon teması ve harita (CARTO dark tiles) de uyar.
> - **Yapılmayanlar:** I2 (`withRetry`), I3 (Sentry), I4 (jest parser testleri), gerçek LLM (F17 not) — bekliyor.

## F1. Yakınımdaki duraklar (`S`)

**Amaç:** Uygulama açılışında en yakın durağı bulmak için 1286 durağı indirip mesafe hesaplamak yerine sunucunun hazır sonucunu kullanmak; ayrıca "yakınımdakiler" listesi sunmak.

**Veri kaynağı**
```
GET /api/smartstop/near?lat=38.6746&lng=39.2163
→ { result: { station: [ { id, stopNo, stopTitle, latitude, longitude } ] } }
```

**Adımlar**

1. `services/apiService.ts` → yeni metot:
```ts
async getNearbyStations(lat: number, lng: number): Promise<BusStation[]> {
  const data = await fetchElazigKartJson(`/api/smartstop/near?lat=${lat}&lng=${lng}`);
  const list: any[] = Array.isArray(data?.station) ? data.station : [];
  return list.map(mapStation);   // mevcut getBusStations() içindeki eşleme fonksiyonuna çıkarılacak
}
```
2. `getBusStations()` içindeki `map` gövdesi `mapStation()` yardımcı fonksiyonuna taşınır (tek kaynak).
3. `app/(tabs)/transit.tsx`:
   - Konum izni alındığında `didLocateSelectRef` bloğu `getNearbyStations` kullanacak; tüm durak listesi yalnızca harita ve arama için indirilecek (paralel).
   - Alt panelde "Çevredeki Diğer Duraklar" şeridi bu sonuçtan beslenecek.
4. Konum yoksa mevcut davranış (şehir merkezi) korunur.

**Kabul kriterleri**
- Konum izni verilmiş cihazda uygulama açılışında en yakın durak ≤1 sn içinde seçili gelir.
- Konum reddedilirse hata yok, harita merkeze konumlanır.

**Risk:** Uç, il sınırı dışında boş dizi dönebilir → boş sonuçta mevcut haversine yöntemine düş.

---

## F2. Sefer saatleri: gün seçici (`S`)

**Amaç:** Hat panelinde yalnızca bugünün saatleri var; hafta içi/cumartesi/pazar ayrımı gösterilmeli.

**Veri kaynağı:** `GET /api/wheremybus/schedule/{variantId}/{weekday}` — `weekday`: 1=Pazartesi … 7=Pazar.

**Adımlar**

1. `apiService.getBusRoutes()` içinde `schedules` tek gün yerine seçilen güne göre çekilecek; imza:
```ts
async getRouteSchedule(routeCode: string, weekday: number, direction: 'G' | 'D' = 'G'): Promise<RouteScheduleItem[]>
```
   (varyant id'si `getRouteVariants` önbelleğinden alınır; ek istek yok.)
2. `transit.tsx` hat panelinde gün çipleri (`Pzt … Paz`, varsayılan bugün) + yön çipi (Gidiş/Dönüş).
3. Saatler `timePill` ızgarasında; şu anki saatten sonraki ilk sefer vurgulanır.

**Kabul kriterleri**
- Gün değiştirince liste 1 istekle güncellenir, yön değişince de.
- "Sonraki sefer" rozeti doğru saati işaret eder.

---

## F3. Favori durak & hat (`S`)

**Amaç:** Ana sayfada "Benim durağım" kartı: favori durağa yaklaşan otobüsler canlı.

**Adımlar**

1. `services/prefsService.ts`:
```ts
favoriteStop: { id: string; name: string } | null
favoriteRoutes: string[]           // routeCode listesi
```
   `getFavoriteStop/setFavoriteStop/toggleFavoriteRoute` eklenir.
2. `transit.tsx` alt panel başlığına yıldız düğmesi; hat panelinde de yıldız.
3. `app/(tabs)/index.tsx`: favori durak varsa `ApiService.getStationRemainingTime(fav.id)` ile ilk 3 hat kartı; 30 sn'de bir yenileme (ekran odaktayken).
4. Favori hat varsa "Hızlı Erişim" üstünde o hattın canlı araç sayısı rozeti.
5. Giriş yapan kullanıcı için `authService.updateUserProfile` ile Firestore'a da yazılır (cihazlar arası).

**Kabul kriterleri**
- Yıldıza basınca ana sayfada kart belirir, uygulama kapanıp açılınca kalır.
- Favori yoksa kart hiç görünmez (boş kutu yok).

---

## F4. Kart bayileri ekranı (`S`)

**Amaç:** 42 yükleme noktası şu an yalnızca bakiye modalında liste; haritalı ayrı ekran.

**Adımlar**

1. Yeni dosya `app/fillingcenters.tsx`; `transit.tsx`'teki `buildLeafletHtml` fonksiyonu `components/LeafletMap.tsx` bileşenine çıkarılır (işaretçi tipini parametre alacak şekilde).
2. Filtre çipleri: `Tümü / Bayi / Kiosk` (`tip === 'K'`).
3. Liste + harita birlikte; satıra dokununca harita o noktaya odaklanır, "Yol Tarifi" Google Maps'e gider.
4. `app/_layout.tsx`'e `Stack.Screen name="fillingcenters"`, bakiye modalındaki bölüm bu ekrana yönlendirir.

**Kabul kriterleri:** Konum varsa liste mesafeye göre sıralı; harita ve liste seçimi senkron.

---

## F5. Çevrimdışı önbellek (`S`)

**Amaç:** İnternet yokken son görülen veriyi "son güncelleme" etiketiyle göstermek.

**Adımlar**

1. `services/cacheService.ts`:
```ts
export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<{ data: T; stale: boolean; at: number }>
```
   - Başarılıysa `{data, at}` AsyncStorage'a yazılır.
   - Hata/timeout durumunda kayıt varsa `stale: true` ile döner.
2. Şu çağrılar sarmalanır: `getAllRoutes` (24 sa), `getBusStations` (24 sa), `getPharmacies` (1 sa), `getNews` (15 dk), `getDiningMenu` (3 sa), `EventsService.getEvents` (5 dk — hâlihazırda bellek içi önbellek var, kalıcıya taşınır).
3. Ekranlarda `stale` ise başlık altında `Notice tone="info"`: "Çevrimdışı — son güncelleme 12:40".

**Kabul kriterleri:** Uçak modunda uygulama boş ekran göstermez; her listede tarih etiketi vardır.

---

## F6. Sefer/durak arama iyileştirmesi (`S`)

**Amaç:** Arama şu an yalnızca durak adı/kod ve hat adı eşliyor; "Hastane", "kampüs" gibi aramalarda hattın **duraklarında** da arama yapılmalı.

**Adımlar**

1. Hat seçildiğinde `stops` zaten çekiliyor; `routeStopIndex: Map<routeCode, string[]>` olarak bellek içinde tutulur (ilk aramada doldurulur).
2. `matchingRoutes` hesabına durak adı eşleşmesi eklenir; sonuç satırında "… durağından geçiyor" ipucu gösterilir.
3. Arama geçmişi (`prefsService.recentStops/Routes`) boş sorguda önerilir.

---

# v1.2 — "Bildirimler ve OBS derinleşmesi" (hedef: 2–4 hafta)

## F7. Yerel bildirimler altyapısı (`M`) — **öncelik 1**

**Amaç:** Ders, sınav, namaz, bakiye ve yeni not bildirimleri. Sunucu gerekmez; hepsi cihazda zamanlanır.

**Kurulum**
```bash
npx expo install expo-notifications expo-device
```
`app.config.js` → `plugins` dizisine:
```js
["expo-notifications", { "icon": "./assets/images/notification-icon.png", "color": "#0F2A4A" }]
```
Android 13+ için `POST_NOTIFICATIONS` izni plugin tarafından eklenir. **EAS build gerekir** (JS-only güncelleme yetmez).

**Yeni dosya: `services/notificationService.ts`**
```ts
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export const NotificationService = {
  async ensurePermission(): Promise<boolean> { /* getPermissionsAsync → requestPermissionsAsync */ },

  /** Aynı kategoriyi yeniden planlamadan önce eskilerini temizler */
  async reschedule(category: 'lesson' | 'exam' | 'prayer' | 'balance', items: ScheduledItem[]) {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all.filter(n => n.content.data?.category === category)
         .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
    for (const it of items) {
      await Notifications.scheduleNotificationAsync({
        content: { title: it.title, body: it.body, data: { category, route: it.route } },
        trigger: it.trigger,          // DATE veya WEEKLY
      });
    }
  },
};
```

**Zamanlayıcılar**

| Kategori | Kaynak | Tetikleyici |
|---|---|---|
| `lesson` | `ObsService.getTimetable()` | `WEEKLY` (`weekday`, `hour`, `minute`), ders başlangıcından 15 dk önce |
| `exam` | `ObsService.getExamSchedule()` | `DATE`, sınavdan 1 gün + 1 saat önce (tarih açıklanmışsa) |
| `prayer` | `ApiService.getPrayerTimesAsync()` | `DATE`, vakitten N dk önce; her gün ilk açılışta yenilenir |
| `balance` | `ApiService.queryCardBalance()` | eşiğin altındaysa anında bildirim (günde en fazla 1) |

**Tetikleme noktası:** `app/_layout.tsx` içinde uygulama açıldığında ve `AppState` `active` olduğunda `syncAllSchedules()` (son çalıştırma zamanı `prefsService`'te, 6 saatten sıksa atlanır).

**Ayarlar:** `app/notifications.tsx` ekranındaki anahtarlar bu kategorileri açıp kapatır; kapatılınca ilgili kategori iptal edilir.

**Bildirime dokunma:** `Notifications.addNotificationResponseReceivedListener` → `data.route` ile `router.push` (ör. `/obs`).

**Kabul kriterleri**
- İzin verildikten sonra ders programı olan bir kullanıcıda haftalık 10+ bildirim planlanır (`getAllScheduledNotificationsAsync` ile doğrulanır).
- Ayar kapatılınca o kategorideki planlar silinir.
- Uygulama kapalıyken de bildirim düşer (yerel zamanlama).

**Risk:** Bazı Android üreticileri (Samsung/Xiaomi) pil optimizasyonuyla planlı bildirimleri geciktirir → ayarlar ekranında bilgilendirme metni + "pil optimizasyonunu kapat" yönlendirmesi.

---

## F8. Yeni not algılama (`M`) — F7'ye bağlı

**Amaç:** OBS'de yeni harf notu/sınav notu girildiğinde bildirim ve ekranda "YENİ" rozeti.

**Adımlar**

1. `prefsService`'e imza deposu:
```ts
type GradeSnapshot = Record<string /* semesterCode */, Record<string /* courseCode */, { letter: string; avg: number | null; exams: string /* 'Vize:45|Final:30' */ }>>;
```
2. `obsService`'e saf fonksiyon:
```ts
export function diffGrades(prev: GradeSnapshot, next: GradeSnapshot): GradeChange[]
// → [{ courseCode, courseName, kind: 'letter' | 'exam', from, to }]
```
3. Kontrol noktası: `app/obs.tsx` her açılışta ve (izin varsa) `_layout.tsx`'teki 6 saatlik senkronda `autoLogin → getGrades` ile karşılaştırma yapar.
4. Değişiklik varsa: bildirim ("MAT220 · Final notu açıklandı: 30") + `prefsService.setUnseenGrades([...])`; OBS ekranında ilgili kart üzerinde `Pill label="YENİ"`, karta dokununca işaret temizlenir.
5. Üniversite sekmesindeki OBS kartında ve tab bar'da okunmamış sayısı rozeti.

**Kabul kriterleri**
- İlk çalıştırmada bildirim üretilmez (yalnızca anlık görüntü kaydedilir).
- Aynı değişiklik ikinci kez bildirilmez.

**Risk:** OBS oturumu düşerse sessizce atlanmalı (kullanıcıya hata gösterme).

---

## F9. OBS: Harç Bilgileri, Akademik Takvim, Müfredat Durum (`M`)

**Amaç:** OBS'nin kalan yüksek değerli sayfaları.

**Kaynak (aynı desen):** `caller.aspx?curPage=N` → `start.aspx?gkm=…` → gerçek sayfa. Menü başlıkları `menuUrls` içinde zaten toplanıyor (`Harç Bilgileri`, `Akademik Takvim`, `Müfredat Durum`).

> **Kritik kural:** Dönem değiştiren postback, sayfanın GET'inden **hemen sonra** yapılmalı; araya başka sayfa girerse OBS `caller.aspx`'e yönlendirir. `loadSemesterPage()` bu kuralı zaten uyguluyor, yeni sayfalarda da o kullanılacak.

**Adımlar**

1. Sayfa numaralarını bir kez keşfet (menüdeki gkm linkinden `curPage` okunur), `PAGE` sabitine ekle.
2. Her sayfa için `parseX(html)` yaz; `toLines()` yardımcı fonksiyonu etiket/değer çiftleri için yeterli:
   - **Harç Bilgileri** → dönem, tahakkuk, ödenen, kalan borç; "borcunuz var" durumunda `Notice tone="warning"`.
   - **Akademik Takvim** → tablo satırları (etkinlik, başlangıç, bitiş); geçmiş satırlar soluk, sıradaki vurgulu.
   - **Müfredat Durum** → alınan/alınmayan dersler, tamamlanma yüzdesi → `StatTile` + ilerleme çubuğu.
3. `app/obs.tsx`'e üç yeni sekme (`TABS` dizisi) + `loadTab` içine case'ler.

**Kabul kriterleri:** Üç sekme de gerçek hesapta veri gösterir; dönem çipleri olan sayfalarda dönem değişimi çalışır.

---

## F10. OBS: Gelen mesajlar (`M`)

**Amaç:** Danışman/öğretim elemanı mesajlarını uygulamada okumak.

**Adımlar**

1. `Gelen Mesajlar` sayfası (`menuUrls`) → liste tablosu (gönderen, konu, tarih, okundu bilgisi) ayrıştırılır.
2. Satıra dokununca detay için `__doPostBack` (mesaj satırındaki `Select$N`) → `postbackPage()` ile içerik alınır (sınav istatistiğinde kullanılan desenin aynısı).
3. Okunmamış sayısı OBS ekranı başlığında ve üniversite sekmesindeki kartta rozet.
4. F7 varsa yeni mesajda bildirim.

**Risk:** Mesaj detayının popup (`prolizPopup`) ile açılma ihtimali → istatistik akışındaki `GET /oibs/start.aspx` fallback'i kullanılır.

---

## F11. Widget'ları derlemeye dahil etme (`M`)

**Durum:** `native-widgets/android/` altında üç widget (`PrayerWidgetProvider`, `BusWidgetProvider`, `ElkartWidgetProvider`), layout/xml kaynakları ve `WidgetDataModule.kt` hazır; ancak managed prebuild bunları üretilen `android/` klasörüne kopyalamıyor, bu yüzden `WidgetService.isNativeAvailable()` false dönüyor.

**Çözüm: yerel config plugin**

`plugins/withElazigWidgets.js`:
```js
const { withDangerousMod, withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs'); const path = require('path');

const copyDir = (src, dst) => { /* recursive copy */ };

module.exports = function withElazigWidgets(config) {
  // 1) Kotlin kaynakları + res dosyalarını kopyala
  config = withDangerousMod(config, ['android', (cfg) => {
    const root = cfg.modRequest.platformProjectRoot;            // android/
    const from = path.join(cfg.modRequest.projectRoot, 'native-widgets/android/app/src/main');
    copyDir(path.join(from, 'java'), path.join(root, 'app/src/main/java'));
    copyDir(path.join(from, 'res'),  path.join(root, 'app/src/main/res'));
    return cfg;
  }]);

  // 2) AndroidManifest'e üç <receiver> ekle
  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.receiver = [...(app.receiver || []), /* PrayerWidgetProvider, BusWidgetProvider, ElkartWidgetProvider */];
    return cfg;
  });

  return config;
};
```
`app.config.js` → `plugins: [..., "./plugins/withElazigWidgets"]`

**Ek iş**
- `MainApplication` paket listesine `WidgetDataPackage` eklenmeli → Expo modüler mimaride en temizi `WidgetDataModule`'ü **Expo Module** olarak sarmak ya da plugin içinde `withMainApplication` ile paket kaydı yapmak.
- `app/widgets.tsx` zaten native modül yoksa uyarı gösteriyor; plugin sonrası uyarı kaybolmalı.
- Widget verisi F7'deki 6 saatlik senkronla birlikte güncellenir.

**Kabul kriterleri:** Yeni EAS build'de Android ana ekranında üç widget görünür; "Canlı verileri senkronla" sonrası içerik dolar.

**Risk:** Prebuild sırası/dosya çakışması → `npx expo prebuild --clean` ile doğrula; `MainApplication` düzenlemesi RN sürüm güncellemelerinde kırılabilir, plugin idempotent yazılmalı.

---

# v1.3 — "Keşfet ve kişiselleştirme" (hedef: 1–2 ay)

## F12. Etkinlik takibi ve fiyat/stok uyarıları (`M`)

**Amaç:** Bir etkinliği takibe al; bilet azalınca, indirim düşünce veya etkinlik yaklaşınca bildir.

**Veri:** `EventsService.getSessions()` → `remainingTickets`, `discountedPrice`, `isSoldOut`; `getSuperTickets()` → `superPrice`, `expireAt`.

**Adımlar**

1. `prefsService`: `trackedEvents: { slug, title, lastPrice, lastRemaining, sessionDate }[]`.
2. Etkinlik detayında "Takip et" düğmesi (kalp).
3. F7 senkronunda takip edilen her etkinlik için `getSessions` → n8n akışındaki mantığın aynısı:
   - `discountedPrice < lastPrice` → "%X indirim"
   - `remaining <= 20 && önceden > 20` → "Son biletler"
   - `remaining === 0` → "Tükendi"
   - `sessionDate - now < 24s` → "Yarın etkinlik"
4. Durum her kontrolde güncellenir (aynı uyarı tekrar etmez).

**Kabul kriterleri:** Takip edilen etkinlik için aynı uyarı iki kez düşmez; takipten çıkarınca planlar silinir.

---

## F13. Ana sayfa kişiselleştirme (`S`)

**Amaç:** Ana sayfayı kullanıcıya göre sıralamak.

**Adımlar**
1. `prefsService.homeLayout: string[]` (kart id'leri) + gizlenebilir kartlar.
2. Ana sayfa kartları `HOME_CARDS` kaydından render edilir (bugün sabit JSX).
3. Uzun basınca "kartı gizle", ayarlarda sıralama.
4. Öğrenci modu: OBS bağlıysa "bugünkü ilk ders" kartı en üstte.

---

## F14. "Nasıl giderim" — rota planlama (`L`)

**Durum:** Belediyenin `/api/howtogo/plan` ucu var (parametreler: `fromLat,fromLng,toLat,toLng,time,arriveBy,maxWalk,orderBy`) ama **şu an 502 "Upstream erişilemedi"** dönüyor.

**Plan A — uç düzelirse (yarım gün):** `services/tripPlannerService.ts` içinde tek sarmalayıcı + sonuç ekranı (yürü → hat → aktarma → yürü adımları).

**Plan B — kendi planlayıcımız (1 hafta):** Gerekli tüm veri elimizde.

1. **Grafik hazırlığı (gece/ilk açılışta bir kez, önbelleğe):**
   - `smartstop/stations` → tüm duraklar (id, lat, lng)
   - Her hat için `wheremybus/variants/{routeId}` → varyantlar
   - Her varyant için `wheremybus/stations/{variantId}` → sıralı durak listesi
   - ~49 hat × 2 varyant = ~100 istek; 24 saat önbellek, arka planda parça parça.
2. **Model:** `variantStops: Map<variantId, stopId[]>`, `stopVariants: Map<stopId, variantId[]>`.
3. **Algoritma (RAPTOR benzeri, 1 aktarma yeterli):**
   - Başlangıç/varış çevresinde `maxWalk` (varsayılan 800 m) içindeki duraklar (haversine).
   - **Doğrudan:** ortak varyantta `idx(from) < idx(to)` olan rotalar.
   - **Tek aktarma:** kalkış varyantlarının durakları ∩ varış varyantlarının durakları → aktarma noktası.
   - **Süre tahmini:** yürüme 5 km/sa; otobüs, durak sayısı × ortalama 1,8 dk (ya da `schedule` ile ilk kalkışa göre); ilk bekleme `smartstop/approaching` ile gerçek `remainingTimeCurr`.
   - Sıralama: toplam süre / aktarma sayısı / yürüme mesafesi.
4. **Ekran:** Nereden–nereye (harita seçimi + "konumum" + durak arama), sonuç kartları, seçilen rotanın haritada çizimi (varyant `geom` polyline'ları kesilerek).
5. Plan A çalışır hale gelirse sonuç şeması aynı bırakılıp kaynak değiştirilir.

**Kabul kriterleri:** Merkez↔Üniversite gibi bilinen güzergahlarda mantıklı sonuç; 3 sn altında hesap (önbellek sıcakken).

---

## F15. Hat gecikme istatistiği (`L`)

**Amaç:** "Bu hat sabahları ortalama X dk gecikiyor" bilgisi.

**Adımlar**
1. `overview/vehicles` (5 sn) verisinden, yalnızca uygulama açıkken, `{routeCode, plaka, lat, lng, ts}` örnekleri toplanır.
2. Cihazda günlük özet (saat dilimi × hat → ortalama hız/araç sayısı) hesaplanıp Firestore'da **anonim** `stats/{routeCode}/{yyyy-mm-dd}` belgesine yazılır (kural: yalnızca giriş yapmış kullanıcı ekleyebilir, kimlik yazılmaz).
3. Hat panelinde "Yoğunluk" grafiği (basit çubuklar).

**Risk:** Veri kalitesi kullanıcı sayısına bağlı → az veri varsa bölüm gizlenir. Gizlilik: konum/kimlik gönderilmez.

---

## F16. İlan panosu v2 (`L`)

1. **Fotoğraf:** `expo-image-picker` + Firebase Storage (`classifieds/{uid}/{id}.jpg`), Storage kuralı: yalnızca sahibi yazar, herkes okur.
2. **Öğrenci doğrulaması:** OBS'ye bağlı hesaplarda `verified: true` rozeti (öğrenci no Firestore'a yazılmaz, yalnızca bayrak).
3. **İletişim:** Firestore'da `threads/{threadId}/messages` ile basit mesajlaşma; bildirimler F7 üzerinden.
4. **Moderasyon:** ilan bildir (`reports` koleksiyonu), sahibi silebilir.

---

## F17. Gakgoş asistan → gerçek LLM (`L`)

**Amaç:** Serbest soru ("5 numaralı otobüs kaçta gelir", "bu dönem kaç AKTS aldım") yanıtlayan asistan.

**Mimari**
- Anahtar istemcide **tutulamaz** → küçük bir proxy (Cloudflare Workers / Vercel Function): istemciden gelen soruyu Claude API'ye iletir, araç çağrılarını uygular.
- Araçlar (tool use): `getApproachingBuses(stopName)`, `getRouteSchedule(routeNo, day)`, `getCardBalance(cardNo)`, `getPharmacies()`, `getEvents(tag)`.
- **OBS verisi cihazdan çıkmaz:** OBS soruları için proxy'ye gitmeden, cihazdaki `obsService` sonucu doğrudan yanıtlanır (mevcut kural tabanlı akış korunur).
- Yanıtlar akışlı (streaming) gösterilir.

**Kabul kriterleri:** Anahtar pakette bulunmaz; OBS içeriği hiçbir üçüncü servise gönderilmez.

---

# Ortak altyapı işleri

| # | İş | Efor | Not |
|---|---|---|---|
| I1 | `LeafletMap` bileşeni (harita HTML'inin tek kaynağa çıkarılması) | S | F4, F14 için ön koşul |
| I2 | Merkezî hata/yeniden deneme sarmalayıcısı (`withRetry`, 429/502 için) | S | Şu an servis servis dağınık |
| I3 | Sentry veya benzeri hata toplama (opsiyonel, anonim) | S | Sürüm sonrası teşhis |
| I4 | Parser testleri: kaydedilmiş HTML örneklerine karşı `obsService`/`eventsService` birim testleri (jest) | M | Kaynak siteler değişince erken uyarı |
| I5 | Koyu tema | M | `Theme.ts` token yapısı hazır; ekranlarda sabit renkler ayıklanmalı |
| I6 | Erişilebilirlik (ekran okuyucu etiketleri, kontrast) | M | — |
| I7 | iOS desteği | L | NFC ve widget'lar ayrı iş; şu an test edilmedi |

---

# Sürüm ve dağıtım akışı

1. Özellik dalında geliştir → `npx tsc --noEmit` temiz olmalı.
2. Cihazda doğrula: `npx expo run:android --variant release` (yerel imza).
3. Canlı uç değişimi varsa Node betiğiyle uçtan uca test (`__*_test.ts` deseni, sonra silinir).
4. `app.config.js` → `versionCode` artır.
5. `eas build -p android --profile production` → APK'yı indir, paket içeriğini doğrula.
6. `gh release create vX.Y.Z <apk>` ile GitHub Releases'a yükle.
7. `README.md` özellik listesini güncelle.

**Değişmez kurallar**
- `.env`, `google-services.json`, keystore **asla** commit edilmez; gizli değerler EAS ortam değişkenlerinde.
- Kişisel veri (OBS kimlik bilgileri, kart no) cihazda kalır; log'a yazılmaz.
- Uçlar değişirse önce `curl`/Node ile doğrula, sonra kodu değiştir.
