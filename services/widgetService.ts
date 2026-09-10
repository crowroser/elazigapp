import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { WidgetDataModule } = NativeModules;

export interface WidgetData {
  prayer_name?: string;
  prayer_time?: string;
  prayer_countdown?: string;
  bus_line_name?: string;
  bus_stop_name?: string;
  bus_eta?: string;
  bus_next_eta?: string;
  elkart_balance?: string;
  elkart_type?: string;
  news_title?: string;
  updated_at?: string;
}

const WIDGET_STORAGE_KEY = '@elazig_widget_config';

export const WidgetService = {
  /** Native widget modülü bu build'de var mı? (native-widgets klasörü managed build'e dahil değilse yok) */
  isNativeAvailable(): boolean {
    return Platform.OS === 'android' && !!WidgetDataModule && typeof WidgetDataModule.updateWidgetData === 'function';
  },

  async updateNativeWidgets(data: WidgetData): Promise<boolean> {
    const existing = await this.getWidgetData();
    const updated = { ...existing, ...data, updated_at: new Date().toISOString() };
    try {
      await AsyncStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Widget verisi kaydedilemedi:', e);
    }
    if (this.isNativeAvailable()) {
      try {
        WidgetDataModule.updateWidgetData(updated);
        return true;
      } catch (e) {
        console.warn('Native widget güncellenemedi:', e);
      }
    }
    return false;
  },

  /** Kayıtlı widget verisi — hiç senkron yapılmadıysa boş döner (uydurma varsayılan yok) */
  async getWidgetData(): Promise<WidgetData> {
    try {
      const stored = await AsyncStorage.getItem(WIDGET_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Widget verisi okunamadı:', e);
    }
    return {};
  },
};
