import type { CapacitorConfig } from '@capacitor/cli';

// App aparte "Recambios" (solo Pedidos de Piezas). La web se construye en
// ../client con `npm run build:recambios` y sale en client/dist-recambios.
const config: CapacitorConfig = {
  appId: 'com.chatgorithm.recambios',
  appName: 'Recambios',
  webDir: '../client/dist-recambios',
  plugins: {
    // La barra de estado NO se solapa con la web (overlay false en RecambiosApp.tsx).
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK' as any,
      backgroundColor: '#0f172a'
    }
  }
};

export default config;
