import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  // @ts-ignore — RN kalıcılığı tip tanımlarında yok ama pakette mevcut
  getReactNativePersistence,
  Auth,
  GoogleAuthProvider,
} from 'firebase/auth';
import { initializeFirestore, getFirestore, Firestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// .env dosyasından gelen EXPO_PUBLIC_* yapılandırma bilgileri
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'elazigapp.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'elazigapp',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'elazigapp.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  auth = getAuth(app);
}

// React Native'de Firestore'un WebChannel bağlantısı bazı ağlarda takılır ve yazmalar
// hiç tamamlanmaz; long-polling bu durumu güvenilir şekilde çözer.
let db: Firestore;
try {
  db = initializeFirestore(app, {
    experimentalForceLongPolling: Platform.OS !== 'web',
  });
} catch (e) {
  db = getFirestore(app);
}

const googleProvider = new GoogleAuthProvider();

export { app, auth, db, googleProvider };
