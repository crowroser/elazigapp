import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  signInWithCredential,
  GoogleAuthProvider,
  User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { PrefsService } from './prefsService';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  elazigKartNo?: string;
  recentBusStops?: string[];
  recentBusRoutes?: string[];
  obsStudentNo?: string;
  createdAt?: string;
}

/** Firestore hata kodunu kullanıcıya anlamlı Türkçe mesaja çevirir */
export function describeFirestoreError(e: any): string {
  const code: string = e?.code || '';
  if (code.includes('permission-denied')) {
    return 'Sunucu bu kaydı reddetti (Firestore güvenlik kuralları). Bilgi cihazınıza kaydedildi; hesaplar arası senkron için Firebase kurallarının güncellenmesi gerekiyor.';
  }
  if (code.includes('unavailable') || code.includes('network')) {
    return 'Sunucuya ulaşılamadı. Bilgi cihazınıza kaydedildi, bağlantı gelince tekrar deneyin.';
  }
  return e?.message || 'Bilinmeyen bir hata oluştu.';
}

async function withTimeout<T>(p: Promise<T>, ms = 12000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('Zaman aşımı'), { code: 'unavailable' })), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const AuthService = {
  async signUp(email: string, pass: string, displayName: string, elazigKartNo?: string): Promise<UserProfile> {
    const credential = await createUserWithEmailAndPassword(auth, email, pass);
    const user = credential.user;
    await updateProfile(user, { displayName });

    const profileData: UserProfile = {
      uid: user.uid,
      email: user.email || email,
      displayName,
      elazigKartNo: elazigKartNo || '',
      recentBusStops: [],
      recentBusRoutes: [],
      createdAt: new Date().toISOString(),
    };

    await PrefsService.setDisplayName(displayName);
    if (elazigKartNo) await PrefsService.setElazigKartNo(elazigKartNo);

    try {
      await withTimeout(setDoc(doc(db, 'users', user.uid), profileData));
    } catch (e) {
      console.log('Firestore profil kaydı:', describeFirestoreError(e));
    }
    return profileData;
  },

  async signIn(email: string, pass: string): Promise<User> {
    const credential = await signInWithEmailAndPassword(auth, email, pass);
    return credential.user;
  },

  async signInWithGoogleIdToken(idToken: string): Promise<UserProfile> {
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    const user = result.user;
    const userRef = doc(db, 'users', user.uid);
    try {
      const snap = await withTimeout(getDoc(userRef));
      if (snap.exists()) return snap.data() as UserProfile;
    } catch (e) {
      console.log('Firestore profil okuma:', describeFirestoreError(e));
    }
    const newProfile: UserProfile = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || 'Google Kullanıcısı',
      elazigKartNo: await PrefsService.getElazigKartNo(),
      recentBusStops: [],
      recentBusRoutes: [],
      createdAt: new Date().toISOString(),
    };
    try {
      await withTimeout(setDoc(userRef, newProfile, { merge: true }));
    } catch (e) {
      console.log('Firestore profil kaydı:', describeFirestoreError(e));
    }
    return newProfile;
  },

  async signOutUser(): Promise<void> {
    await signOut(auth);
  },

  /**
   * Profil: Firestore'dan okur, ulaşılamazsa/reddedilirse yerel tercihlerle birleştirir.
   * Kart numarası için yerel değer her zaman öncelikli (kullanıcı en son onu girdi).
   */
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    const localCard = await PrefsService.getElazigKartNo();
    const localName = await PrefsService.getDisplayName();
    let remote: UserProfile | null = null;
    try {
      const snap = await withTimeout(getDoc(doc(db, 'users', uid)));
      if (snap.exists()) remote = snap.data() as UserProfile;
    } catch (e) {
      console.log('Profil çekme:', describeFirestoreError(e));
    }
    const current = auth.currentUser;
    const profile: UserProfile = {
      uid,
      email: remote?.email || current?.email || '',
      displayName: remote?.displayName || localName || current?.displayName || 'Kullanıcı',
      elazigKartNo: localCard || remote?.elazigKartNo || '',
      recentBusStops: remote?.recentBusStops || (await PrefsService.getRecentStops()),
      recentBusRoutes: remote?.recentBusRoutes || (await PrefsService.getRecentRoutes()),
      obsStudentNo: remote?.obsStudentNo,
      createdAt: remote?.createdAt,
    };
    // Yerelde kart yok ama sunucuda varsa yerele indir
    if (!localCard && remote?.elazigKartNo) await PrefsService.setElazigKartNo(remote.elazigKartNo);
    return profile;
  },

  /**
   * Profil güncelle: önce yerel (her zaman başarılı), sonra Firestore.
   * Firestore hatası fırlatılır ki arayüz gerçek durumu gösterebilsin.
   */
  async updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
    if (data.elazigKartNo !== undefined) await PrefsService.setElazigKartNo(data.elazigKartNo);
    if (data.displayName) await PrefsService.setDisplayName(data.displayName);
    await withTimeout(setDoc(doc(db, 'users', uid), data, { merge: true }));
  },

  async addRecentBusStop(uid: string | null, stopName: string): Promise<void> {
    await PrefsService.addRecentStop(stopName);
    if (!uid) return;
    try {
      await withTimeout(updateDoc(doc(db, 'users', uid), { recentBusStops: arrayUnion(stopName) }), 8000);
    } catch {
      // yerelde zaten var
    }
  },

  async addRecentBusRoute(uid: string | null, routeName: string): Promise<void> {
    await PrefsService.addRecentRoute(routeName);
    if (!uid) return;
    try {
      await withTimeout(updateDoc(doc(db, 'users', uid), { recentBusRoutes: arrayUnion(routeName) }), 8000);
    } catch {
      // yerelde zaten var
    }
  },

  onAuthChange(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
  },
};
