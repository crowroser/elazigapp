// Basit JSON dosya deposu (abonelikler + görülen duyurular).
// Küçük ölçek için yeterli; büyürse SQLite/Firestore'a taşınabilir.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json'); // { [token]: { topics: string[], platform, updatedAt } }
const SEEN_FILE = path.join(DATA_DIR, 'seen.json'); // { [topic]: string[] (görülen duyuru id/linkleri) }

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, obj) {
  ensureDir();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file); // atomik yazım
}

module.exports = {
  getSubscriptions() {
    return readJson(SUBS_FILE, {});
  },
  saveSubscriptions(subs) {
    writeJson(SUBS_FILE, subs);
  },
  /** Aktif abonesi olan tüm topic'leri döner. */
  activeTopics() {
    const subs = this.getSubscriptions();
    const set = new Set();
    for (const token of Object.keys(subs)) {
      for (const t of subs[token].topics || []) set.add(t);
    }
    return [...set];
  },
  getSeen() {
    return readJson(SEEN_FILE, {});
  },
  saveSeen(seen) {
    writeJson(SEEN_FILE, seen);
  },
};
