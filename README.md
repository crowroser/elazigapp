# Elazığ Şehir

Elazığ için tek uygulamada canlı şehir hizmetleri: otobüs takibi ve ElazığKart, Fırat Üniversitesi OBS, etkinlikler, haberler, nöbetçi eczaneler ve kesintiler. Expo (React Native) ile geliştirilmiştir; Android APK olarak EAS üzerinden derlenir.

Uygulama **hiçbir örnek/sahte veri göstermez** — her ekran ilgili kaynaktan anlık veri çeker. Bağımsız bir geliştirici projesidir; Elazığ Belediyesi, Fırat Üniversitesi veya Bubilet'in resmî uygulaması değildir.

## Özellikler

### Ulaşım (ElazığKart)
- Şehirdeki tüm duraklar ve 49 hat, harita üzerinde (Leaflet / WebView)
- Seçilen durağa yaklaşan otobüsler: kalan dakika, kaç durak uzakta, plaka, hat istikameti
- Hat seçince gidiş/dönüş güzergahı, duraklar, günün sefer saatleri ve ücret tarifesi
- Haritada boş bir yere dokununca **şehir geneli canlı mod**: tüm otobüsler 5 sn'de bir güncellenir
- ElazığKart bakiye sorgulama (NFC ile kart okutma veya seri numarası), bekleyen yükleme ve geçerlilik tarihi
- Kart yükleme noktaları / bayiler (konuma göre en yakınlar, yol tarifi)

### Fırat Üniversitesi OBS
- CAS girişi (SSO oturumu tanınır); şifre yalnızca cihazda, şifreli depoda tutulur
- Profil, AGNO, dönem/sınıf, öğrenim durumu, danışman
- Not listesi (vize/final/büt detayları) ve **sınav istatistikleri** (harf dağılımı, sınıf ortalaması, standart sapma, katılım)
- Ders programı (güne göre), alınan dersler, devamsızlık, sınav takvimi, tüm dönemlerin ders geçmişi

### Keşfet
- **Etkinlikler** (Bubilet): kategoriler, seanslar, kalan bilet sayısı, indirimler ve Süper Bilet fırsatları
- **Haberler**: Elazığ Son Haber RSS, kategori filtresi, paylaşım

### Hizmetler
- Nöbetçi eczaneler (ara / yol tarifi), Fırat EDAŞ planlı kesintiler, önemli numaralar, namaz vakitleri

### Diğer
- Ana sayfa: kayıtlı kartın bakiyesi, hava durumu, namaz vakti, hızlı erişim
- Kampüs ilan panosu (Firebase Firestore), Gakgoş asistan (canlı verilerle kural tabanlı), uyarı ayarları, Android widget önizlemesi

## Veri kaynakları

| Alan | Kaynak |
|---|---|
| Ulaşım, bakiye, bayiler | `elazigkart.elazig.bel.tr` (Elazığ Belediyesi) |
| OBS | `obs.firat.edu.tr` / `jasig.firat.edu.tr` (CAS) |
| Yemekhane, duyurular | `unievi.firat.edu.tr`, `firat.edu.tr` ve birim siteleri |
| Etkinlikler | `bubilet.com.tr` / `platform.api.bubilet.com.tr` |
| Haberler | `elazigsonhaber.com` RSS |
| Eczaneler | `elazig.bel.tr` |
| Kesintiler | `firatedas.com.tr` |
| Namaz vakitleri | Aladhan API |
| Hava durumu | WeatherAPI |

## Kurulum

```bash
npm install
cp .env.example .env        # değerleri doldurun
cp google-services.json.example google-services.json   # Firebase konsolundan indirdiğiniz dosya ile değiştirin
npm start                   # Expo dev server
npm run android             # bağlı cihaz/emülatörde çalıştır
```

`.env` içindeki değişkenler (`EXPO_PUBLIC_*`) derleme sırasında pakete gömülür:

| Değişken | Açıklama |
|---|---|
| `EXPO_PUBLIC_FIREBASE_*` | Firebase web yapılandırması (Auth + Firestore) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google ile giriş |
| `EXPO_PUBLIC_WEATHER_API_KEY` | weatherapi.com anahtarı |

> `.env`, `google-services.json` ve keystore dosyaları git'e dahil edilmez. Gizli bilgi içeren hiçbir dosya depoya eklenmemelidir.

### Firestore kuralları

Kullanıcı profilleri ve ilan panosu için kurallar `firestore.rules` dosyasındadır:

```bash
firebase deploy --only firestore:rules --project <proje-id>
```

### EAS ile derleme

Gizli değerler EAS ortam değişkenlerinde tutulur (`eas env:create`); `app.config.js`, `GOOGLE_SERVICES_JSON` değişkeninden `google-services.json` dosyasını üretir.

```bash
eas build -p android --profile production   # APK
```

## Proje yapısı

```text
app/
  (tabs)/           # index (ana sayfa), transit, university, news (Keşfet), services
  obs.tsx           # OBS ekranı
  classifieds.tsx   # İlan panosu
  assistant.tsx     # Gakgoş asistan
  notifications.tsx # Uyarı ayarları
  widgets.tsx       # Widget önizleme
components/
  ui.tsx            # Tasarım sistemi bileşenleri (Card, Chip, Pill, StatTile, ...)
  ...               # Kart, hava, namaz, modal bileşenleri
services/
  apiService.ts     # ElazığKart, eczane, kesinti, haber, duyuru, yemekhane, namaz, hava
  obsService.ts     # Fırat OBS (CAS girişi, sayfa ayrıştırma)
  eventsService.ts  # Bubilet etkinlikleri
  authService.ts    # Firebase Auth + Firestore profil
  prefsService.ts   # Cihaz-yerel tercihler
constants/Theme.ts  # Renk, boşluk, tipografi tokenları
firestore.rules     # Firestore güvenlik kuralları
```

## Notlar

- Belediye ve OBS servisleri zaman zaman değişmekte veya aralıklı 5xx dönmektedir; servis katmanı yeniden deneme ve önbellek kullanır.
- Uygulama Türkçe arayüze sahiptir ve Android'e odaklanır (iOS derlemesi test edilmemiştir).

## Lisans

[MIT](LICENSE)
