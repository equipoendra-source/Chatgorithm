import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Build de la app aparte "Recambios" (solo Pedidos de Piezas).
// Sale en dist-recambios/ con el HTML renombrado a index.html, que es lo que
// espera Capacitor (ver ../recambios-app/capacitor.config.ts).
//   Desarrollo:  npm run dev:recambios  →  http://localhost:5174/recambios.html
//   Producción:  npm run build:recambios
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'recambios-html-as-index',
      enforce: 'post',
      generateBundle(_options, bundle) {
        for (const file of Object.values(bundle)) {
          if (file.fileName === 'recambios.html') file.fileName = 'index.html';
        }
      },
    },
  ],
  base: '/',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5174, strictPort: true },
  build: {
    outDir: 'dist-recambios',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: { recambios: path.resolve(__dirname, 'recambios.html') },
    },
  },
});
