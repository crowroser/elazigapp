import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cihaz-yerel tercihler. Firestore erişilemese bile (kural/ağ hatası) kart numarası gibi
 * temel bilgiler burada tutulur; Firestore yalnızca hesaplar arası senkron içindir.
 */
const KEYS = {
  elazigKartNo: '@prefs/elazig_kart_no',
  displayName: '@prefs/display_name',
  lastBalance: '@prefs/last_balance',
  recentStops: '@prefs/recent_stops',
  recentRoutes: '@prefs/recent_routes',
} as const;

async function getJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function setJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // yerel depolama hatası uygulamayı durdurmasın
  }
}

export interface LastBalance {
  cardNo: string;
  balance: number;
  pending: number;
  validity: string;
  fetchedAt: string;
}

export const PrefsService = {
  getElazigKartNo: () => getJson<string>(KEYS.elazigKartNo, ''),
  setElazigKartNo: (no: string) => setJson(KEYS.elazigKartNo, (no || '').trim()),

  getDisplayName: () => getJson<string>(KEYS.displayName, ''),
  setDisplayName: (name: string) => setJson(KEYS.displayName, name || ''),

  getLastBalance: () => getJson<LastBalance | null>(KEYS.lastBalance, null),
  setLastBalance: (b: LastBalance | null) => setJson(KEYS.lastBalance, b),

  getRecentStops: () => getJson<string[]>(KEYS.recentStops, []),
  async addRecentStop(name: string) {
    const list = await this.getRecentStops();
    await setJson(KEYS.recentStops, [name, ...list.filter((n) => n !== name)].slice(0, 8));
  },

  getRecentRoutes: () => getJson<string[]>(KEYS.recentRoutes, []),
  async addRecentRoute(name: string) {
    const list = await this.getRecentRoutes();
    await setJson(KEYS.recentRoutes, [name, ...list.filter((n) => n !== name)].slice(0, 8));
  },
};
