# Elazığ Şehir — Tasarım Planı v2

`ROADMAP_V2.md` ile birlikte okunur. v1 tasarımı (lacivert + amber, kart ağırlıklı, üç ayrı katmanlı ulaşım ekranı) kullanımda oturmadı; bu belge **neyin değişeceğini ve neden** değişeceğini, ekran ekran tanımlar. Kod içermez; ölçüler ve token adları uygulama aşamasında `constants/Theme.ts` ve `components/ui.tsx`'e taşınır.

---

## 1. Teşhis — v1 neden tutmadı

| Sorun | Nerede | Etkisi |
|---|---|---|
| **Ulaşım ekranı üç ayrı katman** (arama kaplaması, hat paneli, alt sayfa) üst üste açılıyor; hangisinin aktif olduğu belli değil, kapatmak için farklı jestler gerekiyor | `transit.tsx` `showSearch` / `showRoutesPanel` / `sheetExpanded` | Kullanıcı hat seçtikten sonra durak listesine dönemiyor, "canlı mod"a haritaya dokunarak girildiğini keşfedemiyor |
| **Otobüs işaretçisi emoji** (🚌) + altında "Hat X · plaka" etiketi, 60×56 px; 50 araçta harita okunmaz, döndürme emojide anlamsız | `LeafletMap.tsx` `.bus-marker` | Yön bilgisi kayboluyor, etiketler çakışıyor |
| **Araçlar zıplıyor** (5 sn'de bir sil-çiz) | `updateBuses` | Canlı his yok; "gerçekten canlı mı?" güveni düşük |
| **Başlık şeridi çok kalabalık**: durak/hat sayısı, kart bakiyesi çipi, avatar, canlı çipi, yükleniyor göstergesi aynı satırda | `transit.tsx` header | Kart bakiyesi ulaşım ekranının işi değil; başlık yer yiyor, harita küçülüyor |
| **Ana sayfa 9 hızlı erişim kutusu + 4 bölüm** aynı ağırlıkta | `index.tsx` `HOME_CARDS` | "Şu an ne önemli" hissi yok; öğrenci olmayan kullanıcıya OBS/yemekhane gereksiz |
| **Renk dili ayrışmamış**: lacivert hem marka hem harita durağı hem başlık; amber hem vurgu hem uyarı | `Theme.ts` | Canlı/uyarı/seçili durumları birbirinden ayrılmıyor |
| **Sekme çubuğu 5 sekme**, "Keşfet" ile "Hizmetler" ayrımı belirsiz | `(tabs)/_layout.tsx` | Eczane Hizmetler'de, etkinlik Keşfet'te, haber de Keşfet'te — arama gerektiriyor |

Tasarım ilkesi (v2): **Harita önce, tek panel, canlı olan şey hareket eder, durağan olan şey sessizdir.**

---

## 2. Görsel dil

### 2.1 Renk rolleri (v1 paleti korunur, roller netleşir)

| Rol | Açık tema | Koyu tema | Kural |
|---|---|---|---|
| Marka / başlık / seçili | `navy800` | `navy100` metin, `navy900` yüzey | Yalnızca marka ve seçili durum. Durak işaretçisi artık bu renk **değil**. |
| **Canlı** (otobüs, nabız, geri sayım, "şu an") | `teal600` / yeşil `#10B981` | aynı | Ekranda hareket eden/gerçek zamanlı her şey bu renk; başka hiçbir şeyde kullanılmaz. |
| Vurgu / eylem düğmesi | `amber500` | `amber500` | Birincil düğme, FAB. **Uyarı için kullanılmaz.** |
| Uyarı / hata | `gold600` (uyarı), `red600` (hata) | aynı | Gecikme, "acele et", azami süre aşımı |
| Üniversite | `red700` | aynı | OBS, yemekhane, duyuru — değişmedi |
| Durak (haritada) | `slate500` dolgu, beyaz kenar | `slate400` | Nötr; seçili durak `navy800` halkalı |
| Hat renkleri | 12'lik sabit palet (`routeNo % 12`) | aynı | Her hattın çizgisi ve araç ikonu aynı renkte; bir hat seçiliyken diğerleri %25 opaklık |

### 2.2 Tipografi
- Tek aile (sistem: Roboto/Inter). Ölçek: 11 / 13 / 15 / 17 / 22 / 28. Sayısal veriler (dakika, bakiye, AKTS) **tabular-nums** ile hizalı.
- Başlıklar 17/600; ekran başlığı 22/700; büyük sayı (kalan dk, AGNO) 28/800.

### 2.3 Şekil ve yüzey
- Kart köşesi 16, çip 999, alt panel üst köşesi 20.
- Gölge yok; ayrım için 1 px `cardBorder` + yüzey tonu. Harita üzerindeki yüzeyler (alt panel, çipler) `surface` %96 + blur (expo-blur zaten bağımlılıkta).

### 2.4 Hareket
- Süreler: mikro 120 ms, panel 260 ms, kamera 550 ms. Easing: standart çıkış (ease-out).
- **Canlı nabız**: yalnızca "canlı" rolündeki öğelerde, 2 sn periyot, %60→%100 opaklık. Aynı ekranda en fazla 3 nabızlı öğe.
- Araç hareketi: `ROADMAP_V2` G1 kuralları (sabit hız, çizgi üzerinde, ışınlanmada yanıp sönme).
- `prefers-reduced-motion` / sistem "animasyonları azalt" açıksa araçlar animasyonsuz güncellenir, nabız kapanır.

### 2.5 İkonografi
- Uygulama geneli `lucide-react-native` (bağımlılıkta, tutarlı 1.5 px çizgi). MaterialCommunity yalnızca "bus", "school" gibi lucide'de karşılığı olmayan 3–4 ikon için.
- Emoji arayüzde kullanılmaz (harita işaretçileri dâhil).

---

## 3. Ulaşım ekranı (ana iş)

### 3.1 Yerleşim

```
┌──────────────────────────────────────────┐
│ [≡ Hatlar]   🔍 Durak, hat veya yer ara  │  ← tek arama girişi, harita üstünde yüzer
│ (5)(9)(12)(22)(47)…  ● 51 otobüs canlı   │  ← hat çipleri (aktif araç sayısıyla) + canlı rozet
│                                          │
│                 HARİTA                   │
│        ▲ araçlar hat renginde,           │
│          burnu gidiş yönünde             │
│                                    (◎)   │  ← konumum
│                                    (⇅)   │  ← şehir geneli / seçili hat geçişi
├──────────────────────────────────────────┤
│ ═══  Hastane Durağı · 200 m            ☆ │  ← alt panel tutamacı: seçili bağlam
│  5  Üniversite yönü      ● 2 dk   3 durak│
│ 12  Merkez yönü            6 dk   5 durak│
│ 47  Tapu yönü             14 dk   —      │
└──────────────────────────────────────────┘
```

**Tek alt panel, üç yükseklik:** kapalı (yalnız başlık satırı, 64 px) · yarım (%45) · tam (%92). İçerik bağlama göre değişir; ayrı arama kaplaması ve hat paneli **kaldırılır**:

| Bağlam | Panel başlığı | Panel içeriği |
|---|---|---|
| Durak seçili (varsayılan) | Durak adı · mesafe · ☆ | Yaklaşan otobüsler (G5 geri sayım), "Bu duraktan geçen hatlar", çevredeki duraklar |
| Hat seçili | Hat no + adı · yön çipi (Gidiş/Dönüş) · ☆ | Durak listesi (G3 "otobüs burada" şeridi), G4 "binebileceğin durak" kartı, sefer saatleri (gün çipleri), ücret |
| Araç seçili (G2) | Plaka · hat · hız | Sonraki durak, son GPS zamanı, "Takip et", donanım rozetleri |
| Şehir geneli | "Şehirde 51 otobüs" | Hat çipleri ızgarası (G6), "Yakınımdan geçenler" (G7) |
| Arama odaklı | Arama kutusu (üstte) | Son aramalar, favoriler, sonuçlar (durak / hat / durak-üzerinden-geçen-hat) — panel tam açılır |

**Başlık şeridi kaldırılır.** Kart bakiyesi ve profil ana sayfaya/ayarlara taşınır. Ulaşım ekranının üstünde yalnızca yüzen arama + hat çipleri şeridi bulunur; harita status bar'ın altına kadar uzanır.

### 3.2 Harita katmanı
- **Araç ikonu:** 28 px, hat renginde yuvarlak-dikdörtgen gövde + beyaz hat numarası, burun kısmında küçük ok (yön). Zoom ≥16'da altında plaka etiketi (11/600, yarı saydam yüzey). Seçili araç 36 px ve halka. Duran araç (%0 hız / 3 anlık görüntü sabit) %55 opaklık.
- **Işınlanan araç:** 2 sn boyunca halka genişleyip söner (G1.5).
- **Hat çizgileri:** şehir genelinde tüm hatlar 2 px %35 opaklık (overview `lines`); seçili hat 4 px tam renk, diğerleri %15. Gidiş düz, dönüş kesikli.
- **Duraklar:** zoom <14 gizli; 14–16 küçük nokta (8 px); ≥16 12 px + seçili durakta ad etiketi. Hat seçiliyken yalnızca o hattın durakları görünür.
- **Kullanıcı konumu:** mavi nokta + yön konisi (pusula varsa).
- Koyu temada CARTO dark kalır; hat renkleri koyu tema için %15 açılır.

### 3.3 Mikro etkileşimler
- Haritada boş yere dokunma → şehir geneli **değil**, sadece paneli kapatır. Şehir geneline geçiş sağ alttaki (⇅) düğmesiyle (keşfedilebilir).
- Araca dokunma → araç bağlamı; ikinci dokunma → takip.
- Durak işaretçisine dokunma → durak bağlamı, panel yarım açılır, kamera hafif yukarı kayar (panelin altında kalmaz).
- Panel tutamacını çekme ile üç yükseklik arasında geçiş; yatay kaydırma haritaya iletilir.
- Yenileme göstergesi: sağ üst canlı rozet içindeki nokta yanıp söner; ayrı spinner yok.

### 3.4 Boş/hata durumları
- Konum yok → "Konum kapalı" satırı panel başlığında, şehir merkezi seçili.
- Canlı veri yok (API 5xx) → canlı rozet griye döner "Canlı veri kesik · son 12:40"; işaretçiler yerinde kalır, soluklaşır.
- Hat için araç yok → panelde "Şu an seferde araç yok" + bir sonraki sefer saati.

---

## 4. Ana sayfa

Amaç: "şu an" odaklı, kişiye göre sıralı, tek sütun.

```
┌──────────────────────────────────┐
│ Günaydın, Fatih      ☀ 24°  🔔 ◯ │
│ ┌────────────────────────────┐   │
│ │ ● Benim durağım · Hastane  │   │  ← canlı (G5 geri sayım), yoksa "durak seç"
│ │  5 → 2 dk   12 → 6 dk      │   │
│ └────────────────────────────┘   │
│ ┌───────────┐ ┌──────────────┐   │
│ │ ElazığKart│ │ Namaz · İkindi│  │  ← iki küçük kart: bakiye, sıradaki vakit
│ │  ₺42,50   │ │  15:47 · 1s 12d│  │
│ └───────────┘ └──────────────┘   │
│ Bugün                            │  ← öğrenci ise: ilk ders, sınav; herkes: nöbetçi eczane, kesinti
│ ▸ 10:00 MAT220 · D-204          │
│ ▸ Nöbetçi: Şifa Eczanesi · 1,2 km│
│ Hızlı erişim                     │  ← 4'lü tek satır, yatay kaydırma; kullanıcı sıralar
│ (Nasıl giderim)(OBS)(Etkinlik)(…)│
│ Son haberler                     │
└──────────────────────────────────┘
```

- **"Bugün" bölümü** kaynakları zamanla sıralar: sıradaki ders/sınav, sıradaki namaz, nöbetçi eczane, bugünkü kesinti, bugün etkinlik. Kaynak yoksa satır yok.
- Kart bakiyesi ve profil buraya taşınır (ulaşımdan kaldırıldı). Bakiye kartına dokunma → kart modalı.
- Hızlı erişim 9 kutu → yatay şerit; öğrenci modu kapalıysa OBS/yemekhane şeritte geride.

---

## 5. Sekmeler

5 sekme → **4 sekme**: Ana Sayfa · Ulaşım · Üniversite · Şehir.
- **Şehir** = eski Keşfet + Hizmetler birleşimi; üstte bölüm çipleri: Etkinlikler · Haberler · Eczane · Kesinti · Numaralar · Namaz. Son seçilen çip hatırlanır.
- Sekme ikonları lucide; aktif sekme etiket + ikon, pasif yalnızca ikon (yer kazancı).

---

## 6. OBS — Mezuniyet sekmesi (ROADMAP O1)

```
┌──────────────────────────────────┐
│  ◠◠◠   AKTS 87 / 240             │  ← halka %36; altında "Muhtemel mezuniyet 01.02.2027"
│ ( 36% ) Süre 8 / 7 dönem ▮▮▮▮▮▮▮▮│  ← azami aşıldı → gold uyarı satırı
│  ◡◡◡                             │
│ ┌────────┐┌────────┐┌────────┐   │
│ │AGNO    ││Zorunlu ││Seçmeli │   │  ← kriter kartları; durum rengi sol şerit
│ │1,36/2,0││36/45   ││ —      │   │     ok=teal, uyarı=gold, başarısız=red
│ │▮▮▮▮▮▯▯▯││▮▮▮▮▮▮▮▯││hesapl. │   │
│ └────────┘└────────┘└────────┘   │
│ ┌────────┐┌────────┐┌────────┐   │
│ │AKTS    ││Staj    ││Hazırlık│   │
│ └────────┘└────────┘└────────┘   │
│ ⓘ Mezuniyet kuralları eksik…     │  ← sayfa uyarısı (info, kırmızı değil)
│ [Alınmayan 11] [Başarısız 17]    │  ← segment
│ 2025-26 Güz                      │
│  MAT215 Lineer Cebir   4 AKTS  FF│  ← harf rozeti red; Z/S etiketi
│  YMH217 Nesne Tabanlı  6 AKTS  FF│
│ 2025-26 Bahar …                  │
└──────────────────────────────────┘
```

- Grup satırları ("4. Sınıf Güz Seçmeli · 1 ders alınmalı") ders satırından farklı: kod yerine klasör ikonu, sağda "1 ders" rozeti.
- "Mezuniyet Onay" durumu en altta tek satır: "Onay süreci henüz başlamadı" (alert.aspx) ya da liste.
- OBS sekme şeridi 12 sekmeye çıkıyor → yatay kaydırılabilir çipler yerine **iki satırlı grup**: "Akademik" (Notlar, Dersler, Program, Sınavlar, Devamsızlık, Geçmiş, **Mezuniyet**, Müfredat) · "İdari" (Harç, Takvim, Mesajlar, Danışman).

---

## 7. Bileşen değişiklikleri (`components/ui.tsx`)

| Bileşen | Değişiklik |
|---|---|
| `LiveBadge` (yeni) | teal nokta + metin; `state: live / stale / off`; nabız yalnızca `live` |
| `Countdown` (yeni) | dakika:saniye, tabular; <60 sn "Geliyor", 0 "Durakta"; G5 |
| `RouteChip` (yeni) | hat numarası hat renginde, sağda aktif araç sayısı; seçili/soluk durumları |
| `VehicleCard` (yeni) | G2 araç bağlamı |
| `BottomSheet` (yeni, tek kaynak) | üç yükseklik, tutamaç, içerik bağlama göre; `transit.tsx`'teki `Animated` alt sayfa ve `trip_planner` sonuç paneli buna geçer |
| `ProgressRing` (yeni) | Mezuniyet AKTS halkası; `react-native-svg` bağımlılıkta |
| `CriterionCard` (yeni) | O1 kriter kartı: değer/hedef, yüzde çubuğu, durum şeridi |
| `StatTile` | tabular-nums; "canlı" varyantı teal |
| `Chip` | seçili durumda dolgu değil 2 px kenar (harita üstünde daha hafif) |
| `ScreenHeader` | ulaşımda kullanılmaz; diğer ekranlarda sağ eylem alanı en fazla 2 ikon |
| `Notice` | `tone="live"` eklenir (canlı veri kesildi/geri geldi bildirimi) |

`Theme.ts` eklenecek tokenlar: `live`, `liveBg`, `routePalette[12]`, `mapStop`, `mapStopSelected`, `sheetSurface` (blur'lu yüzey), hareket süreleri (`motion.micro/panel/camera`).

---

## 8. Erişilebilirlik ve performans eşikleri

- Metin kontrastı ≥4.5:1 (hat renkleri üstündeki beyaz numara için palet buna göre seçilir; açık renkler koyu metin alır).
- Tüm harita işaretçileri için panelde eşdeğer liste var (ekran okuyucu haritaya bağımlı değil).
- Dokunma hedefi ≥44 px (araç ikonu 28 px görsel, 44 px dokunma alanı).
- Ulaşım ekranı ilk çizim ≤1,5 sn (önbellekli durak listesi), canlı modda 60 araç 60 fps, saatte ≤%3 pil (G1.11).

---

## 9. Teslim sırası

| Sürüm | Tasarım işi | Bağlı roadmap maddesi |
|---|---|---|
| 2.0.0 | §2 tokenlar + §3 ulaşım ekranı (tek panel, yeni araç ikonu, hat çipleri, başlık kaldırma) + §7 `BottomSheet`, `LiveBadge`, `RouteChip` | G1, G2, G3, G5, G6 |
| 2.0.1 | §4 ana sayfa "Bugün" + kart/profil taşıma; §5 dört sekme | G7, G9 |
| 2.1.0 | §6 Mezuniyet sekmesi + OBS sekme gruplama; `ProgressRing`, `CriterionCard` | O1, O2 |
| 2.1.1 | §8 erişilebilirlik turu, reduced-motion | I6 |

Her sürümde önce gerçek cihazda (orta segment Android) canlı veriyle ekran görüntüsü alınır, `README.md` görselleri güncellenir.
