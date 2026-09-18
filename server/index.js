// Fırat birim duyuru push servisi (VPS + firebase-admin).
//
//   POST /register  { token, platform, topics[], appVersion }
//     -> token'ı istenen topic'lere abone eder, çıkarılanlardan çıkarır, depoya yazar.
//   GET  /health
//   Cron  -> aktif topic'leri tarar, yeni duyuruyu ilgili topic'e push atar.
//
// Kurulum için server/README.md'ye bakın.

const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const store = require('./store');
const { scrapeUnit } = require('./scraper');

const UNITS = require('./units.json');
const UNIT_BY_TOPIC = Object.fromEntries(UNITS.map((u) => [u.topic, u]));

// ─── Firebase Admin başlat (anahtar yoksa "degraded" modda çalışır) ─────────────
// GOOGLE_APPLICATION_CREDENTIALS env'i veya server/serviceAccount.json
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'serviceAccount.json');
let messaging = null;
let saInfo = null;

function initAdmin() {
  if (messaging) return true;
  if (!fs.existsSync(SA_PATH)) return false;
  try {
    const sa = require(SA_PATH);
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
    messaging = admin.messaging();
    saInfo = { projectId: sa.project_id, clientEmail: sa.client_email };
    console.log('firebase-admin hazır — proje:', sa.project_id);
    return true;
  } catch (e) {
    console.error('serviceAccount yüklenemedi:', e.message);
    return false;
  }
}
initAdmin();

const PORT = process.env.PORT || 8080;
const SCRAPE_INTERVAL_MS = parseInt(process.env.SCRAPE_INTERVAL_MS || '180000', 10); // 3 dk
const REGISTER_SECRET = process.env.REGISTER_SECRET || ''; // opsiyonel basit koruma

const app = express();
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    configured: !!messaging,
    firebaseProject: saInfo ? saInfo.projectId : null,
    units: UNITS.length,
    activeTopics: store.activeTopics().length,
  });
});

app.post('/register', async (req, res) => {
  if (REGISTER_SECRET && req.get('x-app-secret') !== REGISTER_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!initAdmin()) {
    return res.status(503).json({ error: 'not-configured', detail: 'serviceAccount.json henüz yüklenmedi' });
  }
  const { token, platform, topics, appVersion } = req.body || {};
  if (!token || !Array.isArray(topics)) {
    return res.status(400).json({ error: 'token ve topics zorunlu' });
  }
  // Geçerli topic'ler (bilinmeyenleri ele)
  const valid = topics.filter((t) => UNIT_BY_TOPIC[t]);

  const subs = store.getSubscriptions();
  const prev = new Set((subs[token] && subs[token].topics) || []);
  const next = new Set(valid);

  const toAdd = [...next].filter((t) => !prev.has(t));
  const toRemove = [...prev].filter((t) => !next.has(t));

  try {
    await Promise.all([
      ...toAdd.map((t) => messaging.subscribeToTopic(token, t)),
      ...toRemove.map((t) => messaging.unsubscribeFromTopic(token, t)),
    ]);
  } catch (e) {
    console.error('subscribe hata:', e.message);
    return res.status(502).json({ error: 'subscription-failed' });
  }

  subs[token] = { topics: valid, platform: platform || 'unknown', appVersion: appVersion || '', updatedAt: Date.now() };
  store.saveSubscriptions(subs);

  res.json({ ok: true, subscribed: valid.length, added: toAdd.length, removed: toRemove.length });
});

// ─── Tarama + push döngüsü ─────────────────────────────────────────────────────
async function runScrapeCycle() {
  if (!initAdmin()) return; // anahtar yoksa taramayı atla
  const topics = store.activeTopics();
  if (!topics.length) return;
  const seen = store.getSeen();
  let pushed = 0;

  for (const topic of topics) {
    const unit = UNIT_BY_TOPIC[topic];
    if (!unit) continue;
    const items = await scrapeUnit(unit);
    if (!items.length) continue;

    const known = new Set(seen[topic] || []);
    const fresh = items.filter((it) => !known.has(it.id));

    // İlk taramada spam olmasın: sadece kaydet, gönderme.
    if (!seen[topic]) {
      seen[topic] = items.map((it) => it.id).slice(0, 50);
      continue;
    }

    for (const it of fresh.slice(0, 3)) {
      try {
        await messaging.send({
          topic,
          notification: { title: unit.name, body: it.title },
          data: { route: '/news', link: it.link, topic },
          android: { priority: 'high', notification: { channelId: 'firat-duyuru' } },
        });
        pushed++;
      } catch (e) {
        console.error(`push hata [${topic}]:`, e.message);
      }
    }
    // Görülenleri güncelle (en yeni 50)
    seen[topic] = [...fresh.map((it) => it.id), ...(seen[topic] || [])].slice(0, 50);
  }

  store.saveSeen(seen);
  if (pushed) console.log(`[${new Date().toISOString()}] ${pushed} duyuru push edildi`);
}

app.listen(PORT, () => {
  console.log(`Push servisi :${PORT} — ${UNITS.length} birim yüklü — firebase-admin: ${messaging ? 'hazır' : 'BEKLIYOR (serviceAccount.json yok)'}`);
  runScrapeCycle().catch((e) => console.error('ilk tarama hata:', e.message));
  setInterval(() => runScrapeCycle().catch((e) => console.error('tarama hata:', e.message)), SCRAPE_INTERVAL_MS);
});
