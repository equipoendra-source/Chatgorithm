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
    }
  }
};

export default config;
