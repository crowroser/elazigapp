# 🚀 Elazığ Şehir Asistanı Mobil Uygulaması (Expo React Native - Android & iOS)

Elazığ Şehir Mobil Uygulaması, `bot_code` içerisindeki Telegram/N8N bot servislerinin iş mantığını ve `tasarım` klasöründeki modern UI/UX tasarım sistemlerini birleştirerek Expo React Native altyapısıyla geliştirilmiştir.

---

## 📱 Uygulama Ekranları ve Özellikleri

### 1. 🏠 Ana Sayfa (Dashboard)
- **Hoş Geldiniz & Canlı Hava Durumu**: WeatherAPI entegrasyonu ile Elazığ anlık sıcaklık, durum (Güneşli, Bulutlu vb.), nem ve rüzgar bilgisi.
- **ElazığKart Bakiye Kartı**: Güncel bakiye, kart tipi, NFC görseli ve "Kart Sorgula" butonu.
- **Canlı Ezan Vakti Geri Sayım Widget'ı**: Bir sonraki vakte kalan sürenin canlı geri sayımı ve günlük 6 vakitlik zaman şeridi.
- **Şehir Hizmetleri Bento Grid**: Ulaşım, Yemekhane, Eczane, Haberler, Namaz Vakitleri ve Akademik Flow için hızlı erişim kartları.
- **Keşfet & Canlı Harita Banner'ı**: Şehir canlı trafik durumu rozeti ve harita keşif yönlendirmesi.

---

### 2. 🚌 Canlı Ulaşım & ElazığKart (`/transit`)
- **Canlı Otobüs Durakları**: `elazigkart.elazig.bel.tr` servisinden çekilen aktif duraklar, durak kodları, geçen hatlar ve otobüs varış süreleri.
- **Hat Detayları (Hat 23 Harput, Hat 1 Kampüs, Hat 5 Çayda Çıra)**: Güzergah durak sırası (Timeline), ilk ve son durak bilgileri ile hafta içi kalkış saatleri.
- **Gerçek Zamanlı ElazığKart Bakiye Sorgulama**:
  - `POST https://elazigkart.elazig.bel.tr/api/card/usercardinfocore` API entegrasyonu.
  - Kart sahibinin adı-soyadı, kart tipi (İndirimli Öğrenci / Sivil), güncel TL bakiyesi, kart durumu ve son otobüs biniş işlem tarihi gösterimi.

---

### 3. 🎓 Fırat Üniversitesi Portal (`/university`)
- **Günün Yemekhane Menüsü**:
  - `https://unievi.firat.edu.tr/` canlı yemekhane verisi.
  - **Öğle / Akşam** menü geçişi (Çorba, Ana Yemek, Pilav/Makarna, Tatlı/Meyve).
  - Kalori (kcal) etiketleri, Öğrenci (25.00 ₺) ve Personel (65.00 ₺) indirimli fiyat bilgilendirme panosu.
- **Akademik Duyuru Akışı**:
  - 33 Fakülte ve Yüksekokul duyurularını tarayan dinamik akış.
  - Fakülteye göre filtreleme çipleri (`Mühendislik`, `Teknoloji`, `Tıp`, `İİBF` vb.).
- **Akademik Takvim Etkinlikleri**: Vize/Final sınav haftaları ve üniversite sempozyum takvimi.

---

### 4. 📰 Elazığ Haber Merkezi (`/news`)
- **Son Dakika Haber Feed'i**: `elazigsonhaber.com` RSS Feed servisinden canlı şehir haberleri.
- **Kategori Filtreleme**: Şehir, Eğitim, Kültür, Spor kategorileri.
- **Haber Detay & Paylaşım**: Detaylı oku ekranı ve cihaz içi haber paylaşma (`Share.share`) aksiyonu.

---

### 5. 🏥 Kent Rehberi & Nöbetçi Eczaneler (`/services`)
- **Elazığ Nöbetçi Eczaneler**:
  - `elazig.bel.tr` nöbetçi eczaneler canlı listesi.
  - Tek tıkla telefon araması (`tel:0424...`), açık adres, nöbet saatleri ve Google Maps yol tarifi.
- **Elektrik & Su Kesintileri**: Aksa Elektrik ve Elazığ Belediyesi planlı kesinti saatleri ve etkilenecek mahalleler.
- **Önemli Telefon Rehberi**: Belediye Çağrı Merkezi (153), Acil Çağrı (112), Aksa Elektrik (186), Su Arıza (185) ve Hastane santral numaraları.

---

## 🛠️ Proje Yapısı

```text
elazıgapp/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx      # Tab bar yapılandırması & ikonlar
│   │   ├── index.tsx        # Ana Sayfa / Dashboard
│   │   ├── transit.tsx      # Ulaşım & ElazığKart
│   │   ├── university.tsx   # Yemekhane & Üniversite
│   │   ├── news.tsx         # Haberler & Duyurular
│   │   └── services.tsx     # Eczane, Kesintiler & Rehber
│   └── _layout.tsx          # Kök Stack Navigation
├── components/
│   ├── Header.tsx           # Üst bar & Logo
│   ├── ElazigKartCard.tsx   # ElazığKart widget'ı
│   ├── CardQueryModal.tsx   # Canlı bakiye sorgulama modalı
│   ├── WeatherWidget.tsx    # Hava durumu kartı
│   ├── PrayerCard.tsx       # Namaz vakitleri geri sayım kartı
│   └── BentoGrid.tsx        # Şehir hizmetleri bento ızgarası
├── services/
│   └── apiService.ts        # Tüm API, scraping ve mock veri servisleri
├── constants/
│   └── Theme.ts             # Elazığ Kent renk paleti & UI tokenları
├── bot_code/                # Bot kaynak kodları (N8N JSON)
├── tasarım/                 # HTML/CSS Mobil Arayüz Tasarımları
├── package.json
└── app.json
```

---

## 💻 Çalıştırma Talimatları

Proje dizininde terminal üzerinden aşağıdaki komutları kullanabilirsiniz:

### 1. Geliştirici Sunucusunu Başlatma (Expo Dev Server)
```bash
npm start
```
*QR kodunu telefonunuzdaki **Expo Go** uygulamasından okutarak Android veya iOS cihazınızda canlı olarak test edebilirsiniz.*

### 2. Android Emülatörde Çalıştırma
```bash
npm run android
```

### 3. iOS Simülatörde Çalıştırma (macOS)
```bash
npm run ios
```

### 4. Web Üzerinde Test Etme
```bash
npm run web
```
