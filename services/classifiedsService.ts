import {
  collection,
  getDocs,
  addDoc,
  setDoc,
  doc,
  deleteDoc,
  updateDoc,
  increment,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, auth } from '../config/firebase';

export type ClassifiedCategory = 'Kitap' | 'Ev Arkadaşı' | 'Etkinlik' | 'Eşya' | 'Diğer';

export interface ClassifiedItem {
  id: string;
  title: string;
  category: ClassifiedCategory;
  price: string;
  location: string;
  description?: string;
  author: string;
  authorInitials: string;
  imageUri: string;
  ownerId?: string | null;
  isFavorite?: boolean;
  verifiedStudent?: boolean;
  contactPhone?: string;
  contactEmail?: string;
  reportCount?: number;
  createdAt: string;
}

export interface CreateClassifiedPayload {
  title: string;
  category: ClassifiedCategory;
  price?: string;
  location?: string;
  description?: string;
  authorName?: string;
  imageUri?: string;
  contactPhone?: string;
  verifiedStudent?: boolean;
}

const STORAGE_KEY = '@elazig_classifieds_data';
const FAVORITES_KEY = '@elazig_classifieds_favorites';
const REPORTED_KEY = '@elazig_classifieds_reported';

const INITIAL_REAL_ADS: ClassifiedItem[] = [];

export const ClassifiedsService = {
  /**
   * Reads all classified ads from Firestore and local storage, applying favorite flags
   */
  async getClassifieds(): Promise<ClassifiedItem[]> {
    let ads: ClassifiedItem[] = [];
    try {
      // 1. Try reading from Firestore
      const q = query(collection(db, 'classifieds'), orderBy('createdAt', 'desc'), limit(60));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        querySnapshot.forEach((docSnap) => {
          ads.push({ id: docSnap.id, ...docSnap.data() } as ClassifiedItem);
        });
      }
    } catch (e) {
      console.log('Firestore classifieds read attempt:', e);
    }

    // 2. Fallback to AsyncStorage if Firestore returned empty or network unavailable
    if (ads.length === 0) {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          ads = JSON.parse(stored);
        } else {
          ads = INITIAL_REAL_ADS;
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_REAL_ADS));
        }
      } catch (err) {
        ads = INITIAL_REAL_ADS;
      }
    }

    // Filter out items with too many reports (> 3)
    ads = ads.filter((item) => (item.reportCount || 0) < 3);

    // 3. Attach stored favorite status
    const favorites = await this.getFavoriteIds();
    return ads.map((item) => ({
      ...item,
      isFavorite: favorites.includes(item.id),
    }));
  },

  /**
   * Creates a new real classified ad in Firestore and local storage
   */
  async createClassified(payload: CreateClassifiedPayload): Promise<ClassifiedItem> {
    const author = payload.authorName || 'Öğrenci';
    const initials = author
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const newAd: Omit<ClassifiedItem, 'id'> = {
      title: payload.title,
      category: payload.category,
      price: payload.price?.trim() || 'Görüşülür',
      location: payload.location?.trim() || 'Fırat Üniversitesi',
      description: payload.description?.trim() || '',
      author,
      authorInitials: initials,
      imageUri: payload.imageUri || '',
      contactPhone: payload.contactPhone?.trim() || '',
      verifiedStudent: Boolean(payload.verifiedStudent),
      ownerId: auth.currentUser?.uid || null,
      reportCount: 0,
      createdAt: new Date().toISOString(),
    };

    // Kurallar ownerId == uid ister; girişsiz ilan sunucuya yazılamaz, yerel "sahte yayın" da yapılmaz
    if (!newAd.ownerId) {
      throw new Error('İlan vermek için giriş yapmanız gerekir.');
    }

    // Save to Firestore (başarısızsa hata fırlatılır; ekran kullanıcıya gerçek durumu söyler)
    const docRef = await addDoc(collection(db, 'classifieds'), newAd);
    const createdItem: ClassifiedItem = { id: docRef.id, ...newAd };

    // Update local storage
    try {
      const currentList = await this.getClassifieds();
      const updatedList = [createdItem, ...currentList.filter((c) => c.id !== createdItem.id)];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
    } catch (err) {
      console.warn('Local storage error:', err);
    }

    return createdItem;
  },

  /**
   * Deletes a classified ad by owner
   */
  async deleteClassified(id: string): Promise<boolean> {
    try {
      await deleteDoc(doc(db, 'classifieds', id));
    } catch (e) {
      console.log('Firestore delete attempt:', e);
    }

    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const list: ClassifiedItem[] = JSON.parse(stored);
        const filtered = list.filter((i) => i.id !== id);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      }
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Reports a classified ad for moderation
   */
  async reportClassified(id: string, reason = 'Uygunsuz içerik'): Promise<{ ok: boolean; alreadyReported?: boolean; error?: string }> {
    const uid = auth.currentUser?.uid;
    if (!uid) return { ok: false, error: 'Şikayet için giriş yapmanız gerekir.' };

    let reportedList: string[] = [];
    try {
      const reported = await AsyncStorage.getItem(REPORTED_KEY);
      reportedList = reported ? JSON.parse(reported) : [];
    } catch {
      reportedList = [];
    }
    if (reportedList.includes(id)) return { ok: true, alreadyReported: true };

    try {
      // Belge kimliği {ilanId}_{uid}: kullanıcı başına tek şikayet (kurallar bunu zorunlu kılar)
      await setDoc(doc(db, 'reports', `${id}_${uid}`), {
        classifiedId: id,
        reporterId: uid,
        reason,
        reportedAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, 'classifieds', id), { reportCount: increment(1) });
    } catch (e: any) {
      const code = String(e?.code || '');
      // Aynı belge ikinci kez yazılamaz (create-only kural) → daha önce şikayet edilmiş
      if (code.includes('permission-denied')) {
        console.log('Şikayet kaydı reddedildi:', code);
        return { ok: false, error: 'Bu ilanı daha önce şikayet ettiniz ya da yetkiniz yok.' };
      }
      console.log('Şikayet kaydı hatası:', e);
      return { ok: false, error: 'Şikayet gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin.' };
    }

    // Yalnızca sunucuya yazıldıysa yerelde işaretle
    try {
      reportedList.push(id);
      await AsyncStorage.setItem(REPORTED_KEY, JSON.stringify(reportedList));
    } catch {
      // yerel işaretleme başarısız olsa da şikayet kaydedildi
    }
    return { ok: true };
  },

  /**
   * Get favorite item IDs
   */
  async getFavoriteIds(): Promise<string[]> {
    try {
      const stored = await AsyncStorage.getItem(FAVORITES_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return [];
  },

  /**
   * Toggle favorite state for a given item
   */
  async toggleFavorite(id: string): Promise<boolean> {
    try {
      const favorites = await this.getFavoriteIds();
      let updated: string[];
      let isFav = false;
      if (favorites.includes(id)) {
        updated = favorites.filter((favId) => favId !== id);
        isFav = false;
      } else {
        updated = [...favorites, id];
        isFav = true;
      }
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
      return isFav;
    } catch (e) {
      return false;
    }
  },
};
