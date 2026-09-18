# Fırat Birim Duyuru Push Servisi

Seçtiği birimlerin (fakülte/bölüm/daire…) yeni duyurularını kullanıcılara **anlık bildirim**
olarak gönderen küçük servis. Uygulama tarafı (`services/firatUnitsService.ts`) cihazın FCM
token'ını + seçili topic'leri bu servisin `/register` ucuna gönderir; servis token'ı ilgili
FCM topic'lerine abone eder ve duyuru sayfalarını tarayıp yeni duyuru geldiğinde o topic'e push atar.

## Mimari

```
Uygulama  --POST /register {token, topics[]}-->  Servis
Servis    --subscribeToTopic(token, topic)--->   FCM (kendi projemiz: elazigapp)
Servis    --her 3 dk: birim sayfasını tara-->    yeni duyuru?
                --messaging().send({topic})-->    FCM --> abone cihazlar
```

Topic adları uygulama ile aynı: `firat_<subdomain>` (ör. `firat_muhendislikf`). Tam liste `units.json`.

## Kurulum

1. **Servis hesabı anahtarı**: Firebase Console → `elazigapp` projesi → Project Settings →
   Service accounts → *Generate new private key*. İnen dosyayı `server/serviceAccount.json`
   olarak koy (veya `GOOGLE_APPLICATION_CREDENTIALS` env'i ile yol ver). **Bu dosyayı repoya ekleme.**

2. Bağımlılıklar ve çalıştırma:
   ```bash
   cd server
   npm install
   node index.js
   ```

3. Uygulamayı bu servise bağla: kök `.env` içine servisin genel adresini yaz:
   ```
   EXPO_PUBLIC_PUSH_API_URL=https://senin-vps-adresin.com
   ```
   (Uygulama bunu build zamanında gömülü okur; değişince yeniden build gerekir.)

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `8080` | HTTP portu |
| `SCRAPE_INTERVAL_MS` | `180000` | Tarama aralığı (ms). "Anlık"lık buna bağlı. |
| `REGISTER_SECRET` | (boş) | Doluysa `/register` çağrısı `x-app-secret` header'ı ister |
| `GOOGLE_APPLICATION_CREDENTIALS` | `./serviceAccount.json` | Servis hesabı anahtarı yolu |
| `DATA_DIR` | `./data` | Abonelik + görülen duyuru deposu |

Prod'da `pm2 start index.js --name firat-push` + bir reverse proxy (Caddy/Nginx, HTTPS) önerilir.

## Uç noktalar

- `POST /register` — gövde: `{ token, platform, topics: string[], appVersion }`.
  Token'ı topic'lere abone/çıkarır, aboneliği depolar.
- `GET /health` — `{ ok, units, activeTopics }`.

## Bilinen sınırlar / ince ayar

- **Tarama selektörleri** (`scraper.js`) Fırat alt alan adlarının farklı şablonlarına göre
  ayarlanmalı. Şu an `announcements-detail` / `duyuru-detay` linklerini ve ana portal
  duyuru listesini deniyor; bazı birimler farklı olabilir — canlı test edip regex'i güçlendir.
- İlk taramada mevcut duyurular **gönderilmez**, yalnız "görüldü" olarak işaretlenir (spam önleme).
- Her döngüde topic başına en fazla 3 yeni duyuru gönderilir (ani yığın koruması).
- "Anlık" = tarama aralığı kadar gecikme. Gerçek sıfır-gecikme ancak Fırat'ın kendi yayın
  tetikleyicisiyle mümkün.
- Token yenilenmesi: cihaz yeni token alınca uygulama tekrar `/register` çağırır; eski token
  FCM'de zamanla geçersiz olur (temizlik istersen `messaging().send` hatalarından ayıklanabilir).
