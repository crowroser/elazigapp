/**
 * Elazığ Şehir — Android ana ekran widget'ları için Expo config plugin (F11).
 *
 * native-widgets/android altındaki YALNIZCA widget'a ait dosyaları üretilen android/ projesine
 * kopyalar, AndroidManifest'e üç <receiver> ekler ve MainApplication.kt'ye WidgetDataPackage
 * kaydını yapar. Üretilen strings/colors/styles/ikon/splash kaynaklarına ve MainActivity'ye
 * DOKUNMAZ (aksi halde Expo'nun ürettiği splash/ikon yapılandırması ezilir).
 *
 * Idempotent: `expo prebuild` tekrar çalıştırıldığında aynı sonucu üretir.
 */
const { withDangerousMod, withAndroidManifest, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PKG_DIR = path.join('com', 'crowroser', 'elazigsehir');

/** Kopyalanacak Kotlin dosyaları — MainActivity/MainApplication bilinçli olarak dışarıda */
const WIDGET_KOTLIN_FILES = [
  'PrayerWidgetProvider.kt',
  'BusWidgetProvider.kt',
  'ElkartWidgetProvider.kt',
  'WidgetDataModule.kt',
  'WidgetDataPackage.kt',
];

/** Kopyalanacak kaynak dosyaları (res altında, göreli yol) */
const WIDGET_RES_FILES = [
  'drawable/widget_bg.xml',
  'drawable/widget_primary_bg.xml',
  'drawable/widget_progress_bg.xml',
  'layout/widget_bus.xml',
  'layout/widget_elkart.xml',
  'layout/widget_prayer.xml',
  'xml/widget_bus_info.xml',
  'xml/widget_elkart_info.xml',
  'xml/widget_prayer_info.xml',
];

const RECEIVERS = [
  { name: '.PrayerWidgetProvider', label: 'Namaz Vakti Widget', info: '@xml/widget_prayer_info' },
  { name: '.BusWidgetProvider', label: 'Otobüs Varış Widget', info: '@xml/widget_bus_info' },
  { name: '.ElkartWidgetProvider', label: 'ElazığKart Bakiye Widget', info: '@xml/widget_elkart_info' },
];

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[withElazigWidgets] kaynak bulunamadı, atlanıyor: ${src}`);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

const withWidgetSources = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const androidRoot = cfg.modRequest.platformProjectRoot; // <proje>/android
      const srcMain = path.join(projectRoot, 'native-widgets', 'android', 'app', 'src', 'main');
      const destMain = path.join(androidRoot, 'app', 'src', 'main');

      for (const file of WIDGET_KOTLIN_FILES) {
        copyFile(path.join(srcMain, 'java', PKG_DIR, file), path.join(destMain, 'java', PKG_DIR, file));
      }
      for (const rel of WIDGET_RES_FILES) {
        copyFile(path.join(srcMain, 'res', rel), path.join(destMain, 'res', rel));
      }
      return cfg;
    },
  ]);

const withWidgetReceivers = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;
    app.receiver = app.receiver || [];
    for (const r of RECEIVERS) {
      if (app.receiver.some((x) => x.$ && x.$['android:name'] === r.name)) continue;
      app.receiver.push({
        $: { 'android:name': r.name, 'android:exported': 'true', 'android:label': r.label },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] }],
        'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': r.info } }],
      });
    }
    return cfg;
  });

/** PackageList(this).packages.apply { add(WidgetDataPackage()) } — mevcut şablonu düzenler, dosyayı ezmez */
const withWidgetPackage = (config) =>
  withMainApplication(config, (cfg) => {
    const src = cfg.modResults.contents;
    if (src.includes('WidgetDataPackage()')) return cfg;
    const marker = 'PackageList(this).packages.apply {';
    if (src.includes(marker)) {
      cfg.modResults.contents = src.replace(marker, `${marker}\n              add(WidgetDataPackage())`);
    } else {
      // Şablon değişmişse: getPackages gövdesinin sonuna ekle
      cfg.modResults.contents = src.replace(
        /(override fun getPackages\(\): List<ReactPackage> =\s*PackageList\(this\)\.packages)/,
        '$1.apply { add(WidgetDataPackage()) }'
      );
      if (!cfg.modResults.contents.includes('WidgetDataPackage()')) {
        console.warn('[withElazigWidgets] MainApplication.kt şablonu tanınmadı; WidgetDataPackage elle eklenmeli.');
      }
    }
    return cfg;
  });

module.exports = function withElazigWidgets(config) {
  config = withWidgetSources(config);
  config = withWidgetReceivers(config);
  config = withWidgetPackage(config);
  return config;
};
