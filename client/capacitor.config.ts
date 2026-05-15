import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chatgorithm.app',
  appName: 'Chatgorim',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    LocalNotifications: {
      smallIcon: "ic_launcher",
      iconColor: "#2563EB",
      sound: "notification"
    },
    // El WebView se redimensiona al abrir el teclado → el input del chat
    // no queda tapado. 'native' es el modo más fiable en Android.
    Keyboard: {
      resize: "native" as any
    },
    // La barra de estado NO se solapa con la web (overlay false en App.tsx).
    StatusBar: {
      overlaysWebView: false,
      style: "DARK" as any,
      backgroundColor: "#0f172a"
    }
  }
};

export default config;
