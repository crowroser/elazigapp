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
  favoriteStop: '@prefs/favorite_stop',
  favoriteRoutes: '@prefs/favorite_routes',
  gradeSnapshot: '@prefs/grade_snapshot',
  unseenGrades: '@prefs/unseen_grades',
  lastNotifSync: '@prefs/last_notif_sync',
  trackedEvents: '@prefs/tracked_events',
  homeLayout: '@prefs/home_layout',
  hiddenCards: '@prefs/hidden_cards',
  favoritesTouched: '@prefs/favorites_touched',
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

export interface FavoriteStop {
  id: string;
  name: string;
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

  getFavoriteStop: () => getJson<FavoriteStop | null>(KEYS.favoriteStop, null),
  async setFavoriteStop(stop: FavoriteStop | null) {
    await setJson(KEYS.favoriteStop, stop);
    await setJson(KEYS.favoritesTouched, true);
  },

  /**
   * Kullanıcı bu cihazda favorilere en az bir kez dokundu mu? Dokunduysa sunucudaki eski favoriler
   * yerele geri indirilmez (aksi hâlde silinen favori bir sonraki profil okumasında geri gelir).
   */
  getFavoritesTouched: () => getJson<boolean>(KEYS.favoritesTouched, false),

  getFavoriteRoutes: () => getJson<string[]>(KEYS.favoriteRoutes, []),
  async setFavoriteRoutes(routes: string[]) {
    await setJson(KEYS.favoriteRoutes, routes);
    await setJson(KEYS.favoritesTouched, true);
  },
  async toggleFavoriteRoute(routeCode: string): Promise<string[]> {
    const code = (routeCode || '').trim();
    if (!code) return this.getFavoriteRoutes();
    const list = await this.getFavoriteRoutes();
    const exists = list.includes(code);
    const updated = exists ? list.filter((r) => r !== code) : [...list, code];
    await setJson(KEYS.favoriteRoutes, updated);
    await setJson(KEYS.favoritesTouched, true);
    return updated;
  },
  async isFavoriteRoute(routeCode: string): Promise<boolean> {
    const list = await this.getFavoriteRoutes();
    return list.includes((routeCode || '').trim());
  },

  // ── Not değişikliği ──────────────────────────────────────────────────────

  getGradeSnapshot: () => getJson<GradeSnapshot | null>(KEYS.gradeSnapshot, null),
  setGradeSnapshot: (snap: GradeSnapshot | null) => setJson(KEYS.gradeSnapshot, snap),

  getUnseenGrades: () => getJson<GradeChange[]>(KEYS.unseenGrades, []),
  setUnseenGrades: (changes: GradeChange[]) => setJson(KEYS.unseenGrades, changes),
  async clearUnseenForCourse(courseCode: string): Promise<void> {
    const list = await this.getUnseenGrades();
    await this.setUnseenGrades(list.filter((c) => c.courseCode !== courseCode));
  },

  // ── Bildirim senkron zamanı ──────────────────────────────────────────────

  getLastNotifSync: () => getJson<number>(KEYS.lastNotifSync, 0),
  setLastNotifSync: (ts: number) => setJson(KEYS.lastNotifSync, ts),

  // ── F12: Etkinlik Takibi ──────────────────────────────────────────────────

  getTrackedEvents: () => getJson<TrackedEvent[]>(KEYS.trackedEvents, []),
  setTrackedEvents: (events: TrackedEvent[]) => setJson(KEYS.trackedEvents, events),
  async toggleTrackEvent(event: TrackedEvent): Promise<boolean> {
    const list = await this.getTrackedEvents();
    const exists = list.some((e) => e.slug === event.slug);
    let updated: TrackedEvent[];
    if (exists) {
      updated = list.filter((e) => e.slug !== event.slug);
    } else {
      updated = [...list, { ...event, trackedAt: new Date().toISOString() }];
    }
    await this.setTrackedEvents(updated);
    return !exists;
  },
  async isTrackedEvent(slug: string): Promise<boolean> {
    const list = await this.getTrackedEvents();
    return list.some((e) => e.slug === slug);
  },
  async updateTrackedEvent(slug: string, patch: Partial<TrackedEvent>): Promise<void> {
    const list = await this.getTrackedEvents();
    const updated = list.map((e) => (e.slug === slug ? { ...e, ...patch } : e));
    await this.setTrackedEvents(updated);
  },

  // ── F13: Ana Sayfa Kişiselleştirme ─────────────────────────────────────────

  getHomeLayout: () => getJson<string[]>(KEYS.homeLayout, DEFAULT_HOME_LAYOUT),
  setHomeLayout: (layout: string[]) => setJson(KEYS.homeLayout, layout),
  getHiddenCards: () => getJson<string[]>(KEYS.hiddenCards, []),
  setHiddenCards: (hidden: string[]) => setJson(KEYS.hiddenCards, hidden),
  async toggleHideCard(id: string): Promise<string[]> {
    const list = await this.getHiddenCards();
    const updated = list.includes(id) ? list.filter((c) => c !== id) : [...list, id];
    await this.setHiddenCards(updated);
    return updated;
  },
};

// ── F12 Types ───────────────────────────────────────────────────────────────

export interface TrackedEvent {
  slug: string;
  title: string;
  link: string;
  lastPrice: number | null;
  lastRemaining: number | null;
  sessionDate?: string;
  trackedAt: string;
}

// ── F13 Constants ───────────────────────────────────────────────────────────

export const DEFAULT_HOME_LAYOUT = [
  'student',
  'favoriteStop',
  'card',
  'quickActions',
  'weather',
  'prayer',
  'news',
  'pharmacies',
];

// ── Grade change detection types ────────────────────────────────────────────

/** Dönem bazlı not anlık görüntüsü */
export type GradeSnapshot = Record<
  string /* semesterCode */,
  Record<string /* courseCode */, GradeCourseSnapshot>
>;

export interface GradeCourseSnapshot {
  courseName: string;
  letterGrade: string;
  average: number | null;
  exams: Record<string, string>; // { "Vize": "65", "Final": "80" }
}

export interface GradeChange {
  courseCode: string;
  courseName: string;
  kind: 'letter' | 'exam' | 'average';
  label: string;
  oldValue: string;
  newValue: string;
}
