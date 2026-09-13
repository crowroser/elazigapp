const fs = require('fs');
const path = require('path');
// Support writing google-services.json during EAS Cloud builds from either:
// - GOOGLE_SERVICES_JSON_BASE64 (base64-encoded file content)
// - GOOGLE_SERVICES_JSON (raw JSON content or base64)
function writeGoogleServices(content) {
  try {
    fs.writeFileSync(path.resolve(__dirname, 'google-services.json'), content);
    console.log('Wrote google-services.json from env');
  } catch (e) {
    console.warn('Failed to write google-services.json from env', e);
  }
}
if (process.env.GOOGLE_SERVICES_JSON_BASE64) {
  try {
    writeGoogleServices(Buffer.from(process.env.GOOGLE_SERVICES_JSON_BASE64, 'base64'));
  } catch (e) {
    console.warn('Failed to decode GOOGLE_SERVICES_JSON_BASE64', e);
  }
} else if (process.env.GOOGLE_SERVICES_JSON) {
  try {
    const val = process.env.GOOGLE_SERVICES_JSON.trim();
    // If the value looks like base64, decode it; otherwise write raw JSON
    const isBase64 = /^[A-Za-z0-9+/=\r\n]+$/.test(val) && val.length % 4 === 0;
    if (isBase64) {
      writeGoogleServices(Buffer.from(val, 'base64'));
    } else {
      writeGoogleServices(val);
    }
  } catch (e) {
    console.warn('Failed to write GOOGLE_SERVICES_JSON', e);
  }
}
module.exports = {
  expo: {
    name: "Elazığ Şehir",
    slug: "elazig-sehir",
    version: "1.2.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "elazigsehir",
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.crowroser.elazigsehir",
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "Yakındaki otobüs duraklarını ve dolum bayilerini haritada gösterebilmek ve en yakın durakları listeleyebilmek için konumunuza ihtiyaç duyulmaktadır.",
        NSCameraUsageDescription: "Kampüs ilan panosuna ilan verirken fotoğraf çekebilmeniz için kamera izni gerekmektedir.",
        NSPhotoLibraryUsageDescription: "Kampüs ilan panosuna ilan verirken galerinizden fotoğraf seçebilmeniz için galeri izni gerekmektedir.",
        NFCReaderUsageDescription: "ElazığKart bakiyenizi NFC ile okuyabilmek için NFC erişim izni gerekmektedir."
      }
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#0F2A4A",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png"
      },
      package: "com.crowroser.elazigsehir",
      versionCode: 11,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
      permissions: ["android.permission.NFC"]
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          resizeMode: "contain",
          backgroundColor: "#0F2A4A"
        }
      ],
      "expo-asset",
      "expo-secure-store",
      "react-native-nfc-manager",
      [
        "expo-notifications",
        {
          icon: "./assets/images/android-icon-monochrome.png",
          color: "#0F2A4A"
        }
      ],
      "./plugins/withElazigWidgets"
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      router: {},
      eas: {
        projectId: "5dea60fa-ea90-4501-8060-e465c83b67d3"
      }
    }
  }
};