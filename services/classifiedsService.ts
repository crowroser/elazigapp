import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, auth } from '../config/firebase';

export interface ClassifiedItem {
  id: string;
  title: string;
  category: 'Kitap' | 'Ev Arkadaşı' | 'Etkinlik';
  price: string;
  location: string;
  author: string;
  authorInitials: string;
  imageUri: string;
  ownerId?: string | null;
  isFavorite?: boolean;
  createdAt: string;
}

const STORAGE_KEY = '@elazig_classifieds_data';
const FAVORITES_KEY = '@elazig_classifieds_favorites';

const INITIAL_REAL_ADS: ClassifiedItem[] = [];


export const ClassifiedsService = {
  /**
   * Reads all classified ads from Firestore and local storage, applying favorite flags
   */
  async getClassifieds(): Promise<ClassifiedItem[]> {
    let ads: ClassifiedItem[] = [];
    try {
      // 1. Try reading from Firestore
      const q = query(collection(db, 'classifieds'), orderBy('createdAt', 'desc'), limit(50));
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
  async createClassified(
    title: string,
    category: 'Kitap' | 'Ev Arkadaşı' | 'Etkinlik',
    price: string,
    location: string,
    authorName: string
  ): Promise<ClassifiedItem> {
    const newAd: Omit<ClassifiedItem, 'id'> = {
      title,
      category,
      price: price || 'Görüşülür',
      location: location || 'Fırat Üniversitesi',
      author: authorName || 'Misafir',
      authorInitials: (authorName || 'M').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2),
      imageUri: '',
      ownerId: auth.currentUser?.uid || null,
      createdAt: new Date().toISOString(),
    };

    let createdId = 'ad-' + Date.now();

    // Save to Firestore
    try {
      const docRef = await addDoc(collection(db, 'classifieds'), newAd);
      createdId = docRef.id;
    } catch (e) {
      console.log('Firestore write notice (saving locally):', e);
    }

    const createdItem: ClassifiedItem = { id: createdId, ...newAd };

    // Update local storage
    try {
      const currentList = await this.getClassifieds();
      const updatedList = [createdItem, ...currentList];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
    } catch (err) {
      console.warn('Local storage error:', err);
    }

    return createdItem;
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
