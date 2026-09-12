import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CachedResult<T> {
  data: T;
  stale: boolean;
  at: number;
}

export const CACHE_TTL = {
  ROUTES: 24 * 60 * 60 * 1000,    // 24 saat
  STATIONS: 24 * 60 * 60 * 1000,  // 24 saat
  PHARMACIES: 1 * 60 * 60 * 1000, // 1 saat
  NEWS: 15 * 60 * 1000,           // 15 dakika
  DINING: 3 * 60 * 60 * 1000,     // 3 saat
  EVENTS: 5 * 60 * 1000,          // 5 dakika
  ROUTE_STOPS: 7 * 24 * 60 * 60 * 1000,   // 7 gün (hat durak dizilimi nadiren değişir)
} as const;

const STORAGE_PREFIX = '@elazig_cache_';
const memoryCache = new Map<string, { data: any; at: number }>();

/** Checks whether data is empty or invalid so we do not overwrite good cached data with an empty fallback */
function isEmptyPayload(data: any): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === 'object') {
    // Check for DiningMenu structure
    if ('lunch' in data || 'dinner' in data) {
      const lunchEmpty = !Array.isArray(data.lunch) || data.lunch.length === 0;
      const dinnerEmpty = !Array.isArray(data.dinner) || data.dinner.length === 0;
      return lunchEmpty && dinnerEmpty;
    }
  }
  return false;
}

/** Formats timestamp to HH:mm string (e.g. "12:40") */
export function formatLastUpdated(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return '';
  const d = new Date(timestamp);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${h}:${m}`;
  }
  const day = d.getDate();
  const month = d.toLocaleString('tr-TR', { month: 'short' });
  return `${day} ${month} ${h}:${m}`;
}

export async function getCachedEntry<T>(key: string): Promise<{ data: T; at: number } | null> {
  const inMem = memoryCache.get(key);
  if (inMem) return inMem as { data: T; at: number };

  try {
    const raw = await AsyncStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && 'data' in parsed && typeof parsed.at === 'number') {
      memoryCache.set(key, parsed);
      return parsed as { data: T; at: number };
    }
  } catch (e) {
    console.log(`[CacheService] Önbellek okuma hatası (${key}):`, e);
  }
  return null;
}

export async function setCachedEntry<T>(key: string, data: T, at: number = Date.now()): Promise<void> {
  const entry = { data, at };
  memoryCache.set(key, entry);
  try {
    await AsyncStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch (e) {
    console.log(`[CacheService] Önbellek yazma hatası (${key}):`, e);
  }
}

/**
 * F5 Çevrimdışı Önbellek Sarmalayıcısı:
 * 1. Başarılıysa {data, at} AsyncStorage'a yazılır.
 * 2. Hata/timeout durumunda veya ağ yokken kayıt varsa stale: true ile döner.
 * 3. Süre dolmamışsa ve kayıt varsa doğrudan önbellekten stale: false döner.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  options?: { force?: boolean }
): Promise<CachedResult<T>> {
  const existing = await getCachedEntry<T>(key);
  const now = Date.now();

  // Geçerli ve süresi dolmamış önbellek varsa (force refresh istenmediyse)
  if (!options?.force && existing && now - existing.at < ttlMs && !isEmptyPayload(existing.data)) {
    return { data: existing.data, stale: false, at: existing.at };
  }

  // Taze veri çekmeyi dene
  try {
    const fresh = await fetcher();

    // Dönen veri geçerliyse önbelleğe kaydet ve dön
    if (!isEmptyPayload(fresh)) {
      await setCachedEntry(key, fresh, now);
      return { data: fresh, stale: false, at: now };
    }

    // İstek boş/hatalı döndüyse ama önbellekte eski veri varsa -> stale ile kurtar!
    if (existing && !isEmptyPayload(existing.data)) {
      console.log(`[CacheService] "${key}" için taze veri boş döndü, eski önbellek kullanılıyor.`);
      return { data: existing.data, stale: true, at: existing.at };
    }

    return { data: fresh, stale: false, at: now };
  } catch (err) {
    // Ağ hatası, uçak modu veya zaman aşımı durumunda önbelleğe geri dön
    if (existing && !isEmptyPayload(existing.data)) {
      console.log(`[CacheService] "${key}" çevrimdışı fallback devrede (stale: true).`);
      return { data: existing.data, stale: true, at: existing.at };
    }
    // Önbellekte de hiçbir şey yoksa hatayı fırlat
    throw err;
  }
}
